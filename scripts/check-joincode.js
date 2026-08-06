#!/usr/bin/env node
/**
 * Exercises src/lib/joinCode.ts.
 *
 * Worth not trusting: this code gets read out across a car park and typed back
 * in by somebody who heard it. The failures are all silent — a code that
 * validates here and cannot exist in the database, or a character a person
 * reasonably writes down and the app then refuses. Both look like "the code
 * doesn't work" and neither leaves a trace.
 *
 *   node scripts/check-joincode.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joincode-'));

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
    files: [path.join(root, 'src/lib/joinCode.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const j = require(path.join(outDir, 'lib/joinCode.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

// ------------------------------------------------------------- the alphabet
//
// This has to match `new_join_code()` in supabase/join-codes.sql exactly. A
// character the database can mint and this refuses is a code that exists and
// can never be typed in — and nobody would ever work out why.
check('the alphabet is 32 characters', j.JOIN_CODE_ALPHABET.length, 32);
check('no letter I, which is a 1', j.JOIN_CODE_ALPHABET.includes('I'), false);
check('no letter L, which is also a 1', j.JOIN_CODE_ALPHABET.includes('L'), false);
check('no letter O, which is a 0', j.JOIN_CODE_ALPHABET.includes('O'), false);
// Left out so five random characters cannot spell something unfortunate.
check('no letter U', j.JOIN_CODE_ALPHABET.includes('U'), false);
check('every digit is in', [...'0123456789'].every((c) => j.JOIN_CODE_ALPHABET.includes(c)), true);
check('no character appears twice', new Set(j.JOIN_CODE_ALPHABET).size, j.JOIN_CODE_ALPHABET.length);
check('five characters long', j.JOIN_CODE_LENGTH, 5);

// ---------------------------------------------------------- reading it back
check('a plain code passes through', j.normalizeJoinCode('7KQ3M'), '7KQ3M');
check('lower case is the same code', j.normalizeJoinCode('7kq3m'), '7KQ3M');
check('so is one with spaces', j.normalizeJoinCode(' 7K Q3 M '), '7KQ3M');
check('and one somebody hyphenated', j.normalizeJoinCode('7K-Q3-M'), '7KQ3M');

// The whole reason for Crockford's alphabet: somebody hears a code, writes down
// what a letter looks like, and types that. Every one of these must still land
// on the same round rather than reporting a wrong code.
check('a written O is read as zero', j.normalizeJoinCode('7KQ3O'), '7KQ30');
check('a written I is read as one', j.normalizeJoinCode('7KQ3I'), '7KQ31');
check('a written l is read as one too', j.normalizeJoinCode('7kq3l'), '7KQ31');
check('all three at once', j.normalizeJoinCode('OIL37'), '01137');

// ------------------------------------------------------------- what it won't
//
// Length is strict on purpose. A four-character lookup finds nothing, and
// "nothing found" is indistinguishable from a wrong code — so it is better to
// keep the button dark until there are five.
check('four characters is not a code', j.normalizeJoinCode('7KQ3'), null);
check('six characters is not either', j.normalizeJoinCode('7KQ3MM'), null);
check('nor is nothing at all', j.normalizeJoinCode(''), null);
check('nor is punctuation on its own', j.normalizeJoinCode('-- --'), null);
check('U is not in the alphabet, so it is not a code', j.normalizeJoinCode('7KQ3U'), null);

check('a valid code is valid', j.isJoinCodeValid('7kq3m'), true);
check('a short one is not', j.isJoinCodeValid('7kq'), false);

// ---------------------------------------------------------------- the hint
//
// Must agree with the button, or the screen says "5 of 5" above something that
// refuses to press.
check('progress counts only the characters that matter', j.joinCodeProgress('7k-q'), 3);
check('progress never exceeds the length', j.joinCodeProgress('7KQ3MMMM'), 5);
check('an empty box is no progress', j.joinCodeProgress(''), 0);
check('a full box agrees with the button', j.joinCodeProgress('7KQ3M'), j.JOIN_CODE_LENGTH);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All join code checks passed.');
