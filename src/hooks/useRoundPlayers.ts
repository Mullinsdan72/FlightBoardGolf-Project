import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { PLAYERS as SEED_PLAYERS, ROUND_ID } from '@/data/seed';
import type { SeedPlayer } from '@/data/seed';

type Row = { player_id: string; players: { id: string; name: string; handicap: number } | null };

// The round's actual roster — who's in this group.
//
// When Supabase is configured it is the only source of truth, including when it
// says the roster is empty. It must not fall back to the seed players in that
// case: doing so made removing everyone impossible, because deleting the last
// player brought all four hardcoded ones straight back.
export function useRoundPlayers(myId: string | null | undefined) {
  const [players, setPlayers] = useState<SeedPlayer[]>(isSupabaseConfigured ? [] : SEED_PLAYERS);
  const [playersLoaded, setPlayersLoaded] = useState(!isSupabaseConfigured);
  const [organizerId, setOrganizerId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const [rosterRes, roundRes] = await Promise.all([
      supabase.from('round_players').select('player_id, players(id, name, handicap)').eq('round_id', ROUND_ID),
      supabase.from('rounds').select('organizer_player_id').eq('id', ROUND_ID).maybeSingle(),
    ]);
    if (rosterRes.error || !rosterRes.data) {
      console.warn('useRoundPlayers fetch failed:', rosterRes.error?.message);
      return;
    }
    const rows = rosterRes.data as unknown as Row[];
    setPlayers(
      rows
        .map((r) => r.players)
        .filter((p): p is NonNullable<Row['players']> => p != null)
        .map((p) => ({ id: p.id, name: p.name, handicap: p.handicap }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setOrganizerId((roundRes.data as any)?.organizer_player_id ?? null);
    setPlayersLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const claimOrganizer = useCallback(
    async (playerId: string | null): Promise<string | null> => {
      setOrganizerId(playerId);
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase
        .from('rounds')
        .update({ organizer_player_id: playerId })
        .eq('id', ROUND_ID);
      if (error) {
        console.warn('claimOrganizer failed:', error.message);
        await refresh();
        return error.message;
      }
      return null;
    },
    [refresh],
  );

  const addPlayer = useCallback(
    async (name: string, handicap: number) => {
      if (!isSupabaseConfigured || !supabase) {
        // Local-only fallback: keep it in memory for this session.
        setPlayers((prev) => [...prev, { id: `local-${Date.now()}`, name, handicap }]);
        return;
      }
      const { data: inserted, error: playerErr } = await supabase
        .from('players')
        .insert({ name, handicap })
        .select('id')
        .single();
      if (playerErr || !inserted) {
        console.warn('addPlayer failed:', playerErr?.message);
        return;
      }
      const { error: linkErr } = await supabase
        .from('round_players')
        .insert({ round_id: ROUND_ID, player_id: inserted.id });
      if (linkErr) console.warn('addPlayer (round link) failed:', linkErr.message);
      await refresh();
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
        .eq('round_id', ROUND_ID)
        .eq('player_id', playerId);
      if (error) {
        console.warn('removePlayer failed, restoring:', error.message);
        await refresh();
      }
    },
    [refresh],
  );

  return {
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
