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

// Standard stroke allocation: a player gets a stroke on any hole whose
// difficulty ranking is at or under their handicap. Only counts holes
// actually played, so net is never computed for a hole that hasn't posted.
export function strokesReceivedFor(scores: ScoreMap, playerId: string, handicap: number): number {
  let count = 0;
  for (const hole of HOLES) {
    if (scores[hole.hole]?.[playerId] != null && hole.handicap <= handicap) count++;
  }
  return count;
}

export function netToParFor(scores: ScoreMap, playerId: string, handicap: number): number {
  return toParFor(scores, playerId) - strokesReceivedFor(scores, playerId, handicap);
}

// Gross Stableford, matching the design exactly: 2 pts for par, +1 per shot
// better, -1 per shot worse, floored at 0. Only counts played holes.
export function stablefordFor(scores: ScoreMap, playerId: string): number {
  let total = 0;
  for (const hole of HOLES) {
    const strokes = scores[hole.hole]?.[playerId];
    if (strokes != null) total += Math.max(0, 2 + (hole.par - strokes));
  }
  return total;
}

export type CardHole = { hole: number; par: number; strokes: number | null };
export type CardBlock = { label: string; holes: CardHole[]; parTotal: number; total: number | null };

// Never asserts a score for an unplayed hole (CLAUDE.md rule 4) — `strokes`
// is null until that hole has actually posted.
export function cardBlocksFor(scores: ScoreMap, playerId: string): CardBlock[] {
  const front = HOLES.slice(0, 9);
  const back = HOLES.slice(9);
  const block = (label: string, holes: typeof front): CardBlock => {
    const rows: CardHole[] = holes.map((h) => ({ hole: h.hole, par: h.par, strokes: scores[h.hole]?.[playerId] ?? null }));
    const played = rows.filter((r) => r.strokes != null);
    return {
      label,
      holes: rows,
      parTotal: holes.reduce((a, h) => a + h.par, 0),
      total: played.length === rows.length ? played.reduce((a, r) => a + (r.strokes ?? 0), 0) : null,
    };
  };
  return [block('OUT', front), block('IN', back)];
}
