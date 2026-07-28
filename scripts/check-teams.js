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

// Gladstan's card, which is what the app was built against.
const PARS = [4, 5, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 4];
const holes18 = PARS.map((par, i) => ({ hole: i + 1, par, yards: 300, strokeIndex: i + 1 }));
const holes9 = holes18.slice(0, 9);
const backNine = PARS.slice(9).map((par, i) => ({ hole: i + 10, par, yards: 300, strokeIndex: i + 1 }));

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

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All team checks passed.');
