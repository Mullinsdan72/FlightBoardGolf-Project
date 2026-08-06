import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { pendingInvites, type PendingInvite } from '@/lib/invite';

const DECLINED_KEY = 'flightboard.declinedInvites';

/**
 * Rounds somebody has put you in that you haven't joined.
 *
 * The whole thing hangs off `my_invitations()`, which is the only way a phone
 * can know an invitation is for *it*: the organizer typed your mobile number,
 * and the function matches it against the number you signed in with. No sign-in
 * means no invitations — not an error, just nothing to say.
 *
 * `security definer`, for two reasons that both matter. The match is against
 * `auth.users.phone`, which the app cannot read. And under RLS a guest cannot
 * read `round_players` or `rounds` for a round they are not yet in — which is
 * every round they have been invited to. Doing this as ordinary queries found
 * nothing, showed no invitation, and dropped somebody who had been put in a
 * round onto the first-run screen to create a second one.
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

  /**
   * Fetch the invitations, and hand back the ones worth acting on.
   *
   * It returns the list as well as storing it because of the one moment that
   * matters most: signing in. That is when a phone first becomes *able* to see
   * its invitations, and the caller has to act on the answer immediately rather
   * than wait for a re-render — the old flow dropped a freshly signed-in guest
   * back into an already-decided layout, so the invitation they had just become
   * able to see was never looked for.
   *
   * The declined list is read from storage here rather than closed over, so
   * this function never has to depend on it. Depending on it would rebuild
   * `load`, which would retrigger the effect that calls `load`.
   */
  const load = useCallback(async (): Promise<PendingInvite[]> => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setInvites([]);
      return [];
    }
    // One `security definer` call, not three queries. Reading `round_players`
    // and `rounds` directly is gated on `is_round_member`, which a guest whose
    // row is still unclaimed is not — so the lookup found nothing, no
    // invitation ever appeared, and somebody who had been put in a round was
    // shown the first-run screen and invited to create a second one.
    const { data, error } = await supabase.rpc('my_invitations');
    if (error || !data) {
      // Settled, even though it failed. A flag that gates a whole render must
      // be set on the failure path too.
      if (error) console.warn('my_invitations failed:', error.message);
      setInvites([]);
      return [];
    }
    const found: PendingInvite[] = (data as any[]).map((r) => ({
      playerId: r.player_id,
      playerName: r.player_name ?? 'you',
      roundId: r.round_id,
      roundName: r.round_name ?? '',
      courseName: r.course_name ?? '',
      playedOn: r.played_on ?? null,
    }));
    setInvites(found);

    let alreadyDeclined: string[] = [];
    try {
      const raw = await AsyncStorage.getItem(DECLINED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) alreadyDeclined = parsed.filter((x) => typeof x === 'string');
    } catch {
      // Corrupt storage is not a reason to hide an invitation.
    }
    return pendingInvites(found, { joinedRoundIds: [], declinedRoundIds: alreadyDeclined });
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
