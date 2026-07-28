import { teamHoleScore, type ScoreLookup, type StrokesLookup, type TeamFormat } from '@/lib/teams';

// Team challenge: match play between teams, settling three separate wagers at
// once — a rate per hole up, a rate per nine won, and the match itself.
//
// Pure and cents-based, covered by `npm run check:sidegames`. Every figure is
// recomputed from the teams, the terms and the posted scores; nothing about the
// result is stored (CLAUDE.md rule 3).

export type ChallengeTerms = {
  /** Paid per hole of the final margin. Five up at $5 a hole is $25. */
  perHoleCents: number;
  /** Paid by whoever loses each nine. */
  perNineCents: number;
  /** Paid by whoever loses the match. */
  overallCents: number;
};

export type Side = 'a' | 'b' | 'halved';

export type NineResult = {
  label: string;
  holes: number[];
  wonA: number;
  wonB: number;
  /** null until every hole in the nine has been played by both teams. */
  winner: Side | null;
  complete: boolean;
};

export type MatchState = {
  teamA: number;
  teamB: number;
  holesWonA: number;
  holesWonB: number;
  halved: number;
  holesCounted: number;
  holesPending: number;
  /** Positive means A is that many up. */
  up: number;
  nines: NineResult[];
  /** null until every hole is in. A match still being played hasn't been won. */
  overall: Side | null;
  /** Cents owed to A. Negative means A owes B. Always the exact inverse for B. */
  centsA: number;
  /** What each wager contributed, so a disputed figure can be broken down. */
  breakdown: { holes: number; nines: number; overall: number };
};

/**
 * Split cents between team-mates so the parts add back to exactly the whole.
 *
 * A £25 win between two players is 13 and 12, not 12.5 each — money is integers,
 * and a remainder that gets rounded away is a cent somebody is short.
 */
export function splitCents(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.trunc(total / parts);
  const out = new Array(parts).fill(base);
  let remainder = total - base * parts;
  const step = remainder < 0 ? -1 : 1;
  for (let i = 0; remainder !== 0; i = (i + 1) % parts) {
    out[i] += step;
    remainder -= step;
  }
  return out;
}

/**
 * The nines inside a stretch of holes.
 *
 * Only a full round has nines to win separately. A nine-hole match has no nines
 * inside it — the per-nine wager and the match would be the same contest, and
 * charging both would settle one result twice.
 */
export function ninesOf(segmentHoles: number[]): Array<{ label: string; holes: number[] }> {
  if (segmentHoles.length < 18 || segmentHoles.length % 2 !== 0) return [];
  const half = segmentHoles.length / 2;
  return [
    { label: 'FRONT', holes: segmentHoles.slice(0, half) },
    { label: 'BACK', holes: segmentHoles.slice(half) },
  ];
}

/** Who won one hole, or null if either team hasn't finished it. */
export function holeWinner(
  teamAIds: string[],
  teamBIds: string[],
  hole: number,
  format: TeamFormat,
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup,
): Side | null {
  const a = teamHoleScore(format, teamAIds, hole, scoreFor, strokesFor);
  const b = teamHoleScore(format, teamBIds, hole, scoreFor, strokesFor);
  if (a == null || b == null) return null;
  if (a === b) return 'halved';
  return a < b ? 'a' : 'b';
}

/**
 * One match between two teams, across all three wagers.
 *
 * Each wager settles only when its own contest is finished: a nine pays when
 * that nine is complete, the match pays when the round is. The per-hole rate is
 * the exception and runs live, because the margin is a fact about the holes
 * already played rather than a prediction about the ones left.
 */
