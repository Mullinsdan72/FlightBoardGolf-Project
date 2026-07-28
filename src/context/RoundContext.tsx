import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveScores } from '@/hooks/useLiveScores';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { useRoundCourse } from '@/hooks/useRoundCourse';
import { useRoundPlayers } from '@/hooks/useRoundPlayers';
import { useWolf } from '@/hooks/useWolf';

type RoundContextValue = ReturnType<typeof useLiveScores> &
  ReturnType<typeof useRoundPlayers> &
  ReturnType<typeof useRoundCourse> &
  ReturnType<typeof usePlayerIdentity> &
  ReturnType<typeof useWolf>;

const RoundContext = createContext<RoundContextValue | null>(null);

// One source of round state for the whole app, mounted once at the tabs layout.
//
// Two reasons this is a provider rather than a hook each screen calls:
//
// 1. Realtime channels are named per topic. Two independent useLiveScores()
//    instances open two channels with the same name, and Supabase rejects the
//    second `postgres_changes` subscription on a topic that already has one —
//    which crashed the app as soon as two tabs were mounted.
// 2. Identity and roster are shared state. Picking a player, adding one, or
//    choosing a course has to be visible on every tab immediately, not just
//    the one that made the change.
export function RoundProvider({ children }: { children: ReactNode }) {
  const identity = usePlayerIdentity();
  const scores = useLiveScores();
  const roster = useRoundPlayers(identity.myId);
  const course = useRoundCourse(identity.myId);
  const playerIds = useMemo(() => roster.players.map((p) => p.id), [roster.players]);
  const wolf = useWolf(playerIds, course.holes, scores.scores);
  return (
    <RoundContext.Provider value={{ ...identity, ...scores, ...roster, ...course, ...wolf }}>
      {children}
    </RoundContext.Provider>
  );
}

export function useRound() {
  const ctx = useContext(RoundContext);
  if (!ctx) throw new Error('useRound must be used within a RoundProvider');
  return ctx;
}
