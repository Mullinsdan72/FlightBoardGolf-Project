#!/usr/bin/env node
/**
 * Exercises src/lib/sideGames.ts.
 *
 * The Build Guide's words about the settle-up screen: "the one place a bug is
 * embarrassing in front of people holding cash. Test it with lopsided numbers
 * before you trust it." So: lopsided numbers, holes nobody won, a player who
 * left mid-round, and a check that every ledger sums to exactly zero.
 *
 *   node scripts/check-sidegames.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidegames-'));

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
    files: [path.join(root, 'src/lib/sideGames.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(outDir, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

const sg = require(path.join(outDir, 'lib/sideGames.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const sum = (positions) => Object.values(positions).reduce((a, b) => a + b, 0);
const FOUR = ['a', 'b', 'c', 'd'];

// ------------------------------------------------------------ hole games

// Closest to the pin on every par 3 at Gladstan: one game, four payouts.
const ctp = { id: 'g1', type: 'ctp', holes: [3, 7, 11, 16], wagerCents: 500 };

const noneYet = sg.holeGameLedger(ctp, [], FOUR);
check('a game nobody has won moves no money', sum(noneYet.positions), 0);
check('and every player is on zero', noneYet.positions, { a: 0, b: 0, c: 0, d: 0 });
check('all four holes are pending', noneYet.holesPending, 4);
check('none are settled', noneYet.holesSettled, 0);

const oneHole = sg.holeGameLedger(ctp, [{ gameId: 'g1', hole: 3, playerId: 'a' }], FOUR);
check('the winner takes an ante from each of the others', oneHole.positions.a, 1500);
check('each loser is down one ante', oneHole.positions.b, -500);
check('a settled hole is zero-sum', sum(oneHole.positions), 0);
check('one hole settled', oneHole.holesSettled, 1);
check('the other three still pending', oneHole.holesPending, 3);
check('the pot is reported', oneHole.outcomes[0].potCents, 1500);
check('an unwon hole reports no pot', oneHole.outcomes[1].potCents, 0);

// Nobody hit the green: that hole does not pay the least-bad miss.
const partial = sg.holeGameLedger(
  ctp,
  [
    { gameId: 'g1', hole: 3, playerId: 'a' },
    { gameId: 'g1', hole: 16, playerId: 'b' },
  ],
  FOUR,
);
check('two winners, two holes still open', [partial.holesSettled, partial.holesPending], [2, 2]);
check('each winner is up a pot and down an ante elsewhere', partial.positions.a, 1000);
check('the second winner nets the same', partial.positions.b, 1000);
check('the two who won nothing are down two antes', partial.positions.c, -1000);
check('still balances', sum(partial.positions), 0);

// One player sweeping every hole is the most lopsided this game gets.
const sweep = sg.holeGameLedger(
  ctp,
  ctp.holes.map((hole) => ({ gameId: 'g1', hole, playerId: 'a' })),
  FOUR,
);
check('a clean sweep pays four pots', sweep.positions.a, 6000);
check('and costs everyone else four antes', sweep.positions.d, -2000);
check('a sweep still balances', sum(sweep.positions), 0);

// A winner who was removed from the round can't be paid.
const ghost = sg.holeGameLedger(ctp, [{ gameId: 'g1', hole: 3, playerId: 'gone' }], FOUR);
check('a winner who left the round leaves the hole unsettled', ghost.holesSettled, 0);
check('and moves no money', sum(ghost.positions), 0);

// Winners belonging to another game are ignored.
const crossed = sg.holeGameLedger(ctp, [{ gameId: 'other', hole: 3, playerId: 'a' }], FOUR);
check("another game's winner doesn't pay out here", crossed.holesSettled, 0);

// Two players is the smallest game that means anything.
const heads = sg.holeGameLedger({ ...ctp, holes: [3] }, [{ gameId: 'g1', hole: 3, playerId: 'a' }], ['a', 'b']);
check('heads up, the winner takes one ante', heads.positions, { a: 500, b: -500 });

// One entrant has nobody to win from.
const alone = sg.holeGameLedger({ ...ctp, holes: [3] }, [{ gameId: 'g1', hole: 3, playerId: 'a' }], ['a']);
check('a game of one pays nothing', alone.positions, { a: 0 });
check('and is not counted as settled', alone.holesSettled, 0);

// Longest drive alongside it — several games at once.
const ld = { id: 'g2', type: 'ld', holes: [6, 12, 18], wagerCents: 1000 };
const both = sg.holeGameLedgers(
  [ctp, ld],
  [
    { gameId: 'g1', hole: 3, playerId: 'a' },
    { gameId: 'g2', hole: 6, playerId: 'c' },
  ],
  FOUR,
);
check('a ledger per game', both.length, 2);
check('each keeps its own type', both.map((g) => g.type), ['ctp', 'ld']);
check('the ctp winner is up 1500', both[0].positions.a, 1500);
check('the longer wager pays more', both[1].positions.c, 3000);

check('game names', [sg.holeGameName('ctp'), sg.holeGameName('ld')], ['Closest to the pin', 'Longest drive']);

// ------------------------------------------------------------ combining

const wolfLike = { key: 'wolf', name: 'Wolf', positions: { a: -2000, b: 500, c: 1500, d: 0 } };
const ctpLike = { key: 'ctp', name: 'Closest to the pin', positions: { a: 1500, b: -500, c: -500, d: -500 } };

const combined = sg.combinePositions([wolfLike, ctpLike]);
check('positions add across games', combined, { a: -500, b: 0, c: 1000, d: -500 });
check('the combined total balances', sum(combined), 0);

// A player who only appears in one game keeps their position.
const partialField = sg.combinePositions([
  { key: 'w', name: 'Wolf', positions: { a: 100, b: -100 } },
  { key: 'x', name: 'CTP', positions: { c: 300, d: -300 } },
]);
check('a player absent from one game is not dropped', partialField, { a: 100, b: -100, c: 300, d: -300 });
check('balances returns true on a balanced set', sg.balances(partialField), true);
check('and false on one that does not', sg.balances({ a: 100, b: -50 }), false);

// ------------------------------------------------------------ settle-up

const settlement = sg.settleEverything([wolfLike, ctpLike]);
check('the settlement keeps each game', settlement.games.length, 2);
check('totals match the combination', settlement.totals, { a: -500, b: 0, c: 1000, d: -500 });
check('not all square', settlement.allSquare, false);

// The netting rule that matters: a fiver lost at Wolf and won at CTP against the
// same player is no payment at all, not two people swapping notes.
check('b is level across the two games and pays nobody', settlement.payments.some((p) => p.fromId === 'b' || p.toId === 'b'), false);
check('the fewest payments clears it in two', settlement.payments.length, 2);
check('both debtors pay the only creditor', settlement.payments.every((p) => p.toId === 'c'), true);

const applied = { ...settlement.totals };
for (const p of settlement.payments) {
  applied[p.fromId] += p.cents;
  applied[p.toId] -= p.cents;
}
check('applying the payments clears every position', applied, { a: 0, b: 0, c: 0, d: 0 });
check('no payment is for nothing', settlement.payments.every((p) => p.cents > 0), true);
check('at most one fewer payment than players', settlement.payments.length <= FOUR.length - 1, true);

// All square: nothing owed, nothing to pay.
const square = sg.settleEverything([{ key: 'w', name: 'Wolf', positions: { a: 0, b: 0 } }]);
check('all square is reported', square.allSquare, true);
check('and produces no payments', square.payments, []);

const nothing = sg.settleEverything([]);
check('no games at all is all square', nothing.allSquare, true);
check('with no payments', nothing.payments, []);

// Lopsided, as the Build Guide asks for: one player loses to everybody.
const lopsided = sg.settleEverything([
  { key: 'w', name: 'Wolf', positions: { a: -9900, b: 3300, c: 3300, d: 3300 } },
]);
check('the only loser pays each winner', lopsided.payments.length, 3);
check('every payment comes from the loser', lopsided.payments.every((p) => p.fromId === 'a'), true);
check('and they add up to the debt', lopsided.payments.reduce((n, p) => n + p.cents, 0), 9900);

// Odd cents must not vanish in the netting.
const odd = sg.settleEverything([
  { key: 'w', name: 'Wolf', positions: { a: -333, b: 111, c: 111, d: 111 } },
]);
check('odd cents still settle exactly', odd.payments.reduce((n, p) => n + p.cents, 0), 333);
const oddApplied = { ...odd.totals };
for (const p of odd.payments) {
  oddApplied[p.fromId] += p.cents;
  oddApplied[p.toId] -= p.cents;
}
check('and leave nobody a cent out', oddApplied, { a: 0, b: 0, c: 0, d: 0 });

// Three games at once, including one that nets a player to exactly zero.
const three = sg.settleEverything([
  { key: 'w', name: 'Wolf', positions: { a: 1000, b: -1000, c: 0 } },
  { key: 'x', name: 'CTP', positions: { a: -1500, b: 500, c: 1000 } },
  { key: 'y', name: 'LD', positions: { a: 500, b: 500, c: -1000 } },
]);
check('three games combine', three.totals, { a: 0, b: 0, c: 0 });
check('and cancel out entirely', three.allSquare, true);
check('so nobody pays anybody', three.payments, []);

// ------------------------------------------------------------ money input

check('plain dollars', sg.parseMoney('5'), 500);
check('dollars and cents', sg.parseMoney('2.50'), 250);
check('a leading dollar sign is fine', sg.parseMoney('$10'), 1000);
check('surrounding space is fine', sg.parseMoney('  7.25 '), 725);
check('one decimal place works', sg.parseMoney('1.5'), 150);
check('zero is a legal wager', sg.parseMoney('0'), 0);
check('three decimal places is not money', sg.parseMoney('1.005'), null);
check('letters are not money', sg.parseMoney('five'), null);
check('empty is not money', sg.parseMoney(''), null);
check('negative is not a wager', sg.parseMoney('-5'), null);
// Floating point: 0.29 * 100 is 28.999... and truncation would lose a cent.
check('cents survive the float', sg.parseMoney('0.29'), 29);
check('and so do these', sg.parseMoney('1.15'), 115);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All side game checks passed.');
