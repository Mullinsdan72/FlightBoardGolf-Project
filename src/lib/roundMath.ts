import { HOLES } from '@/data/seed';
import type { ScoreMap } from '@/hooks/useLiveScores';

// Derived, never stored: a player's standing is always computed from the
// posted scores, so a card and a leaderboard row can never disagree.
export function toParFor(scores: ScoreMap, playerId: string): number {
  let total = 0;
  for (const hole of HOLES) {
    const strokes = scores[hole.hole]?.[playerId];
    if (strokes != null) total += strokes - hole.par;
  }
  return total;
}

export function thruFor(scores: ScoreMap, playerId: string): number {
  let count = 0;
  for (const hole of HOLES) {
    if (scores[hole.hole]?.[playerId] != null) count++;
  }
  return count;
}

export function parFor(hole: number): number {
  return HOLES[hole - 1]?.par ?? 4;
}
