import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { pendingInvites, type PendingInvite } from '@/lib/invite';

const DECLINED_KEY = 'flightboard.declinedInvites';

/**
 * Rounds somebody has put you in that you haven't joined.
 *
 * The whole thing hangs off `my_players()`, which is the only way a phone can
 * know an invitation is for *it*: the organizer typed your mobile number, and
 * the function matches it against the number you signed in with. No sign-in
 * means no invitations — not an error, just nothing to say — so this is silent
 * and empty until phone auth is delivering codes.
 *
 * `my_players()` is `security definer` because `players.user_id` must never be
 * writable directly. Reading through it here is the same reason: the match is
 * against `auth.users.phone`, which the app cannot see.
 */
export function usePendingInvites(userId: string | null | undefined, joinedRoundIds: string[]) {
  const [invites, setInvites] = useState<PendingInvite[] | undefined>(undefined);
  const [declined, setDeclined] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DECLINED_KEY)
      .then((raw) => {
        try {
          const parsed = raw ? JSON.parse(raw) : [];
          setDeclined(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
        } catch {
          // Corrupt storage is not a reason to nag or to hide. Start clean.
          setDeclined([]);
        }
      })
      .catch(() => setDeclined([]));
  }, []);

  const load = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setInvites([]);
      return;
    }
    const { data: mine, error } = await supabase.rpc('my_players');
    if (error || !mine) {
      // Settled, even though it failed. Leaving this undefined holds the tabs
      // layout on a blank screen — the failure mode this file's siblings have
      // shipped twice.
      if (error) console.warn('my_players failed:', error.message);
      setInvites([]);
      return;
    }
    const mineRows = mine as Array<{ id: string; user_id: string | null }>;
    const playerIds = mineRows.map((p) => p.id);
    // A row already linked to your account is one you have accepted. Rounds it
    // is in are yours to play, not yours to be asked about — which is also what
    // stops the question reappearing the moment you join.
    const claimed = new Set(mineRows.filter((p) => p.user_id === userId).map((p) => p.id));
    if (playerIds.length === 0) {
      setInvites([]);
      return;
    }

    const { data: memberships, error: mErr } = await supabase
      .from('round_players')
      .select('player_id, round_id, rounds(id, name, course_name, played_on), players(id, name)')
      .in('player_id', playerIds);
    if (mErr || !memberships) {
      if (mErr) console.warn('invite memberships failed:', mErr.message);
      setInvites([]);
      return;
    }

    const rows = memberships as unknown as Array<{
      player_id: string;
      round_id: string;
      rounds: { id: string; name: string | null; course_name: string | null; played_on: string | null } | null;
      players: { id: string; name: string } | null;
    }>;
    const acceptedRounds = new Set(rows.filter((r) => claimed.has(r.player_id)).map((r) => r.round_id));
    setInvites(
      rows
        .filter((r) => r.rounds != null && !acceptedRounds.has(r.round_id))
        .map((r) => ({
          playerId: r.player_id,
          playerName: r.players?.name ?? 'you',
          roundId: r.round_id,
          roundName: r.rounds!.name ?? '',
          courseName: r.rounds!.course_name ?? '',
          playedOn: r.rounds!.played_on ?? null,
        })),
    );
  }, [userId]);

  useEffect(() => {
    setInvites(undefined);
    load();
  }, [load]);

  /** "Not now" has to stick, or the question becomes something you dismiss unread. */
  const decline = useCallback(
    async (roundId: string) => {
      const next = Array.from(new Set([...(declined ?? []), roundId]));
      setDeclined(next);
      await AsyncStorage.setItem(DECLINED_KEY, JSON.stringify(next));
    },
    [declined],
  );

  const ready = invites !== undefined && declined !== undefined;
  return {
    invites: ready ? pendingInvites(invites!, { joinedRoundIds, declinedRoundIds: declined! }) : undefined,
    invitesReady: ready,
    decline,
    refreshInvites: load,
  };
}
