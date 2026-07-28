#!/usr/bin/env node
/**
 * Checks src/lib/wolf.ts against worked examples, including the figures the
 * design itself states ("$5 a hole, lone wolf 3x", "Vela LONE +$45").
 *
 * This is the money people settle up with cash in hand, so the properties that
 * matter get asserted directly: every hole sums to exactly zero, nothing pays
 * out before the whole group has posted, and the settle-up clears everyone in
 * at most (players - 1) payments.
 *
 *   node scripts/check-wolf.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolf-'));
const tsconfigPath = path.join(outDir, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      outDir,
      module: 'commonjs',
      target: 'es2020',
      moduleResolution: 'node',
      esModuleInterop: true,
      skipLibCheck: true,
      baseUrl: root,
      paths: { '@/*': ['src/*'] },
    },
    files: [path.join(root, 'src/lib/wolf.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });
const w = require(path.join(outDir, 'wolf.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const A = 'a', B = 'b', C = 'c', D = 'd';
const four = [A, B, C, D];
const settings = { stake: 5, loneMultiplier: 3 };

// scores[hole][player]
const makeScores = (table) => (hole, id) => table[hole]?.[id] ?? null;

// ── rotation ──────────────────────────────────────────────────────────────
const order = [B, C, A, D];
check('rotation follows tee order', [1, 2, 3, 4, 5].map((h) => w.wolfForHole(order, h)), [B, C, A, D, B]);

// A recorded decision is history: reshuffling must not rewrite a played hole.
const decided = [{ hole: 1, wolfId: B, partnerId: C }];
check('a decided hole keeps its wolf after a reshuffle', w.plannedWolfFor([D, A, C, B], 1, decided), B);
check('an undecided hole follows the new order', w.plannedWolfFor([D, A, C, B], 1, []), D);

// ── paired win ────────────────────────────────────────────────────────────
// Wolf B partners C. Their best is 3, the others' best is 4, so they win $5 each
// from A and D.
let scores = makeScores({ 1: { a: 4, b: 3, c: 5, d: 4 } });
let r = w.resultForHole({ hole: 1, wolfId: B, partnerId: C }, four, settings, scores);
check('paired win outcome', r.outcome, 'won');
check('paired win pays the stake each way', r.swings, { a: -500, b: 500, c: 500, d: -500 });

// ── paired loss ───────────────────────────────────────────────────────────
scores = makeScores({ 2: { a: 3, b: 5, c: 5, d: 6 } });
r = w.resultForHole({ hole: 2, wolfId: B, partnerId: C }, four, settings, scores);
check('paired loss outcome', r.outcome, 'lost');
check('paired loss reverses the flow', r.swings, { a: 500, b: -500, c: -500, d: 500 });

// ── lone wolf ─────────────────────────────────────────────────────────────
// The design's example: a lone wolf at $5 with a 3x multiplier wins $45 — $15
// from each of the other three.
scores = makeScores({ 3: { a: 5, b: 2, c: 4, d: 4 } });
r = w.resultForHole({ hole: 3, wolfId: B, partnerId: null }, four, settings, scores);
check('lone win outcome', r.outcome, 'won');
check('lone wolf wins 3 x the multiplied stake', r.swings, { a: -1500, b: 4500, c: -1500, d: -1500 });

scores = makeScores({ 4: { a: 3, b: 6, c: 4, d: 4 } });
r = w.resultForHole({ hole: 4, wolfId: B, partnerId: null }, four, settings, scores);
check('lone loss costs the same as it pays', r.swings, { a: 1500, b: -4500, c: 1500, d: 1500 });

// ── push ──────────────────────────────────────────────────────────────────
scores = makeScores({ 5: { a: 4, b: 4, c: 6, d: 5 } });
r = w.resultForHole({ hole: 5, wolfId: B, partnerId: C }, four, settings, scores);
check('equal best ball is a push', r.outcome, 'push');
check('a push moves no money', r.swings, { a: 0, b: 0, c: 0, d: 0 });

// ── pending ───────────────────────────────────────────────────────────────
scores = makeScores({ 6: { a: 4, b: 3, c: 5 } }); // d hasn't posted
r = w.resultForHole({ hole: 6, wolfId: B, partnerId: C }, four, settings, scores);
check('an unposted hole is pending, not a win', r.outcome, 'pending');
check('pending moves no money', r.swings, { a: 0, b: 0, c: 0, d: 0 });

// ── zero sum, including an odd group where the pot divides unevenly ────────
// Three players, wolf paired: one opponent pays $5, split between two players,
// which is 250 cents each. Five players: three opponents pay $5, and $15 across
// two team members is 750 each.
const three = [A, B, C];
r = w.resultForHole(
  { hole: 1, wolfId: A, partnerId: B },
  three,
  settings,
  makeScores({ 1: { a: 3, b: 5, c: 4 } }),
);
check('three-player paired win still balances', r.swings, { a: 250, b: 250, c: -500 });

const five = [A, B, C, D, 'e'];
r = w.resultForHole(
  { hole: 1, wolfId: A, partnerId: B },
  five,
  settings,
  makeScores({ 1: { a: 3, b: 5, c: 4, d: 4, e: 4 } }),
);
const fiveSum = Object.values(r.swings).reduce((x, y) => x + y, 0);
check('five-player pot splits without losing a cent', fiveSum, 0);
check('five-player split is even here', r.swings, { a: 750, b: 750, c: -500, d: -500, e: -500 });

// An uneven split: stake $5 with three opponents is 1500 across a team of 2 →
// 750 each, even. Force a remainder with an odd stake.
r = w.resultForHole(
  { hole: 1, wolfId: A, partnerId: B },
  [A, B, C],
  { stake: 5, loneMultiplier: 3 },
  makeScores({ 1: { a: 3, b: 9, c: 4 } }),
);
check('a 500c pot across two players leaves no remainder', r.swings, { a: 250, b: 250, c: -500 });

r = w.resultForHole(
  { hole: 1, wolfId: A, partnerId: B },
  [A, B, C, D],
  { stake: 0.15, loneMultiplier: 3 }, // 15c each from two opponents = 30c across 2
  makeScores({ 1: { a: 3, b: 9, c: 4, d: 4 } }),
);
check('an odd pot hands the spare cent out rather than dropping it', Object.values(r.swings).reduce((x, y) => x + y, 0), 0);

// ── ledger ────────────────────────────────────────────────────────────────
const table = {
  // B partners C. Their best (3) beats A/D's best (4), so they take $5 each.
  1: { a: 4, b: 3, c: 5, d: 4 },
  // C goes alone and is beaten — B's 2 is better than C's 4. A lone wolf who
  // loses pays all three at the multiplied stake: -$45, and +$15 to each.
  2: { a: 5, b: 2, c: 4, d: 4 },
  // Everyone matches, so hole 3 is a push whoever had the wolf.
  3: { a: 4, b: 4, c: 4, d: 4 },
};
const decisions = [
  { hole: 1, wolfId: B, partnerId: C },
  { hole: 2, wolfId: C, partnerId: null },
  { hole: 3, wolfId: A, partnerId: D },
];
const ledger = w.buildLedger(decisions, four, settings, makeScores(table));
check('ledger keeps one row per decided hole', ledger.rows.map((x) => x.hole), [1, 2, 3]);
check('ledger outcomes', ledger.rows.map((x) => x.outcome), ['won', 'lost', 'push']);
check('ledger totals', ledger.totals, { a: 1000, b: 2000, c: -4000, d: 1000 });
check('ledger totals sum to zero', Object.values(ledger.totals).reduce((x, y) => x + y, 0), 0);

// ── settle up ─────────────────────────────────────────────────────────────
// C is the only one down, so C pays each of the other three what they're owed.
const payments = w.settleUp(ledger.totals);
check('settle-up needs at most players-1 payments', payments.length <= four.length - 1, true);
check('the only loser pays each winner directly', payments, [
  { fromId: 'c', toId: 'b', cents: 2000 },
  { fromId: 'c', toId: 'a', cents: 1000 },
  { fromId: 'c', toId: 'd', cents: 1000 },
]);

// Applying the payments must leave everyone square.
const after = { ...ledger.totals };
for (const p of payments) {
  after[p.fromId] += p.cents;
  after[p.toId] -= p.cents;
}
check('applying the payments clears every position', after, { a: 0, b: 0, c: 0, d: 0 });

// Nobody should be paying and receiving from the same person.
const twoWay = payments.some((p) => payments.some((q) => q.fromId === p.toId && q.toId === p.fromId));
check('no pair pays each other in both directions', twoWay, false);

// ── par 3 draw ────────────────────────────────────────────────────────────
const holes = [
  { hole: 1, par: 4 }, { hole: 2, par: 4 }, { hole: 3, par: 3 }, { hole: 4, par: 5 },
  { hole: 5, par: 4 }, { hole: 6, par: 4 }, { hole: 7, par: 3 }, { hole: 8, par: 4 },
];
// Both these par 3s land on the same seat, because (3-1)%4 and (7-1)%4 are both
// 2. That is the whole reason the design shows this draw before anyone tees off:
// with four players, Gladstan's par 3s (3, 7, 11, 16) hand one seat three of the
// four and two players none at all.
check(
  'par 3 draw shows who the rotation hands the short holes',
  w.parThreeDraw(order, holes),
  [{ hole: 3, playerId: A }, { hole: 7, playerId: A }],
);
check(
  'a fixed rotation stacks Gladstan par 3s on one seat',
  w
    .parThreeDraw(order, [
      { hole: 3, par: 3 }, { hole: 7, par: 3 }, { hole: 11, par: 3 }, { hole: 16, par: 3 },
    ])
    .map((x) => x.playerId),
  [A, A, A, D],
);

// ── formatting ────────────────────────────────────────────────────────────
check('money format, positive', w.fmtMoney(4500), '+$45');
check('money format, negative uses a real minus sign', w.fmtMoney(-1500), '−$15');
check('money format, zero', w.fmtMoney(0), '$0');
check('money format keeps cents when there are any', w.fmtMoney(250), '+$2.50');

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All wolf checks passed.');
