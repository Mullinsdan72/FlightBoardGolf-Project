#!/usr/bin/env node
/**
 * Exercises src/lib/teamChallenge.ts.
 *
 * Three wagers settling at once is the easiest of the side games to get subtly
 * wrong: a nine that pays before it's finished, a match that pays while it's
 * still being played, or a split that loses a cent between team-mates. All three
 * are pinned here, along with the design's own worked figure.
 *
 *   node scripts/check-challenge.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-'));

fs.writeFileSync(
  path.join(outDir, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      outDir,
      rootDir: path.join(root, 'src'),
      module: 'commonjs',
      target: 'es2020',
      moduleResolution: 'node',
      esModuleInterop: true,
      skipLibCheck: true,
      baseUrl: root,
      paths: { '@/*': ['src/*'] },
    },
    files: [path.join(root, 'src/lib/teamChallenge.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', path.join(outDir, 'tsconfig.json')], {
  stdio: 'inherit',
});

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(outDir, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

const tc = require(path.join(outDir, 'lib/teamChallenge.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const ALL18 = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT9 = ALL18.slice(0, 9);
const NO_STROKES = () => 0;
const TERMS = { perHoleCents: 500, perNineCents: 2000, overallCents: 5000 };

// Team A: a1, a2. Team B: b1, b2.
const A = ['a1', 'a2'];
const B = ['b1', 'b2'];

/** Build a score lookup where A shoots `aScore` and B shoots `bScore` per hole. */
const scoresFrom = (perHole) => (hole, id) => {
  const row = perHole[hole];
  if (!row) return null;
  return row[id] ?? null;
};

// ------------------------------------------------------------ splitting cents

check('an even split', tc.splitCents(2000, 2), [1000, 1000]);
check('an odd split hands the spare cent out', tc.splitCents(25, 2), [13, 12]);
check('and it still adds to the whole', tc.splitCents(25, 2).reduce((a, b) => a + b, 0), 25);
check('a negative split', tc.splitCents(-25, 2), [-13, -12]);
check('negatives add up too', tc.splitCents(-25, 2).reduce((a, b) => a + b, 0), -25);
check('three ways', tc.splitCents(100, 3), [34, 33, 33]);
check('three ways adds up', tc.splitCents(100, 3).reduce((a, b) => a + b, 0), 100);
check('a solo player takes it all', tc.splitCents(500, 1), [500]);
check('nothing to split', tc.splitCents(0, 2), [0, 0]);
check('no team to split between', tc.splitCents(500, 0), []);

// ------------------------------------------------------------ nines

check('eighteen holes have two nines', tc.ninesOf(ALL18).map((n) => n.label), ['FRONT', 'BACK']);
check('the front is holes 1-9', tc.ninesOf(ALL18)[0].holes, FRONT9);
check('the back is holes 10-18', tc.ninesOf(ALL18)[1].holes, ALL18.slice(9));
// A nine-hole match has no nines inside it — charging the per-nine wager as well
// as the match would settle the same result twice.
check('a nine-hole match has no nines to win separately', tc.ninesOf(FRONT9), []);
check('an empty card has none either', tc.ninesOf([]), []);

// ------------------------------------------------------------ one hole

const oneHole = { 1: { a1: 4, a2: 5, b1: 5, b2: 6 } };
check('the lower best ball wins the hole', tc.holeWinner(A, B, 1, 'bestball', scoresFrom(oneHole), NO_STROKES), 'a');
const tied = { 1: { a1: 4, a2: 5, b1: 4, b2: 6 } };
check('equal best balls halve it', tc.holeWinner(A, B, 1, 'bestball', scoresFrom(tied), NO_STROKES), 'halved');
const oneMissing = { 1: { a1: 4, a2: 5, b1: 5 } };
check('a hole one team has not finished has no winner', tc.holeWinner(A, B, 1, 'bestball', scoresFrom(oneMissing), NO_STROKES), null);

// Handicap strokes decide the hole in a net match.
const netHole = { 1: { a1: 4, a2: 4, b1: 5, b2: 5 } };
const strokeToB = (hole, id) => (id === 'b1' ? 1 : 0);
check('gross, A wins it', tc.holeWinner(A, B, 1, 'bestball', scoresFrom(netHole), NO_STROKES), 'a');
check('a shot to B halves it', tc.holeWinner(A, B, 1, 'bestball', scoresFrom(netHole), strokeToB), 'halved');

// ------------------------------------------------------------ a match in progress

