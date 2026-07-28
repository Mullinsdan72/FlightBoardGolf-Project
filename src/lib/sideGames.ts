import { settleUp, type Payment } from '@/lib/wolf';

// Hole games — closest to the pin, longest drive — and the arithmetic that
// converges every side game into one set of payments.
//
// Pure, cents-based, and covered by `npm run check:sidegames`. The Build Guide
// singles the settle-up out as "the one place a bug is embarrassing in front of
// people holding cash", which is the whole reason this is a tested module and
// not a few lines inside a screen.
//
// Nothing here is stored. `hole_games` holds the terms and `hole_game_winners`
// holds who won which hole; every figure of money is recomputed from those
// (CLAUDE.md rule 3), so a total can't drift from the result it came from.

export type HoleGameType = 'ctp' | 'ld';

export type HoleGame = {
  id: string;
  type: HoleGameType;
  /** Every hole this game runs on. One game with four payouts, not four games. */
  holes: number[];
  /** Ante per player per hole, in cents. Never a float — money is integers. */
  wagerCents: number;
};

/** Who won a given hole of a given game. Absent means the hole hasn't settled. */
export type HoleGameWinner = { gameId: string; hole: number; playerId: string };

export type HoleOutcome = {
  hole: number;
  winnerId: string | null;
  /** What the winner collects on this hole, net of their own ante. */
  potCents: number;
  settled: boolean;
};

export type HoleGameResult = {
  gameId: string;
  type: HoleGameType;
  outcomes: HoleOutcome[];
  /** Player id -> cents. Positive is owed, negative owes. Always sums to zero. */
  positions: Record<string, number>;
  holesSettled: number;
  holesPending: number;
};

export const holeGameName = (type: HoleGameType) =>
  type === 'ctp' ? 'Closest to the pin' : 'Longest drive';

export const holeGameShortName = (type: HoleGameType) => (type === 'ctp' ? 'CTP' : 'Long drive');

/**
 * One hole game's money.
 *
 * A hole pays only once it has a winner. Nobody on the green means nobody won
 * it, and the antes for that hole stay in everyone's pocket rather than being
 * paid to the least-bad miss — the same rule Wolf uses for a hole that hasn't
 * been decided, and for the same reason: money must never move on a result that
 * hasn't happened.
 *
 * Every settled hole is zero-sum. The winner takes one ante from each of the
 * other entrants; nobody antes against themselves.
 */
export function holeGameLedger(
  game: HoleGame,
  winners: HoleGameWinner[],
  entrantIds: string[],
): HoleGameResult {
  const positions: Record<string, number> = {};
  for (const id of entrantIds) positions[id] = 0;

  const outcomes: HoleOutcome[] = game.holes.map((hole) => {
    const found = winners.find((w) => w.gameId === game.id && w.hole === hole);
    // A winner who has left the round can't be paid, so the hole is unsettled
    // again rather than paying someone who isn't there.
    const winnerId = found && entrantIds.includes(found.playerId) ? found.playerId : null;
    const others = entrantIds.length - 1;
    const potCents = winnerId && others > 0 ? game.wagerCents * others : 0;

    if (winnerId && others > 0) {
      for (const id of entrantIds) {
        if (id === winnerId) positions[id] += potCents;
        else positions[id] -= game.wagerCents;
      }
    }
    return { hole, winnerId, potCents, settled: winnerId != null && others > 0 };
  });

  const holesSettled = outcomes.filter((o) => o.settled).length;
  return {
    gameId: game.id,
    type: game.type,
    outcomes,
    positions,
    holesSettled,
    holesPending: outcomes.length - holesSettled,
  };
}

/** Every hole game at once, each with its own ledger. */
export function holeGameLedgers(
  games: HoleGame[],
  winners: HoleGameWinner[],
  entrantIds: string[],
): HoleGameResult[] {
  return games.map((g) => holeGameLedger(g, winners, entrantIds));
}

export type GamePositions = { key: string; name: string; positions: Record<string, number> };

/**
 * Add every game's positions together.
 *
 * Ids missing from one game are simply zero there — a player who sat out the
 * skins still has a Wolf position, and neither should disappear.
 */
export function combinePositions(games: GamePositions[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const game of games) {
    for (const [id, cents] of Object.entries(game.positions)) {
      total[id] = (total[id] ?? 0) + cents;
    }
  }
  return total;
}

export type Settlement = {
  /** Each game's own positions, so a disputed figure can be traced to its game. */
  games: GamePositions[];
  /** Every game added up, per player. */
  totals: Record<string, number>;
  /** The fewest payments that clear it. */
  payments: Payment[];
  /** True when every position is zero — nothing to pay. */
  allSquare: boolean;
};

/**
 * Converge every side game into the fewest payments that clear the group.
 *
 * Netting across games is the point: losing a fiver at Wolf and winning a fiver
 * at closest-to-the-pin against the same player should be no payment at all,
 * not two people swapping notes.
 *
 * Each game is kept alongside the total so a figure someone disputes can be
 * traced back to the game that produced it. A single number nobody can explain
 * is exactly what starts the argument this screen exists to end.
 */
export function settleEverything(games: GamePositions[]): Settlement {
  const totals = combinePositions(games);
  return {
    games,
    totals,
    payments: settleUp(totals),
    allSquare: Object.values(totals).every((c) => c === 0),
  };
}

/**
 * Whether the positions balance. Money that doesn't sum to zero is money
 * somebody argues about, so the screen can say so rather than quietly paying a
 * number that came from nowhere.
 */
export const balances = (totals: Record<string, number>): boolean =>
  Object.values(totals).reduce((a, b) => a + b, 0) === 0;

/** Dollars as typed by a human, to cents. Rejects anything that isn't money. */
export function parseMoney(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}
