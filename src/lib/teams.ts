import { strokesOnHole } from '@/lib/roundMath';
import { shuffled } from '@/lib/wolf';
import type { Hole } from '@/data/seed';

// Teams for a round: who is on which team, and what a team's score is.
//
// Pure — no React, no network, no global hole data. Covered by
// `npm run check:teams` (scripts/check-teams.js), which is the only reason to
// trust the draft is actually balanced and that a team total can't quietly
// count a hole somebody hasn't played.
//
// Nothing here is stored. `team_games` holds the terms and `team_members` holds
// the assignments; every figure — a team's strokes, its to-par, who leads — is
// recomputed from those plus posted scores (CLAUDE.md rule 3).

export type TeamFormat = 'bestball' | 'total';

/**
 * How much handicap a player actually gets.
 *
 * - `gross` — none. The ball as it lies.
 * - `net` — their full course handicap.
 * - `lowman` — the difference between their handicap and the best player's, so
 *   the low man plays off scratch and everyone else gets the gap. Standard in a
 *   fourball, and it keeps the shots being given inside the group rather than
 *   handing everybody strokes against par.
 */
export type HandicapMode = 'gross' | 'net' | 'lowman';

export type DraftPlayer = { id: string; handicap: number };

/** A stretch of holes carrying its own set of teams. */
export type Segment = { label: string; holes: number[] };

export type TeamStanding = {
  teamIndex: number;
  letter: string;
  playerIds: string[];
  /** Strokes over the holes every member has posted. null when that's none. */
  strokes: number | null;
  /** Relative to par over those same holes, so it's comparable across teams. */
  toPar: number | null;
  /** How many holes actually counted — the honest denominator for `strokes`. */
  holesCounted: number;
  /** Holes in the segment still waiting on somebody's score. */
  holesPending: number;
};

export const TEAM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const teamLetter = (index: number) => TEAM_LETTERS[index] ?? `T${index + 1}`;

export const formatName = (format: TeamFormat) =>
  format === 'bestball' ? 'Best ball' : 'Team total';

/** What to call the handicap mode on screen, so a figure is never unlabelled. */
export const handicapName = (mode: HandicapMode) =>
  mode === 'net' ? 'net' : mode === 'lowman' ? 'off the low man' : 'gross';

/**
 * The stretches of holes that each carry their own teams.
 *
 * Re-drawing at the turn is only possible when there is a turn: an even number
 * of holes, at least ten of them. A nine-hole round has one set of teams however
 * the setting is left, rather than pretending to split at hole 4.5.
 *
 * Split by position, never by hole number — the back nine is holes 10–18, and a
 * round can legitimately start at hole 10.
 */
export function segmentsFor(holes: Hole[], redrawAtTurn: boolean): Segment[] {
  const numbers = holes.map((h) => h.hole);
  if (!numbers.length) return [{ label: 'ALL', holes: [] }];

  const canSplit = redrawAtTurn && numbers.length >= 10 && numbers.length % 2 === 0;
  if (!canSplit) {
    return [{ label: `HOLES ${numbers[0]}–${numbers[numbers.length - 1]}`, holes: numbers }];
  }

  const half = numbers.length / 2;
  const first = numbers.slice(0, half);
  const second = numbers.slice(half);
  return [
    { label: `FIRST ${half} · ${first[0]}–${first[half - 1]}`, holes: first },
    { label: `LAST ${half} · ${second[0]}–${second[half - 1]}`, holes: second },
  ];
}

/** Most teams of `size` that `playerCount` players can fill. */
export const maxTeamsFor = (playerCount: number, size: number) =>
  Math.max(1, Math.floor(playerCount / Math.max(1, size)));

/** How far apart the strongest and weakest team are, by handicap total. */
export function handicapSpread(teams: string[][], players: DraftPlayer[]): number {
  const hcp = new Map(players.map((p) => [p.id, p.handicap]));
  const sums = teams.map((t) => t.reduce((n, id) => n + (hcp.get(id) ?? 0), 0));
  if (!sums.length) return 0;
  return Math.max(...sums) - Math.min(...sums);
}

/** Two draws are the same draw if the same people are together, letters aside. */
const pairingKey = (teams: string[][]) =>
  teams
    .map((t) => t.slice().sort().join('+'))
    .sort()
    .join('|');

/**
 * Deterministic PRNG (mulberry32), so a draft is stable across a reload and
 * identical on every phone. `Math.random` here would redraw the teams every
 * time the screen re-rendered.
 */