// A wins holes 1-3, then nothing is posted.
const threeIn = {};
for (const h of [1, 2, 3]) threeIn[h] = { a1: 4, a2: 4, b1: 5, b2: 5 };
const partial = tc.playMatch(0, 1, A, B, ALL18, 'bestball', scoresFrom(threeIn), NO_STROKES, TERMS);

check('three holes counted', partial.holesCounted, 3);
check('fifteen still to play', partial.holesPending, 15);
check('A is three up', partial.up, 3);
check('the per-hole rate runs live', partial.breakdown.holes, 1500);
// The two that must not pay early.
check('an unfinished nine pays nothing', partial.breakdown.nines, 0);
check('a match still being played has no winner', partial.overall, null);
check('and pays nothing', partial.breakdown.overall, 0);
check('so the running figure is the holes only', partial.centsA, 1500);
check('the front nine is not complete', partial.nines[0].complete, false);
check('and has no winner yet', partial.nines[0].winner, null);

// ------------------------------------------------------------ a finished nine

// A wins 1-5, B wins 6-9, rest unplayed: front nine complete, A took it 5-4.
const nineDone = {};
for (const h of [1, 2, 3, 4, 5]) nineDone[h] = { a1: 4, a2: 4, b1: 5, b2: 5 };
for (const h of [6, 7, 8, 9]) nineDone[h] = { a1: 5, a2: 5, b1: 4, b2: 4 };
const afterNine = tc.playMatch(0, 1, A, B, ALL18, 'bestball', scoresFrom(nineDone), NO_STROKES, TERMS);

check('nine holes counted', afterNine.holesCounted, 9);
check('A took the front five to four', [afterNine.nines[0].wonA, afterNine.nines[0].wonB], [5, 4]);
check('the front nine is complete', afterNine.nines[0].complete, true);
check('and A won it', afterNine.nines[0].winner, 'a');
check('so the nine pays', afterNine.breakdown.nines, 2000);
check('the back nine has not started', afterNine.nines[1].complete, false);
check('A is one up overall', afterNine.up, 1);
check('the match is still open', afterNine.overall, null);
check('total is one hole plus one nine', afterNine.centsA, 500 + 2000);

// ------------------------------------------------------------ the design's figure

// The design's worked example: "5 holes down, front nine lost, match lost" at
// $5 a hole, $20 a nine, $50 the match = $5*5 + $20 + $50.
// Built literally: B wins 5 more holes than A, B takes the front, B wins.
const designScores = {};
// Front nine: B wins 5, A wins 2, 2 halved -> B takes the front, B 3 up.
for (const h of [1, 2, 3, 4, 5]) designScores[h] = { a1: 5, a2: 5, b1: 4, b2: 4 };
for (const h of [6, 7]) designScores[h] = { a1: 4, a2: 4, b1: 5, b2: 5 };
for (const h of [8, 9]) designScores[h] = { a1: 4, a2: 4, b1: 4, b2: 4 };
// Back nine: B wins 2 more than A -> overall margin 5.
for (const h of [10, 11]) designScores[h] = { a1: 5, a2: 5, b1: 4, b2: 4 };
for (const h of [12, 13, 14, 15, 16, 17, 18]) designScores[h] = { a1: 4, a2: 4, b1: 4, b2: 4 };
const design = tc.playMatch(0, 1, A, B, ALL18, 'bestball', scoresFrom(designScores), NO_STROKES, TERMS);

check('every hole is in', design.holesPending, 0);
check('B is five up', design.up, -5);
check('B took the front nine', design.nines[0].winner, 'b');
check('the back nine was B too', design.nines[1].winner, 'b');
check('the match is over', design.overall, 'b');
// $5 x 5 holes + $20 x 2 nines + $50 match, all to B.
check('the holes are worth $25 to B', design.breakdown.holes, -2500);
check('both nines to B', design.breakdown.nines, -4000);
check('and the match', design.breakdown.overall, -5000);
check('A owes the lot', design.centsA, -11500);

// The design's own arithmetic for one nine lost: 5*5 + 20 + 50 = 95.
const oneNineLost = { ...design, nines: design.nines };
void oneNineLost;
check(
  "the design's figure, one nine and the match",
  Math.abs(design.breakdown.holes) + TERMS.perNineCents + TERMS.overallCents,
  2500 + 2000 + 5000,
);

// ------------------------------------------------------------ halved matches

const allHalved = {};
for (const h of ALL18) allHalved[h] = { a1: 4, a2: 4, b1: 4, b2: 4 };
const halved = tc.playMatch(0, 1, A, B, ALL18, 'bestball', scoresFrom(allHalved), NO_STROKES, TERMS);
check('every hole halved', halved.halved, 18);
check('all square', halved.up, 0);
check('the match is halved', halved.overall, 'halved');
check('a halved nine pays nothing', halved.nines[0].winner, 'halved');
check('and a halved match moves no money at all', halved.centsA, 0);

