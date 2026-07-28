// Wolf money maths. Pure — no network, no React — so it can be checked against
// worked examples (scripts/check-wolf.js). Every figure here is derived from the
// recorded decisions plus the posted scores; nothing about the money is stored.
//
// How Wolf pays, per the design:
//   - Each hole one player is the wolf, taken in a fixed rotation.
//   - The wolf tees last, watches the drives, then either picks a partner or
//     plays the other three alone ("lone wolf") for a multiplier.
//   - Best ball: the lowest score on the wolf's side against the lowest on the
//     other side. Lowest wins; equal is a push and pays nothing.
//   - Every player on the losing side pays `per`; the winning side splits it.
//     A lone wolf's `per` is the stake times the multiplier, so beating three
//     players alone at $5 with a 3x multiplier pays 3 x $15 = $45.
//
// Amounts are in cents throughout. Stakes are whole dollars, but a paired win in
// an odd-sized group divides unevenly, and cents let the remainder be handed out
// deterministically so a hole always sums to exactly zero. Money that doesn't
// balance is money someone has to argue about.

export type WolfSettings = {
  enabled: boolean;
  stake: number; // dollars per hole
  loneMultiplier: number; // 2, 3 or 4
  order: string[]; // player ids, in rotation order
};

export type WolfDecision = {
  hole: number;
  wolfId: string;
  partnerId: string | null; // null means they went alone
};

export type WolfOutcome = 'won' | 'lost' | 'push' | 'pending';

export type WolfHoleResult = {
  hole: number;
  wolfId: string;
  partnerId: string | null;
  lone: boolean;
  outcome: WolfOutcome;
  perCents: number; // what each player on the losing side pays
  swings: Record<string, number>; // playerId -> cents, always sums to 0
};

export type Payment = { fromId: string; toId: string; cents: number };

// Whose turn it is on a hole that hasn't been decided yet. Once a hole has a
// recorded decision that decision is the truth, so reshuffling the order can
// never rewrite a hole that has already been played.
export function wolfForHole(order: string[], hole: number): string | null {
  if (!order.length) return null;
  return order[(hole - 1) % order.length];
}

export function plannedWolfFor(
  order: string[],
  hole: number,
  decisions: WolfDecision[],
): string | null {
  const decided = decisions.find((d) => d.hole === hole);
  return decided ? decided.wolfId : wolfForHole(order, hole);
}

type ScoreLookup = (hole: number, playerId: string) => number | null | undefined;

// Splits `totalCents` across `ids`, giving the remainder to the earliest ids, so
// the parts always add back up to the total exactly.
function share(totalCents: number, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / ids.length);
  let remainder = abs - base * ids.length;
  for (const id of ids) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    out[id] = sign * (base + extra);
  }
  return out;
}

export function resultForHole(
  decision: WolfDecision,
  playerIds: string[],
  settings: Pick<WolfSettings, 'stake' | 'loneMultiplier'>,
  scoreFor: ScoreLookup,
): WolfHoleResult {
  const lone = decision.partnerId == null;
  const team = lone ? [decision.wolfId] : [decision.wolfId, decision.partnerId as string];
  const others = playerIds.filter((id) => !team.includes(id));

  const perCents = Math.round(
    (lone ? settings.stake * settings.loneMultiplier : settings.stake) * 100,
  );

  const zero: Record<string, number> = {};
  for (const id of playerIds) zero[id] = 0;

  const base = {
    hole: decision.hole,
    wolfId: decision.wolfId,
    partnerId: decision.partnerId,
    lone,
    perCents,
  };

  // A side with nobody on it can't be scored — happens if the roster changed
  // after a decision was recorded.
  if (!team.length || !others.length) {
    return { ...base, outcome: 'pending', swings: zero };
  }

  // Every player in the group has to have posted before money is asserted
  // (CLAUDE.md rule 4: never show a score for a hole that hasn't been played).
  const scores = new Map<string, number>();
  for (const id of playerIds) {
    const s = scoreFor(decision.hole, id);
    if (s == null) return { ...base, outcome: 'pending', swings: zero };
    scores.set(id, s);
  }

  const best = (ids: string[]) => Math.min(...ids.map((id) => scores.get(id) as number));
  const teamBest = best(team);
  const otherBest = best(others);

  if (teamBest === otherBest) return { ...base, outcome: 'push', swings: zero };

  const won = teamBest < otherBest;
  const potCents = others.length * perCents;
  const swings: Record<string, number> = { ...zero };
  for (const id of others) swings[id] = won ? -perCents : perCents;
  const teamShare = share(won ? potCents : -potCents, team);
  for (const [id, cents] of Object.entries(teamShare)) swings[id] = cents;

  return { ...base, outcome: won ? 'won' : 'lost', swings };
}

export type WolfLedger = {
  rows: WolfHoleResult[];
  totals: Record<string, number>; // playerId -> cents
};

export function buildLedger(
  decisions: WolfDecision[],
  playerIds: string[],
  settings: Pick<WolfSettings, 'stake' | 'loneMultiplier'>,
  scoreFor: ScoreLookup,
): WolfLedger {
  const totals: Record<string, number> = {};
  for (const id of playerIds) totals[id] = 0;
  const rows = decisions
    .slice()
    .sort((a, b) => a.hole - b.hole)
    .map((d) => {
      const row = resultForHole(d, playerIds, settings, scoreFor);
      for (const [id, cents] of Object.entries(row.swings)) {
        totals[id] = (totals[id] ?? 0) + cents;
      }
      return row;
    });
  return { rows, totals };
}

// Nets everyone's position down to the fewest payments that clear the group, so
// nobody hands over $20 while receiving $15 back from the same person. Greedy
// largest-debtor-to-largest-creditor, which needs at most (players - 1) payments.
export function settleUp(totals: Record<string, number>): Payment[] {
  const debtors = Object.entries(totals)
    .filter(([, cents]) => cents < 0)
    .map(([id, cents]) => ({ id, cents: -cents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  const creditors = Object.entries(totals)
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => ({ id, cents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));

  const payments: Payment[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].cents, creditors[c].cents);
    if (amount > 0) payments.push({ fromId: debtors[d].id, toId: creditors[c].id, cents: amount });
    debtors[d].cents -= amount;
    creditors[c].cents -= amount;
    if (debtors[d].cents === 0) d += 1;
    if (creditors[c].cents === 0) c += 1;
  }
  return payments;
}

// Which player the rotation hands each par 3 to. The design surfaces this
// because a fixed order at your home course means the same seat always draws the
// short holes, and going lone on a par 3 is the good draw.
export function parThreeDraw(
  order: string[],
  holes: Array<{ hole: number; par: number }>,
  decisions: WolfDecision[] = [],
): Array<{ hole: number; playerId: string | null }> {
  return holes
    .filter((h) => h.par === 3)
    .map((h) => ({ hole: h.hole, playerId: plannedWolfFor(order, h.hole, decisions) }));
}

export function shuffled<T>(list: T[], random: () => number = Math.random): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const fmtMoney = (cents: number): string => {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  const text = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `${sign}$${text}`;
};
