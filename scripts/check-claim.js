#!/usr/bin/env node
/**
 * Exercises src/lib/claim.ts.
 *
 * Worth not trusting: a phone number that normalises two different ways doesn't
 * error, it silently creates a second account — so the same person signs in and
 * finds none of their rounds. Every equivalent spelling has to land on one
 * string.
 *
 *   node scripts/check-phone.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-'));

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
    files: [path.join(root, 'src/lib/claim.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const p = require(path.join(outDir, 'lib/claim.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

// A field mid-transition: one signed in, one claimed by somebody else, two
// still unclaimed because they were typed in by the organizer.
const ME = 'user-me';
const OTHER = 'user-other';
const field = [
  { id: 'p1', name: 'Dan', handicap: 12, userId: ME },
  { id: 'p2', name: 'Mike', handicap: 4, userId: OTHER },
  { id: 'p3', name: 'Steve', handicap: 18, userId: null },
  { id: 'p4', name: 'Rob', handicap: 9 },
];

// ------------------------------------------------------------ three states
check('a row you own is yours, not a claim', p.claimStatus(field[0], ME), 'you');
check('somebody else’s row is taken', p.claimStatus(field[1], ME), 'taken');
check('an explicit null owner is free', p.claimStatus(field[2], ME), 'free');
check('a missing owner field is free too', p.claimStatus(field[3], ME), 'free');
// The one that matters: signed out, a claimed row must never read as yours.
check('signed out, a claimed row is taken, not yours', p.claimStatus(field[0], null), 'taken');
check('signed out, an unclaimed row is still free', p.claimStatus(field[2], null), 'free');
check('undefined is treated as signed out', p.claimStatus(field[0], undefined), 'taken');

// ------------------------------------------------------------ finding you
check('your own row is found', p.mineInRoster(field, ME)?.id, 'p1');
check('somebody else finds theirs, not yours', p.mineInRoster(field, OTHER)?.id, 'p2');
check('a stranger owns nothing here', p.mineInRoster(field, 'user-nobody'), null);
check('signed out, nobody is you', p.mineInRoster(field, null), null);
check('an empty round has nobody in it', p.mineInRoster([], ME), null);

// ------------------------------------------------------------- the chooser
const rows = p.claimRoster(field, ME);
check('you come first', rows[0].id, 'p1');
check('then the free seats, alphabetically', [rows[1].name, rows[2].name], ['Rob', 'Steve']);
check('and the taken ones last', rows[3].name, 'Mike');
check('nobody is dropped from the list', rows.length, 4);
// Hiding taken rows makes a four-ball look like a two-ball, which invites the
// organizer to "fix" it by adding a duplicate.
check('taken rows are shown, not hidden', rows.filter((r) => r.status === 'taken').length, 1);
check('every row carries a status', rows.every((r) => ['you', 'free', 'taken'].includes(r.status)), true);

const strangerRows = p.claimRoster(field, 'user-nobody');
check('a stranger sees no row as theirs', strangerRows.some((r) => r.status === 'you'), false);
check('and two seats they could take', strangerRows.filter((r) => r.status === 'free').length, 2);
check('the two claimed rows are both closed to them', strangerRows.filter((r) => r.status === 'taken').length, 2);

// ------------------------------------------------------------- a free seat
check('a stranger has a seat to take', p.hasFreeSeat(field, 'user-nobody'), true);
// Already seated is not "needs a seat" — asking again would invite a duplicate.
check('somebody already in the round does not', p.hasFreeSeat(field, ME), false);
check('a fully claimed round has none', p.hasFreeSeat([field[0], field[1]], 'user-nobody'), false);
check('an empty round has none either', p.hasFreeSeat([], ME), false);

// ------------------------------------------------------- keeping a card
// Rule 2's "designated scorer", which is what one phone keeping four cards is.
const asMe = { myPlayerId: 'p1', amOrganizer: false };
const asOrganizer = { myPlayerId: 'p1', amOrganizer: true };

check('your own card is always yours', p.mayScoreFor(field[0], asMe), true);
check('somebody else\'s claimed card is not', p.mayScoreFor(field[1], asMe), false);
check('nor is an unclaimed one, if you do not run the round', p.mayScoreFor(field[2], asMe), false);
check('the organizer may keep an unclaimed card', p.mayScoreFor(field[2], asOrganizer), true);
check('and a row with no owner field at all', p.mayScoreFor(field[3], asOrganizer), true);
// The line that matters: claiming your row takes it back off the organizer.
check('but never a card somebody has claimed', p.mayScoreFor(field[1], asOrganizer), false);
check('not even their own organizer status changes that', p.mayScoreFor({ id: 'x', name: 'X', handicap: 0, userId: OTHER }, asOrganizer), false);

check('a player keeps only their own', p.scoreableRoster(field, asMe).map((r) => r.id), ['p1']);
check('an organizer keeps theirs and the unclaimed', p.scoreableRoster(field, asOrganizer).map((r) => r.id), ['p1', 'p4', 'p3']);
check('you always come first', p.scoreableRoster(field, asOrganizer)[0].id, 'p1');
check('signed out, nobody keeps anything', p.scoreableRoster(field, { myPlayerId: null, amOrganizer: false }), []);
// An organizer with no player of their own can still mark unclaimed cards.
check('an organizer with no seat still keeps the unclaimed', p.scoreableRoster(field, { myPlayerId: null, amOrganizer: true }).map((r) => r.name), ['Rob', 'Steve']);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All claim checks passed.');