export function playMatch(
  teamA: number,
  teamB: number,
  teamAIds: string[],
  teamBIds: string[],
  segmentHoles: number[],
  format: TeamFormat,
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup,
  terms: ChallengeTerms,
): MatchState {
  let wonA = 0;
  let wonB = 0;
  let halved = 0;
  let pending = 0;

  const winnerOf = (hole: number) => holeWinner(teamAIds, teamBIds, hole, format, scoreFor, strokesFor);

  for (const hole of segmentHoles) {
    const w = winnerOf(hole);
    if (w == null) pending++;
    else if (w === 'a') wonA++;
    else if (w === 'b') wonB++;
    else halved++;
  }

  const counted = wonA + wonB + halved;
  const up = wonA - wonB;

  const nines: NineResult[] = ninesOf(segmentHoles).map(({ label, holes }) => {
    let a = 0;
    let b = 0;
    let done = 0;
    for (const hole of holes) {
      const w = winnerOf(hole);
      if (w == null) continue;
      done++;
      if (w === 'a') a++;
      if (w === 'b') b++;
    }
    const complete = done === holes.length && holes.length > 0;
    return {
      label,
      holes,
      wonA: a,
      wonB: b,
      winner: complete ? (a === b ? 'halved' : a > b ? 'a' : 'b') : null,
      complete,
    };
  });

  const matchComplete = counted === segmentHoles.length && segmentHoles.length > 0;
  const overall: Side | null = matchComplete ? (up === 0 ? 'halved' : up > 0 ? 'a' : 'b') : null;

  const holesCents = up * terms.perHoleCents;
  const ninesCents = nines.reduce((n, nine) => {
    if (nine.winner === 'a') return n + terms.perNineCents;
    if (nine.winner === 'b') return n - terms.perNineCents;
    return n;
  }, 0);
  const overallCents = overall === 'a' ? terms.overallCents : overall === 'b' ? -terms.overallCents : 0;

  return {
    teamA,
    teamB,
    holesWonA: wonA,
    holesWonB: wonB,
    halved,
    holesCounted: counted,
    holesPending: pending,
    up,
    nines,
    overall,
    centsA: holesCents + ninesCents + overallCents,
    breakdown: { holes: holesCents, nines: ninesCents, overall: overallCents },
  };
}

export type ChallengeLedger = {
  matches: MatchState[];
  /** Team index -> cents. Sums to zero. */
  teamCents: Record<number, number>;
  /** Player id -> cents, each team's share split between its members. */
  playerCents: Record<string, number>;
};

/**
 * Every match in the challenge.
 *
 * With two teams that's one match, which is the design's case. With more, every
 * pair plays each other over the same holes — that's what "team to team" means
 * once there are three of them, and it keeps the whole thing zero-sum.
 *
 * The wager is per team and splits between its members, per the design's own
 * note: "split it between the two of you."
 */
export function challengeLedger(
  teams: string[][],
  segmentHoles: number[],
  format: TeamFormat,
  scoreFor: ScoreLookup,
  strokesFor: StrokesLookup,
  terms: ChallengeTerms,
): ChallengeLedger {
  const matches: MatchState[] = [];
  const teamCents: Record<number, number> = {};
  teams.forEach((_, i) => {
    teamCents[i] = 0;
  });

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      // An empty team isn't in the match — it has no ball to play.
      if (!teams[i].length || !teams[j].length) continue;
      const match = playMatch(
        i,
        j,
        teams[i],
        teams[j],
        segmentHoles,
        format,
        scoreFor,
        strokesFor,
        terms,
      );
      matches.push(match);
      teamCents[i] += match.centsA;
      teamCents[j] -= match.centsA;
    }
  }

  const playerCents: Record<string, number> = {};
  teams.forEach((ids, i) => {
    if (!ids.length) return;
    const shares = splitCents(teamCents[i] ?? 0, ids.length);
    ids.forEach((id, k) => {
      playerCents[id] = (playerCents[id] ?? 0) + shares[k];
    });
  });

  return { matches, teamCents, playerCents };
}

/** "3 up", "2 down", "all square" — how a match is actually spoken about. */
export function matchStateLabel(up: number, holesPending: number): string {
  if (holesPending === 0) {
    if (up === 0) return 'halved';
    return `won by ${Math.abs(up)}`;
  }
  if (up === 0) return 'all square';
  return `${Math.abs(up)} ${up > 0 ? 'up' : 'down'}`;
}
