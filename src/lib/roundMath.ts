import type { Hole } from '@/data/seed';
import type { ScoreMap } from '@/hooks/useLiveScores';

// Every function here takes the round's holes explicitly rather than reading a
// global. The card a round is played on comes from the course the organizer
// picked (and which nine, if it's a 9-hole round), so nothing can assume 18
// holes of a fixed par.
//
// "Holes in play" is the unit throughout: a 9-hole round's totals cover those
// nine holes only, and `complete` means every hole in play has posted.

// Derived, never stored: a player's standing is always computed from the
// posted scores, so a card and a leaderboard row can never disagree.
export function toParFor(holes: Hole[], scores: ScoreMap, playerId: string): number {
  let total = 0;
  for (const hole of holes) {
    const strokes = scores[hole.hole]?.[playerId];
    if (strokes != null) total += strokes - hole.par;
  }
  return total;
}

export function thruFor(holes: Hole[], scores: ScoreMap, playerId: string): number {
  let count = 0;
  for (const hole of holes) {
    if (scores[hole.hole]?.[playerId] != null) count++;
  }
  return count;
}

export function parTotalFor(holes: Hole[]): number {
  return holes.reduce((a, h) => a + h.par, 0);
}

// Gross strokes, only meaningful once the round is complete — callers gate on
// thruFor() === holes.length before showing it as a final figure.
export function grossFor(holes: Hole[], scores: ScoreMap, playerId: string): number {
  let total = 0;
  for (const hole of holes) {
    const strokes = scores[hole.hole]?.[playerId];
    if (strokes != null) total += strokes;
  }
  return total;
}

// Standard stroke allocation: a player gets a stroke on any hole whose
// difficulty ranking (stroke index) is at or under their handicap. A handicap
// above 18 wraps, taking a second stroke on the hardest holes. Only counts
// holes actually played, so net is never computed for a hole that hasn't posted.
export function strokesReceivedFor(
  holes: Hole[],
  scores: ScoreMap,
  playerId: string,
  handicap: number,
): number {
  let count = 0;
  for (const hole of holes) {
    if (scores[hole.hole]?.[playerId] == null) continue;
    count += Math.floor(handicap / 18);
    if (hole.handicap <= handicap % 18) count += 1;
  }
  return count;
}

export function netToParFor(holes: Hole[], scores: ScoreMap, playerId: string, handicap: number): number {
  return toParFor(holes, scores, playerId) - strokesReceivedFor(holes, scores, playerId, handicap);
}

// Gross Stableford, matching the design exactly: 2 pts for par, +1 per shot
// better, -1 per shot worse, floored at 0. Only counts played holes.
export function stablefordFor(holes: Hole[], scores: ScoreMap, playerId: string): number {
  let total = 0;
  for (const hole of holes) {
    const strokes = scores[hole.hole]?.[playerId];
    if (strokes != null) total += Math.max(0, 2 + (hole.par - strokes));
  }
  return total;
}

export type CardHole = { hole: number; par: number; strokes: number | null };
export type CardBlock = { label: string; holes: CardHole[]; parTotal: number; total: number | null };

// Splits the holes in play into the card's labelled blocks. A full 18 reads
// OUT/IN; a nine-hole round is a single block, since there is no "in" half to
// contrast it with. Never asserts a score for an unplayed hole (CLAUDE.md
// rule 4) — `strokes` stays null until that hole has actually posted, and a
// block total stays null until the whole block has.
export function cardBlocksFor(holes: Hole[], scores: ScoreMap, playerId: string): CardBlock[] {
  const block = (label: string, subset: Hole[]): CardBlock => {
    const rows: CardHole[] = subset.map((h) => ({
      hole: h.hole,
      par: h.par,
      strokes: scores[h.hole]?.[playerId] ?? null,
    }));
    const played = rows.filter((r) => r.strokes != null);
    return {
      label,
      holes: rows,
      parTotal: parTotalFor(subset),
      total: played.length === rows.length && rows.length > 0
        ? played.reduce((a, r) => a + (r.strokes ?? 0), 0)
        : null,
    };
  };
  if (holes.length <= 9) return [block('HOLES', holes)];
  return [block('OUT', holes.slice(0, 9)), block('IN', holes.slice(9))];
}
