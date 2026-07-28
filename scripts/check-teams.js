#!/usr/bin/env node
/**
 * Exercises src/lib/teams.ts.
 *
 * Two things here are worth not trusting. The draft claims to be balanced, which
 * is a claim about handicap spread and not about whether the code runs. And a
 * team score must never count a hole somebody hasn't finished, because a best
 * ball that drops when the last player posts is a number the group will argue
 * about at the bar.
 *
 *   node scripts/check-teams.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-'));

const tsconfigPath = path.join(outDir, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
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
    files: [path.join(root, 'src/lib/teams.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

// tsc leaves the "@/" alias alone, and the emitted JS sits outside the repo.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(outDir, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

const t = require(path.join(outDir, 'lib/teams.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

// Gladstan's card, which is what the app was built against. `handicap` on a hole
// is its stroke index — the field name the rest of the app uses.
const PARS = [4, 5, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 4];
const SI = [9, 3, 17, 7, 13, 1, 11, 15, 5, 10, 18, 4, 6, 2, 14, 16, 12, 8];
const holes18 = PARS.map((par, i) => ({ hole: i + 1, par, yards: 300, handicap: SI[i] }));
const holes9 = holes18.slice(0, 9);
const backNine = PARS.slice(9).map((par, i) => ({ hole: i + 10, par, yards: 300, handicap: SI[i + 9] }));

// ---------------------------------------------------------------- segments

check('no re-draw is one segment over every hole', t.segmentsFor(holes18, false)[0].holes.length, 18);
check('no re-draw means exactly one segment', t.segmentsFor(holes18, false).length, 1);
check('a re-draw at the turn splits 18 into two', t.segmentsFor(holes18, true).length, 2);
check('the first nine is holes 1-9', t.segmentsFor(holes18, true)[0].holes, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
check('the second nine is holes 10-18', t.segmentsFor(holes18, true)[1].holes, [10, 11, 12, 13, 14, 15, 16, 17, 18]);
// Nine holes have no turn to re-draw at.
check('nine holes stay one segment even with re-draw on', t.segmentsFor(holes9, true).length, 1);
// A back-nine round splits by position, not by hole number — the halfway point
// of holes 10-18 is not hole 9.
check('a back nine round labels its own holes', t.segmentsFor(backNine, false)[0].label, 'HOLES 10–18');
check('an empty card does not crash', t.segmentsFor([], true).length, 1);

// ---------------------------------------------------------------- the draft

const pool = [
  { id: 'a', handicap: 2 },
  { id: 'b', handicap: 8 },
  { id: 'c', handicap: 14 },
  { id: 'd', handicap: 22 },
];

const pairs = t.draftTeams(pool, 2, 2, 0);
check('two teams of two', pairs.length, 2);
check('every team is full', pairs.map((x) => x.length), [2, 2]);
check('everybody is drafted', pairs.flat().sort(), ['a', 'b', 'c', 'd']);
// The whole point of a snake: the two best players must not end up together.
check('the snake splits the two low handicaps', pairs.some((team) => team.includes('a') && team.includes('b')), false);
check('the low man is paired with the high man', pairs.find((x) => x.includes('a')).sort(), ['a', 'd']);

// Balance is the claim, so measure it: every team gets one player from each tier.
const sumHcp = (team) => team.reduce((n, id) => n + pool.find((p) => p.id === id).handicap, 0);
check('the teams are within a shot of each other', Math.abs(sumHcp(pairs[0]) - sumHcp(pairs[1])) <= 2, true);

// A re-draw at the turn must actually change who plays with whom.
const second = t.draftTeams(pool, 2, 2, 1);
const asKey = (teams) => teams.map((x) => x.slice().sort().join('+')).sort().join(' | ');
check('a re-draw changes the pairings', asKey(second) !== asKey(pairs), true);
check('a re-draw still drafts everybody', second.flat().sort(), ['a', 'b', 'c', 'd']);

// Four players have only three possible pairings and only one is fair, so a
// re-draw here cannot keep the balance — no algorithm can. What it must do is
// take the fairest option that's left, and the first draw must be the fair one.
// The prototype's rotation failed this: its seg-1 draw was 2+14 against 8+22
// (spread 14) when 2+22 against 8+14 (spread 2) was available and unused.
check('the first draw is the fairest available', t.handicapSpread(pairs, pool), 2);
check('a re-draw of four is the only alternative left', asKey(second), 'a+c | b+d');
check(
  'and no fairer alternative was passed over',
  t.handicapSpread(second, pool) >= t.handicapSpread(pairs, pool),
  true,
);
// Asking for a third draw wraps rather than running out.
check('re-draws wrap instead of failing', t.draftTeams(pool, 2, 2, 2).flat().sort(), ['a', 'b', 'c', 'd']);

// With tiers wide enough to have real choices, a re-draw does keep the balance.
const eight = [2, 5, 9, 12, 16, 19, 24, 28].map((handicap, i) => ({ id: `q${i}`, handicap }));
const firstOfEight = t.draftTeams(eight, 2, 4, 0);
const redrawnEight = t.draftTeams(eight, 2, 4, 1);
check('eight players make four pairs', firstOfEight.map((x) => x.length), [2, 2, 2, 2]);
check('a re-draw of eight changes the pairings', asKey(redrawnEight) !== asKey(firstOfEight), true);
check('a re-draw of eight stays balanced', t.handicapSpread(redrawnEight, eight) <= 6, true);

// Odd group sizes: the spare player is left for the pool rather than crammed on.
const five = [...pool, { id: 'e', handicap: 30 }];
const fromFive = t.draftTeams(five, 2, 2, 0);
check('five players fill two pairs', fromFive.map((x) => x.length), [2, 2]);
check('the spare player is unassigned, not squeezed in', t.unassignedFrom(five.map((p) => p.id), fromFive), ['e']);
check('nobody is drafted onto two teams', new Set(fromFive.flat()).size, fromFive.flat().length);

// Bigger shapes still hold together.
const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, handicap: i * 3 }));
const fours = t.draftTeams(twelve, 4, 3, 0);
check('three teams of four', fours.map((x) => x.length), [4, 4, 4]);
check('twelve players, twelve seats', fours.flat().sort(), twelve.map((p) => p.id).sort());
const spreads = fours.map(sumHcp2);
function sumHcp2(team) {
  return team.reduce((n, id) => n + twelve.find((p) => p.id === id).handicap, 0);
}
check('teams of four balance to within a tier', Math.max(...spreads) - Math.min(...spreads) <= 9, true);

check('one team of one is legal', t.draftTeams(pool, 1, 1, 0), [['a']]);
check('most teams of two from four players', t.maxTeamsFor(4, 2), 2);
check('most teams of three from four players', t.maxTeamsFor(4, 3), 1);
check('never zero teams', t.maxTeamsFor(1, 4), 1);

// ---------------------------------------------------------------- moving people

let manual = [['a', 'b'], ['c', 'd']];
manual = t.moveToTeam(manual, 'a', 1);
check('moving a player adds them to the new team', manual[1].sort(), ['a', 'c', 'd']);
check('moving a player takes them off the old one', manual[0], ['b']);
manual = t.moveToTeam(manual, 'a', -1);
check('team -1 drops a player back into the pool', manual.map((x) => x.sort()), [['b'], ['c', 'd']]);
check('the dropped player is unassigned', t.unassignedFrom(['a', 'b', 'c', 'd'], manual), ['a']);
check('an out-of-range team leaves them unassigned rather than crashing', t.moveToTeam([['a']], 'a', 9), [[]]);

// ---------------------------------------------------------------- scoring

// Team A: a=4, b=5. Team B: c=6, d=3.
const scores = {
  1: { a: 4, b: 5, c: 6, d: 3 },
  2: { a: 5, b: 4, c: 4 }, // d hasn't posted hole 2
};
const scoreFor = (hole, id) => scores[hole]?.[id] ?? null;

check('best ball takes the low score', t.teamHoleScore('bestball', ['a', 'b'], 1, scoreFor), 4);
check('team total adds the cards up', t.teamHoleScore('total', ['a', 'b'], 1, scoreFor), 9);
// The rule that matters: a hole one player hasn't finished is not a team score.
check('a hole missing a score is pending, not a best ball', t.teamHoleScore('bestball', ['c', 'd'], 2, scoreFor), null);
check('a hole missing a score is pending for a team total too', t.teamHoleScore('total', ['c', 'd'], 2, scoreFor), null);
check('an empty team has no hole score', t.teamHoleScore('bestball', [], 1, scoreFor), null);
check('a one-player team scores their own ball', t.teamHoleScore('bestball', ['c'], 2, scoreFor), 4);

const ab = t.teamScoreOver('bestball', ['a', 'b'], [1, 2], holes18, scoreFor);
check('best ball over two holes', ab.strokes, 8); // 4 then 4
check('both holes counted', ab.holesCounted, 2);
check('nothing pending', ab.holesPending, 0);
check('best ball to par', ab.toPar, -1); // par 4 + par 5 = 9, scored 8

const cd = t.teamScoreOver('bestball', ['c', 'd'], [1, 2], holes18, scoreFor);
check('an unfinished hole is left out of the total', cd.strokes, 3);
check('only the finished hole counted', cd.holesCounted, 1);
check('the unfinished hole is reported as pending', cd.holesPending, 1);
// To-par is measured over the holes that counted, so a team two holes behind
// isn't flattered by the ones it hasn't played.
check('to par is measured over the counted holes only', cd.toPar, -1); // par 4, scored 3

const abTotal = t.teamScoreOver('total', ['a', 'b'], [1], holes18, scoreFor);
check('team total strokes', abTotal.strokes, 9);
// Two cards means the baseline is two pars, not one.
check('team total pars against every card', abTotal.toPar, 1); // 9 vs par 4 x 2

const nothing = t.teamScoreOver('bestball', ['a', 'b'], [17, 18], holes18, scoreFor);
check('a team yet to tee off has no score', nothing.strokes, null);
check('and no to-par either — not level par', nothing.toPar, null);
check('every hole of it is pending', nothing.holesPending, 2);

// ---------------------------------------------------------------- standings

const standings = t.teamStandings([['a', 'b'], ['c', 'd']], 'bestball', [1, 2], holes18, scoreFor);
check('a standing per team', standings.length, 2);
// A: -1 over 2 holes. B: -1 over 1 hole. Level, so more holes played wins.
check('level teams are split by holes played', standings[0].letter, 'A');
check('teams carry their letter', standings.map((s) => s.letter), ['A', 'B']);
check('a standing keeps its team index', standings[0].teamIndex, 0);

const withEmpty = t.teamStandings([['a', 'b'], []], 'bestball', [1, 2], holes18, scoreFor);
check('a team with nothing posted sorts last, not first', withEmpty.map((s) => s.letter), ['A', 'B']);
check('an empty team has no score rather than zero', withEmpty[1].strokes, null);

// Ordering: worse teams go below, best ball counted properly across a nine.
const nineScores = {};
for (let h = 1; h <= 9; h++) nineScores[h] = { a: 4, b: 4, c: 6, d: 6 };
const nineLookup = (hole, id) => nineScores[hole]?.[id] ?? null;
const nineStandings = t.teamStandings([['c', 'd'], ['a', 'b']], 'bestball', [1, 2, 3, 4, 5, 6, 7, 8, 9], holes18, nineLookup);
check('the better team leads regardless of team order', nineStandings[0].playerIds.sort(), ['a', 'b']);
check('and the worse team is second', nineStandings[1].playerIds.sort(), ['c', 'd']);
check('best ball over a nine', nineStandings[0].strokes, 36);

// ---------------------------------------------------------------- net scoring

// Hole 1 is stroke index 9; hole 6 is stroke index 1 (the hardest).
const netPlayers = [
  { id: 'scratch', handicap: 0 },
  { id: 'bogey', handicap: 18 },
  { id: 'mid', handicap: 9 },
  { id: 'high', handicap: 27 },
];
const strokesFor = t.strokesLookupFor(holes18, netPlayers);

check('a scratch player gets nothing', strokesFor(1, 'scratch'), 0);
check('an 18 handicap gets a stroke on every hole', strokesFor(1, 'bogey'), 1);
check('and on the hardest hole too', strokesFor(6, 'bogey'), 1);
// A 9 handicap gets strokes on stroke index 1-9 only.
check('a 9 handicap gets a stroke on stroke index 9', strokesFor(1, 'mid'), 1);
check('but nothing on stroke index 17', strokesFor(3, 'mid'), 0);
// Above 18 the allocation wraps: two strokes on the hardest nine.
check('a 27 handicap gets two strokes on stroke index 1', strokesFor(6, 'high'), 2);
check('and one on stroke index 17', strokesFor(3, 'high'), 1);
check('an unknown hole gives no strokes rather than crashing', strokesFor(99, 'mid'), 0);
check('an unknown player gives no strokes', strokesFor(1, 'nobody'), 0);

// The case net scoring exists for: the low gross ball and the low net ball
// belong to different players. Hole 1 is stroke index 9, so the 9 handicap gets
// a shot there and the scratch player doesn't.
const netScores = { 1: { scratch: 4, mid: 5 } };
const netLookup = (hole, id) => netScores[hole]?.[id] ?? null;

check('gross best ball takes the scratch player', t.teamHoleScore('bestball', ['scratch', 'mid'], 1, netLookup), 4);
check(
  'net best ball takes the shot into account',
  t.teamHoleScore('bestball', ['scratch', 'mid'], 1, netLookup, strokesFor),
  4,
);
// A 5 with a shot is a net 4, level with the scratch player's gross 4 — so the
// team score is the same but for a different reason. Make the tie explicit by
// moving the mid-handicapper a shot better.
const tieBreak = { 1: { scratch: 4, mid: 4 } };
check(
  'a shot received beats an equal gross score',
  t.teamHoleScore('bestball', ['scratch', 'mid'], 1, (h, id) => tieBreak[h]?.[id] ?? null, strokesFor),
  3,
);
// The bug this guards against: taking the low gross first and deducting after
// would credit the scratch player's 4 and hand it the mid-handicapper's stroke.
const wrongBall = { 1: { scratch: 3, mid: 6 } };
check(
  'the low net ball wins, not the low gross one with a stroke taken off it',
  t.teamHoleScore('bestball', ['scratch', 'mid'], 1, (h, id) => wrongBall[h]?.[id] ?? null, strokesFor),
  3, // scratch 3 net 3 beats mid 6 net 5 — not 3 - 1 = 2
);

// Net team total subtracts every player's strokes.
check(
  'net team total deducts each players shots',
  t.teamHoleScore('total', ['scratch', 'mid'], 1, netLookup, strokesFor),
  8, // 4 + (5 - 1)
);

// Net over a stretch of holes, and its to-par.
const roundScores = {};
for (let h = 1; h <= 9; h++) roundScores[h] = { scratch: 5, mid: 5 };
const roundLookup = (hole, id) => roundScores[hole]?.[id] ?? null;
const frontNine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const grossNine = t.teamScoreOver('bestball', ['scratch', 'mid'], frontNine, holes18, roundLookup);
const netNine = t.teamScoreOver('bestball', ['scratch', 'mid'], frontNine, holes18, roundLookup, strokesFor);
check('gross best ball over the front nine', grossNine.strokes, 45);
// The 9 handicap has a shot on six of these nine holes (stroke index 1,3,5,7,9
// among them): holes 1,2,4,6,7,9 by this card.
check('net best ball is lower than gross', netNine.strokes < grossNine.strokes, true);
check('net counts the same holes', netNine.holesCounted, 9);
check('net to par is measured against the same par', netNine.toPar, netNine.strokes - 36);

// A pending hole stays pending regardless of handicap — a stroke doesn't
// substitute for a score nobody has posted.
const halfPosted = { 1: { scratch: 4 } };
check(
  'a missing score is still pending in net play',
  t.teamHoleScore('bestball', ['scratch', 'mid'], 1, (h, id) => halfPosted[h]?.[id] ?? null, strokesFor),
  null,
);

// Standings sort on net when strokes are supplied. Team A is two scratch
// players shooting 5s; Team B two 18 handicaps shooting 6s.
const evenField = [
  { id: 's1', handicap: 0 },
  { id: 's2', handicap: 0 },
  { id: 'h1', handicap: 18 },
  { id: 'h2', handicap: 18 },
];
const evenStrokes = t.strokesLookupFor(holes18, evenField);
const fieldScores = {};
for (let h = 1; h <= 9; h++) fieldScores[h] = { s1: 5, s2: 5, h1: 6, h2: 6 };
const fieldLookup = (hole, id) => fieldScores[hole]?.[id] ?? null;
const evenTeams = [['s1', 's2'], ['h1', 'h2']];

const grossTable = t.teamStandings(evenTeams, 'bestball', frontNine, holes18, fieldLookup);
check('gross standings put the scratch pair well ahead', grossTable[0].letter, 'A');
check('nine shots ahead, in fact', grossTable[1].strokes - grossTable[0].strokes, 9);

// An 18 handicap gets exactly one stroke a hole, so a 6 is a net 5 — dead level
// with the scratch pair's 5. That is what net scoring is *for*, and a tie is the
// correct answer rather than a flip.
const evenTable = t.teamStandings(evenTeams, 'bestball', frontNine, holes18, fieldLookup, evenStrokes);
check('net makes those two teams level', evenTable[0].strokes, evenTable[1].strokes);
check('and level is 45 apiece', evenTable[0].strokes, 45);

// Give the high pair 27 and they take two strokes on the hardest nine, which is
// enough to actually overturn the gross order.
const highField = [
  { id: 's1', handicap: 0 },
  { id: 's2', handicap: 0 },
  { id: 'h1', handicap: 27 },
  { id: 'h2', handicap: 27 },
];
const highStrokes = t.strokesLookupFor(holes18, highField);
const netTable = t.teamStandings(evenTeams, 'bestball', frontNine, holes18, fieldLookup, highStrokes);
check('net standings can overturn the gross order', netTable[0].letter, 'B');
// Five of the front nine are stroke index 9 or lower, so five holes net 4 and
// four net 5.
check('two strokes on the hard holes, one on the rest', netTable[0].strokes, 40);
check('and the scratch pair are unchanged at 45', netTable[1].strokes, 45);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All team checks passed.');
