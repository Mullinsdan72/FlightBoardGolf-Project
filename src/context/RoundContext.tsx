import { createContext, useContext, type ReactNode } from 'react';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useRoundPlayers } from '@/hooks/useRoundPlayers';

type RoundContextValue = ReturnType<typeof useLiveScores> & ReturnType<typeof useRoundPlayers>;

const RoundContext = createContext<RoundContextValue | null>(null);

// One Supabase realtime channel and one roster fetch for the whole app, not
// one per screen. Score entry and the leaderboard both need the same live
// scores; if each opened its own subscription to the same channel name, the
// second one crashes (Supabase rejects a duplicate `postgres_changes`
// subscription on the same topic) the moment both tabs are mounted at once.
export function RoundProvider({ children }: { children: ReactNode }) {
  const scores = useLiveScores();
  const roster = useRoundPlayers();
  return <RoundContext.Provider value={{ ...scores, ...roster }}>{children}</RoundContext.Provider>;
}

export function useRound() {
  const ctx = useContext(RoundContext);
  if (!ctx) throw new Error('useRound must be used within a RoundProvider');
  return ctx;
}
