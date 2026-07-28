import type { Hole } from '@/data/seed';
// From the lib that owns it, not from the hook that re-exports it — this module
// is pure maths and must not pull React and Supabase in behind a type import.
import type { ScoreMap } from '@/lib/scoreOutbox';

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

// Standard stroke allocation for one hole: a player gets a stroke on any hole
// whose difficulty ranking (`hole.handicap`, the stroke index) is at or under
// their handicap. A handicap above 18 wraps, taking a second stroke on the
// hardest holes.
//
// This is the single definition of the rule. Net team scoring uses it too
// (src/lib/teams.ts) — a second implementation would eventually disagree with
// this one, and a player's net on their card would stop matching their net in
// the team's best ball.
export function strokesOnHole(hole: Hole, handicap: number): number {
  if (handicap <= 0) return 0;
  return Math.floor(handicap / 18) + (hole.handicap <= handicap % 18 ? 1 : 0);
}

// Strokes a player receives across the holes they've actually played. Only
// counts played holes, so net is never computed for a hole that hasn't posted.
export function strokesReceivedFor(
  holes: Hole[],
  scores: ScoreMap,
  playerId: string,
  handicap: number,
): number {
  let count = 0;
  for (const hole of holes) {
    if (scores[hole.hole]?.[playerId] == null) continue;
    count += strokesOnHole(hole, handicap);
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

export type CardHole = { hole: number; par: number; yards: number; strokes: number | null };
export type CardBlock = {
  label: string;
  holes: CardHole[];
  parTotal: number;
  /** Yardage of the tee actually being played, straight off the round's card. */
  yardsTotal: number;
  total: number | null;
};

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
      yards: h.yards,
      strokes: scores[h.hole]?.[playerId] ?? null,
    }));
    const played = rows.filter((r) => r.strokes != null);
    return {
      label,
      holes: rows,
      parTotal: parTotalFor(subset),
      yardsTotal: subset.reduce((a, h) => a + (h.yards ?? 0), 0),
      total: played.length === rows.length && rows.length > 0
        ? played.reduce((a, r) => a + (r.strokes ?? 0), 0)
        : null,
    };
  };
  if (holes.length <= 9) return [block('HOLES', holes)];
  return [block('OUT', holes.slice(0, 9)), block('IN', holes.slice(9))];
}
