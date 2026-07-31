import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { mineInRoster } from '@/lib/claim';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { usePendingInvites } from '@/hooks/usePendingInvites';
import type { PendingInvite } from '@/lib/invite';
import { useActiveRound } from '@/hooks/useActiveRound';
import { useLiveScores } from '@/hooks/useLiveScores';
import { usePhoneAuth } from '@/hooks/usePhoneAuth';
import { useMyProfile } from '@/hooks/useMyProfile';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { useRoundCourse } from '@/hooks/useRoundCourse';
import { useHoleGames } from '@/hooks/useHoleGames';
import { useRoundPlayers } from '@/hooks/useRoundPlayers';
import { useTeams } from '@/hooks/useTeams';
import { useWolf } from '@/hooks/useWolf';

type RoundContextValue = ReturnType<typeof useLiveScores> &
  ReturnType<typeof useRoundPlayers> &
  ReturnType<typeof useRoundCourse> &
  ReturnType<typeof usePlayerIdentity> &
  ReturnType<typeof usePhoneAuth> &
  ReturnType<typeof useMyProfile> &
  ReturnType<typeof useWolf> &
  ReturnType<typeof useTeams> &
  ReturnType<typeof useHoleGames> &
  ReturnType<typeof usePendingInvites> &
  ReturnType<typeof useActiveRound> & {
    joinInvite: (invite: PendingInvite) => Promise<string | null>;
    declineInvite: (roundId: string) => Promise<void>;
  };

const RoundContext = createContext<RoundContextValue | null>(null);

// One source of round state for the whole app, mounted once at the tabs layout.
//
// Everything hangs off `activeRoundId`. Each hook takes it and resets its own
// state when it changes, so switching rounds can't leave one round's scores,
// roster, card or wolf ledger showing against another's.
//
// Two reasons this is a provider rather than a hook each screen calls:
//
// 1. Realtime channels are named per topic. Two independent useLiveScores()
//    instances open two channels with the same name, and Supabase rejects the
//    second `postgres_changes` subscription on a topic that already has one —
//    which crashed the app as soon as two tabs were mounted.
// 2. Identity, roster and the active round are shared state. Picking a player,
//    adding one, choosing a course or switching round has to be visible on every
//    tab immediately, not just the one that made the change.
export function RoundProvider({ children }: { children: ReactNode }) {
  const identity = usePlayerIdentity();
  // Signing in proves whose phone this is. Which player row that person is in a
  // given round stays `usePlayerIdentity`'s job for now — the two are separate
  // on purpose, and joining a round is never automatic.
  const auth = usePhoneAuth();
  // Who this phone is, independent of any round. Reading it out of the open
  // round's roster made the app forget you the moment you opened a round you
  // weren't in.
  const profile = useMyProfile(identity.myId, auth.userId);
  const round = useActiveRound();
  const roundId = round.activeRoundId;
  const scores = useLiveScores(roundId);
  const roster = useRoundPlayers(roundId, identity.myId);
  const course = useRoundCourse(roundId, identity.myId);
  // Signing in on a second phone shouldn't ask who you are again. If a row in
  // this round already belongs to your account, that isn't a claim to make —
  // it's a fact to read, so adopt it.
  //
  // Only ever adopts a row you already own. Taking an *unclaimed* row still
  // needs a deliberate tap, because guessing wrong seats you as somebody else
  // and hands you their scorecard.
  const mine = mineInRoster(roster.players, auth.userId);
  useEffect(() => {
    if (mine && identity.myId !== mine.id) identity.choose(mine.id);
  }, [mine, identity]);

  /**
   * The same recognition, without needing a round to do it in.
   *
   * With no rounds the roster is empty, so the adoption above never fires — and
   * a signed-in phone whose stored player id is stale or missing then owns
   * nothing as far as the policies are concerned. Every write is refused,
   * including the one that would create the round that would give it a roster.
   *
   * Only ever adopts a row `my_players()` says is already yours, so this is
   * still reading a fact rather than taking a seat. Taking an *unclaimed* row
   * remains a deliberate tap.
   */
  const ownedByMe = profile.myOwnedPlayers;
  useEffect(() => {
    if (!auth.userId || ownedByMe.length === 0) return;
    if (identity.myId && ownedByMe.some((p) => p.id === identity.myId)) return;
    identity.choose(ownedByMe[0].id);
  }, [auth.userId, ownedByMe, identity]);

  // Rounds waiting for this phone. Deliberately given an empty "already joined"
  // list: `rounds` is every round in the database while RLS is still open, so
  // passing it would filter away every invitation there is. The hook works out
  // acceptance from the player rows themselves — a row linked to your account is
  // one you took — which is true whatever the policies say.
  const pending = usePendingInvites(auth.userId, []);

  /**
   * Take the seat somebody made for you.
   *
   * Three things, in an order that matters: claim the row so it is yours on
   * every device, make this phone that player, then open the round. Claiming
   * last would leave a phone seated as a player it doesn't own.
   */
  const joinInvite = useCallback(
    async (invite: PendingInvite): Promise<string | null> => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.rpc('claim_player', { p_player_id: invite.playerId });
        if (error) {
          console.warn('joinInvite failed:', error.message);
          return error.message;
        }
      }
      await identity.choose(invite.playerId);
      await round.switchRound(invite.roundId);
      await round.loadRounds();
      await pending.refreshInvites();
      return null;
    },
    [identity, round, pending],
  );

  const playerIds = useMemo(() => roster.players.map((p) => p.id), [roster.players]);
  const wolf = useWolf(roundId, playerIds, course.holes, scores.scores);
  const teams = useTeams(roundId, roster.players, course.holes, scores.scores, round.scoringMode);
  const holeGames = useHoleGames(roundId, playerIds);
  return (
    <RoundContext.Provider
      value={{
        ...identity,
        ...auth,
        ...profile,
        ...round,
        ...scores,
        ...roster,
        ...course,
        ...wolf,
        ...teams,
        ...holeGames,
        ...pending,
        joinInvite,
        declineInvite: pending.decline,
      }}
    >
      {children}
    </RoundContext.Provider>
  );
}

export function useRound() {
  const ctx = useContext(RoundContext);
  if (!ctx) throw new Error('useRound must be used within a RoundProvider');
  return ctx;
}
