import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { PLAYERS as SEED_PLAYERS } from '@/data/seed';
import type { SeedPlayer } from '@/data/seed';

type Row = {
  player_id: string;
  players: { id: string; name: string; handicap: number; user_id: string | null; phone: string | null } | null;
};

// The round's actual roster — who's in this group.
//
// When Supabase is configured it is the only source of truth, including when it
// says the roster is empty. It must not fall back to the seed players in that
// case: doing so made removing everyone impossible, because deleting the last
// player brought all four hardcoded ones straight back.
export function useRoundPlayers(roundId: string | null | undefined, myId: string | null | undefined) {
  const [players, setPlayers] = useState<SeedPlayer[]>(isSupabaseConfigured ? [] : SEED_PLAYERS);
  const [playersLoaded, setPlayersLoaded] = useState(!isSupabaseConfigured);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  // Why the roster is empty, when it's empty because something broke rather
  // than because nobody has been added yet. The two look identical otherwise.
  const [playersError, setPlayersError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const [rosterRes, roundRes] = await Promise.all([
      supabase.from('round_players').select('player_id, players(id, name, handicap, user_id, phone)').eq('round_id', roundId),
      supabase.from('rounds').select('organizer_player_id').eq('id', roundId).maybeSingle(),
    ]);
    if (rosterRes.error || !rosterRes.data) {
      console.warn('useRoundPlayers fetch failed:', rosterRes.error?.message);
      // Mark it loaded anyway. Returning early here left `playersLoaded` false
      // forever, and SCORE, LEADERBOARD and CARD all gate their whole render on
      // it — so a failed fetch showed three blank white screens with nothing to
      // read and nothing to tap. A failure has to arrive as a failure; "still
      // loading" that never finishes is the worst thing a screen can say.
      setPlayersError(rosterRes.error?.message ?? 'Could not load the players in this round.');
      setPlayersLoaded(true);
      return;
    }
    setPlayersError(null);
    const rows = rosterRes.data as unknown as Row[];
    setPlayers(
      rows
        .map((r) => r.players)
        .filter((p): p is NonNullable<Row['players']> => p != null)
        .map((p) => ({ id: p.id, name: p.name, handicap: p.handicap, userId: p.user_id ?? null, phone: p.phone ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setOrganizerId((roundRes.data as any)?.organizer_player_id ?? null);
    setPlayersLoaded(true);
  }, [roundId]);

  // Clear on a round switch before refetching, so the previous round's roster
  // never shows briefly against the new round.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setPlayers([]);
    setOrganizerId(null);
    setPlayersError(null);
    setPlayersLoaded(false);
  }, [roundId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Somebody joining has to appear on everybody else's phone.
   *
   * Scores have been live since the beginning and the roster never was: it
   * refetched on a round switch and after this hook's own writes, which covers
   * the organizer adding somebody and nothing else. So a guest who joined by
   * code appeared on their own phone and on nobody else's, and the organizer —
   * looking at a leaderboard that did not have them on it — had no reason to
   * believe it had worked. That is the same blindness that produced duplicate
   * players, arriving by a different door.
   *
   * Two tables, because joining is two writes. `round_players` is the new seat;
   * `players` is somebody claiming a seat that already existed, which changes no
   * membership row at all but does change who owns the card. Watching only the
   * first would miss every invitation ever accepted.
   *
   * `players` cannot be filtered by round — it has no round column — so this
   * takes every player change and refetches. The roster is small and a refetch
   * is two queries; being right matters more here than being frugal.
   *
   * One channel, distinctly named. Supabase rejects a second `postgres_changes`
   * subscription on a topic that already has one, and this hook is mounted once
   * in `RoundProvider` precisely so that stays true.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const client = supabase;
    const channel = client
      .channel(`roster:${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` },
        () => {
          refresh();
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players' }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [roundId, refresh]);

  /**
   * And again whenever the app comes back to the foreground.
   *
   * A subscription is not a guarantee. It drops in a pocket, on a course with
   * bad signal, and silently when a table was never published in the first
   * place — which is exactly how the roster went stale unnoticed for weeks. The
   * cost of being wrong here is the organizer staring at a leaderboard missing
   * somebody who is standing next to them, so one refetch on wake is cheap
   * insurance. Same pattern the score outbox already uses, for the same reason.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !roundId) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [roundId, refresh]);

  const claimOrganizer = useCallback(
    async (playerId: string | null): Promise<string | null> => {
      setOrganizerId(playerId);
      if (!isSupabaseConfigured || !supabase || !roundId) return null;
      const { error } = await supabase
        .from('rounds')
        .update({ organizer_player_id: playerId })
        .eq('id', roundId);
      if (error) {
        console.warn('claimOrganizer failed:', error.message);
        await refresh();
        return error.message;
      }
      return null;
    },
    [roundId, refresh],
  );

  // Returns the new player's id, so a caller can become the player it just
  // created — which is what joining from an invite link needs. Null means the
  // add failed and nothing was created.
  const addPlayer = useCallback(
    async (name: string, handicap: number, phone: string | null = null): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase || !roundId) {
        // Local-only fallback: keep it in memory for this session.
        const localId = `local-${Date.now()}`;
        setPlayers((prev) => [...prev, { id: localId, name, handicap, phone }]);
        return localId;
      }
      const { data: inserted, error: playerErr } = await supabase
        .rpc('add_player_to_round', {
          p_round_id: roundId,
          p_name: name,
          p_handicap: handicap,
          p_phone: phone ?? null,
        });
      if (playerErr || !inserted) {
        // A plain insert cannot work here. Postgres requires a row created with
        // RETURNING to pass the SELECT policy too, and a brand new player has no
        // owner and belongs to no round — so it is invisible to the person who
        // just made it, and the whole statement comes back as a policy
        // violation. The function seats them in the round in the same call,
        // which is what makes the row readable afterwards.
        console.warn('addPlayer failed:', playerErr?.message);
        return null;
      }
      await refresh();
      return inserted.id as string;
    },
    [roundId, refresh],
  );

  /**
   * Take ownership of a player row — "that one is me".
   *
   * Goes through the `claim_player` function rather than updating the column,
   * because a directly writable `user_id` is "claim anybody", including the
   * organizer. The database refuses a row somebody else already owns; this
   * returns that refusal rather than swallowing it, since silently failing to
   * claim leaves you looking at a round you can't score in.
   */
  const claimPlayer = useCallback(
    async (playerId: string): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.rpc('claim_player', { p_player_id: playerId });
      if (error) {
        console.warn('claimPlayer failed:', error.message);
        return error.message;
      }
      await refresh();
      return null;
    },
    [refresh],
  );

  /**
   * Change a player's handicap.
   *
   * Optimistic, because every net figure and every team allowance is worked out
   * from this number and the screen has to move under your thumb. A failure
   * refetches rather than leaving the wrong number looking saved.
   */
  const setHandicap = useCallback(
    async (playerId: string, handicap: number): Promise<string | null> => {
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, handicap } : p)));
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.from('players').update({ handicap }).eq('id', playerId);
      if (error) {
        console.warn('setHandicap failed:', error.message);
        await refresh();
        return error.message;
      }
      return null;
    },
    [refresh],
  );

  /**
   * Give an existing player a number.
   *
   * Somebody added by name alone can never be invited and can never claim their
   * own row — phone sign-in matches accounts to players by number. Without this
   * that is a one-way door: the guest who later wants the app would need a
   * second player row, and a second scorecard.
   */
  const setPhone = useCallback(
    async (playerId: string, phone: string | null): Promise<string | null> => {
      setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, phone } : p)));
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.from('players').update({ phone }).eq('id', playerId);
      if (error) {
        console.warn('setPhone failed:', error.message);
        await refresh();
        return error.message;
      }
      return null;
    },
    [refresh],
  );

  const removePlayer = useCallback(
    async (playerId: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      if (!isSupabaseConfigured || !supabase) return;
      const { error } = await supabase
        .from('round_players')
        .delete()
        .eq('round_id', roundId)
        .eq('player_id', playerId);
      if (error) {
        console.warn('removePlayer failed, restoring:', error.message);
        await refresh();
      }
    },
    [roundId, refresh],
  );

  return {
    setHandicap,
    setPhone,
    playersError,
    claimPlayer,
    players,
    playersLoaded,
    addPlayer,
    removePlayer,
    refreshPlayers: refresh,
    organizerId,
    // Nobody claimed it yet counts as nobody being organizer, rather than
    // everybody — a card shouldn't be unlockable just because the role is empty.
    amOrganizer: !!myId && organizerId === myId,
    claimOrganizer,
  };
}