function seededRandom(seed: number): () => number {
  let a = (seed + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One candidate draw: each tier ordered, then dealt out snake-fashion.
 *
 * Seed 0 is the plain snake — lowest handicap with highest, straight down the
 * card — so the textbook draft is always among the candidates. Later seeds
 * shuffle within each tier, which is what produces alternatives that are still
 * one-player-per-tier.
 */
function arrange(tiers: DraftPlayer[][], teamCount: number, seed: number): string[][] {
  const random = seededRandom(seed);
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  tiers.forEach((tier, row) => {
    const order = seed === 0 ? tier : shuffled(tier, random);
    // Alternate direction each tier — the snake. Without it the lowest handicap
    // and the second-lowest always land on the same team.
    order.forEach((p, i) => teams[row % 2 ? teamCount - 1 - i : i].push(p.id));
  });
  return teams;
}

// Enough candidate draws to have a genuine choice of fair ones, few enough to
// stay instant with a field on the screen. Rotating each tier instead — which is
// what the prototype did — yields only one fair arrangement however many teams
// there are, so every re-draw after the first was lopsided.
const CANDIDATE_DRAWS = 240;

/**
 * Snake draft by handicap.
 *
 * Players are sorted by handicap and cut into tiers — the lowest `teamCount`
 * players, then the next `teamCount`, and so on. Every team takes exactly one
 * player from each tier, and the tiers are snaked so the two best players can't
 * end up together.
 *
 * `seg` picks a different draw, which is what a re-draw at the turn needs
 * (CLAUDE.md rule 7 — a fixed draw hands the same player the same partner every
 * week, at the same course). Candidates are ranked by handicap spread, so `seg`
 * 0 is the fairest draw available and each re-draw is the fairest of the ones
 * that actually change who plays with whom.
 *
 * This deviates from the prototype's `draftTeams`, which rotated each tier by
 * `seg * (row + 1)`. With two teams that rotates the first tier and not the
 * second, breaking the snake it exists to preserve: a re-draw of four players
 * with handicaps 2, 8, 14 and 22 came out 2+14 against 8+22 — a 14-shot spread
 * in a game that had just been balanced to 2. Harmless in a 300-player field,
 * wrong for a fourball, and a fourball is what actually gets played.
 *
 * Balance and variety genuinely conflict in a small group: four players have
 * only three possible pairings, and only one of them is fair. Ranking makes that
 * trade-off explicit and always takes the fairest option left, rather than
 * landing on a lopsided draw by accident.
 *
 * Players past `teamCount * size` are left out and belong in the unassigned
 * pool; the caller decides what to do about them.
 */
export function draftTeams(
  players: DraftPlayer[],
  size: number,
  teamCount: number,
  seg: number,
): string[][] {
  const n = Math.max(1, teamCount);
  const perTeam = Math.max(1, size);
  const sorted = players
    .slice()
    // Ties broken by id so the same field always drafts the same way — an
    // unstable sort would reshuffle teams on a reload.
    .sort((a, b) => a.handicap - b.handicap || a.id.localeCompare(b.id))
    .slice(0, n * perTeam);

  const tiers: DraftPlayer[][] = [];
  for (let row = 0; row < perTeam; row++) {
    const tier = sorted.slice(row * n, row * n + n);
    if (tier.length) tiers.push(tier);
  }
  if (!tiers.length) return Array.from({ length: n }, () => []);

  const distinct = new Map<string, string[][]>();
  for (let seed = 0; seed < CANDIDATE_DRAWS; seed++) {
    const teams = arrange(tiers, n, seed);
    const key = pairingKey(teams);
    if (!distinct.has(key)) distinct.set(key, teams);
  }

  const ranked = [...distinct.entries()].sort(
    (a, b) =>
      handicapSpread(a[1], sorted) - handicapSpread(b[1], sorted) || a[0].localeCompare(b[0]),
  );

  return ranked[((seg % ranked.length) + ranked.length) % ranked.length][1];
}

/** Everyone in the round who isn't on a team yet. */
export function unassignedFrom(playerIds: string[], teams: string[][]): string[] {
  const taken = new Set(teams.flat());
  return playerIds.filter((id) => !taken.has(id));
}

/**
 * Put a player on a team, taking them off whichever team they were on.
 *
 * `teamIndex` of -1 drops them back into the unassigned pool. A player is never
 * on two teams at once, which the database also enforces — being on two teams
 * would make a best ball count their score twice.
 */
export function moveToTeam(teams: string[][], playerId: string, teamIndex: number): string[][] {
  const next = teams.map((t) => t.filter((id) => id !== playerId));
  if (teamIndex >= 0 && teamIndex < next.length) next[teamIndex].push(playerId);
  return next;
}

export type ScoreLookup = (hole: number, playerId: string) => number | null;

/** Handicap strokes a player gets on a hole. Gross play is the zero case. */
export type StrokesLookup = (hole: number, playerId: string) => number;

export const NO_STROKES: StrokesLookup = () => 0;

/**
 * The handicap each player actually plays off, for a given mode.
 *
 * Separate from the allocation on purpose: this decides *how many* strokes a
 * player gets, `strokesOnHole` decides *which holes* they fall on. Mixing the
 * two is how allowance rules end up quietly reimplemented per format.
 *
 * `players` is the pool the game is between — for `lowman` that matters, since
 * the baseline is the best handicap actually playing in it. Nobody ever comes
 * out below scratch: the low man plays off zero, not into minus figures.
 */
export function allowanceFor(players: DraftPlayer[], mode: HandicapMode): DraftPlayer[] {
  if (mode === 'gross') return players.map((p) => ({ ...p, handicap: 0 }));
  if (mode === 'net') return players.slice();
  if (!players.length) return [];
  const low = Math.min(...players.map((p) => p.handicap));
  return players.map((p) => ({ ...p, handicap: Math.max(0, p.handicap - low) }));
}

/**
 * Strokes each player receives per hole, off the stroke index.
 *
 * Uses `strokesOnHole` from roundMath rather than repeating the allocation rule,
 * so a player's net here always matches the net on their own card. Pass the
 * handicaps through `allowanceFor` first when the game isn't played off full
 * handicaps.
 *
 * Known simplification, shared with the rest of the app: the full course
 * handicap is used even on a nine-hole round, where convention is to halve it.
 */
export function strokesLookupFor(holes: Hole[], players: DraftPlayer[]): StrokesLookup {
  const byHole = new Map(holes.map((h) => [h.hole, h]));
  const hcp = new Map(players.map((p) => [p.id, p.handicap]));
  return (hole, playerId) => {
    const h = byHole.get(hole);
    if (!h) return 0;
    return strokesOnHole(h, hcp.get(playerId) ?? 0);
  };
}

/**
 * What a team scored on one hole, or null if the hole isn't finished.
 *
 * A hole counts only once every member has posted it. Half a best ball is not a
 * best ball — the number would drop the moment the last player posts, so showing
 * it as the team's score would be showing a score for a hole that hasn't been
 * played (CLAUDE.md rule 4). This is the same rule Wolf uses for a pending hole.
 *
 * With `strokesFor` supplied the comparison is on net scores, which is the whole
 * point of a net best ball: the low *net* ball wins the hole, not the low gross
 * one. Taking the low gross and then deducting a stroke would credit the wrong
 * player's shot.
 */
export function teamHoleScore(
  format: TeamFormat,
  playerIds: string[],
  hole: number,
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup = NO_STROKES,
): number | null {
  if (!playerIds.length) return null;
  const strokes: number[] = [];
  for (const id of playerIds) {
    const s = scoreFor(hole, id);
    if (s == null) return null;
    strokes.push(s - strokesFor(hole, id));
  }
  return format === 'bestball' ? Math.min(...strokes) : strokes.reduce((a, b) => a + b, 0);
}

/**
 * A team's score over a segment, and how much of it is actually in.
 *
 * `toPar` is measured against the same holes that counted, so a team two holes
 * behind isn't flattered by the holes it hasn't played. For a team total the par
 * baseline is par × the number of players, because that format adds up every
 * card.
 */
export function teamScoreOver(
  format: TeamFormat,
  playerIds: string[],
  segmentHoles: number[],
  holes: Hole[],
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup = NO_STROKES,
): { strokes: number | null; toPar: number | null; holesCounted: number; holesPending: number } {
  const parOf = new Map(holes.map((h) => [h.hole, h.par]));
  let strokes = 0;
  let par = 0;
  let counted = 0;
  let pending = 0;

  for (const hole of segmentHoles) {
    const s = teamHoleScore(format, playerIds, hole, scoreFor, strokesFor);
    if (s == null) {
      pending++;
      continue;
    }
    strokes += s;
    par += (parOf.get(hole) ?? 0) * (format === 'total' ? playerIds.length : 1);
    counted++;
  }

  if (!counted) return { strokes: null, toPar: null, holesCounted: 0, holesPending: pending };
  return { strokes, toPar: strokes - par, holesCounted: counted, holesPending: pending };
}

/**
 * Every team's standing over a segment, best first.
 *
 * Teams with nothing posted sort last rather than leading on zero — an empty
 * card is not a good one.
 */
export function teamStandings(
  teams: string[][],
  format: TeamFormat,
  segmentHoles: number[],
  holes: Hole[],
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup = NO_STROKES,
): TeamStanding[] {
  return teams
    .map((playerIds, teamIndex) => {
      const score = teamScoreOver(format, playerIds, segmentHoles, holes, scoreFor, strokesFor);
      return { teamIndex, letter: teamLetter(teamIndex), playerIds, ...score };
    })
    .sort((a, b) => {
      if (a.toPar == null && b.toPar == null) return a.teamIndex - b.teamIndex;
      if (a.toPar == null) return 1;
      if (b.toPar == null) return -1;
      // More holes in the ground breaks a tie — being level after nine beats
      // being level after two.
      return a.toPar - b.toPar || b.holesCounted - a.holesCounted || a.teamIndex - b.teamIndex;
    });
}