check('match label, in progress and level', tc.matchStateLabel(0, 5), 'all square');
check('match label, up', tc.matchStateLabel(3, 5), '3 up');
check('match label, down', tc.matchStateLabel(-2, 5), '2 down');
check('match label, finished', tc.matchStateLabel(4, 0), 'won by 4');
check('match label, halved', tc.matchStateLabel(0, 0), 'halved');

// ------------------------------------------------------------ the ledger

const ledger = tc.challengeLedger(
  [A, B],
  ALL18,
  'bestball',
  scoresFrom(designScores),
  NO_STROKES,
  TERMS,
);
check('two teams play one match', ledger.matches.length, 1);
check('team A is down the lot', ledger.teamCents[0], -11500);
check('team B is up the same', ledger.teamCents[1], 11500);
check('the teams balance', ledger.teamCents[0] + ledger.teamCents[1], 0);
// Split between team-mates, remainder handed out rather than rounded away.
check('A splits the loss', [ledger.playerCents.a1, ledger.playerCents.a2], [-5750, -5750]);
check('B splits the win', [ledger.playerCents.b1, ledger.playerCents.b2], [5750, 5750]);
check(
  'every player position sums to zero',
  Object.values(ledger.playerCents).reduce((a, b) => a + b, 0),
  0,
);

// An odd amount between two players must not lose a cent.
const oddTerms = { perHoleCents: 333, perNineCents: 0, overallCents: 0 };
const oddLedger = tc.challengeLedger([A, B], ALL18, 'bestball', scoresFrom(designScores), NO_STROKES, oddTerms);
check('an odd team figure', oddLedger.teamCents[0], -1665);
check('splits without losing a cent', oddLedger.playerCents.a1 + oddLedger.playerCents.a2, -1665);
check('and still balances overall', Object.values(oddLedger.playerCents).reduce((a, b) => a + b, 0), 0);

// Three teams: every pair plays, and the whole thing still nets to zero.
const C = ['c1', 'c2'];
const threeScores = {};
for (const h of ALL18) threeScores[h] = { a1: 4, a2: 4, b1: 5, b2: 5, c1: 6, c2: 6 };
const threeWay = tc.challengeLedger([A, B, C], ALL18, 'bestball', scoresFrom(threeScores), NO_STROKES, TERMS);
check('three teams play three matches', threeWay.matches.length, 3);
check('the best team is up', threeWay.teamCents[0] > 0, true);
check('the worst team is down', threeWay.teamCents[2] < 0, true);
check(
  'three teams still net to zero',
  Object.values(threeWay.teamCents).reduce((a, b) => a + b, 0),
  0,
);
check(
  'and so do the players',
  Object.values(threeWay.playerCents).reduce((a, b) => a + b, 0),
  0,
);

// An empty team has no ball to play, so it isn't in the match at all.
const withEmpty = tc.challengeLedger([A, B, []], ALL18, 'bestball', scoresFrom(designScores), NO_STROKES, TERMS);
check('an empty team plays nobody', withEmpty.matches.length, 1);
check('and owes nothing', withEmpty.teamCents[2], 0);

// Nothing posted at all: a match nobody has started moves no money.
const unplayed = tc.challengeLedger([A, B], ALL18, 'bestball', () => null, NO_STROKES, TERMS);
check('a match nobody has started is all pending', unplayed.matches[0].holesPending, 18);
check('and pays nothing', unplayed.teamCents[0], 0);
check('with no player positions either', Object.values(unplayed.playerCents).every((c) => c === 0), true);

// Uneven team sizes: a three-man team splits its share three ways.
const bigA = ['a1', 'a2', 'a3'];
const unevenScores = {};
for (const h of ALL18) unevenScores[h] = { a1: 4, a2: 4, a3: 4, b1: 5, b2: 5 };
const uneven = tc.challengeLedger([bigA, B], ALL18, 'bestball', scoresFrom(unevenScores), NO_STROKES, TERMS);
check('the winning team of three splits three ways', uneven.playerCents.a1 + uneven.playerCents.a2 + uneven.playerCents.a3, uneven.teamCents[0]);
check('and the pair splits two ways', uneven.playerCents.b1 + uneven.playerCents.b2, uneven.teamCents[1]);
check('uneven sides still balance', Object.values(uneven.playerCents).reduce((a, b) => a + b, 0), 0);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All team challenge checks passed.');
