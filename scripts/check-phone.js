#!/usr/bin/env node
/**
 * Exercises src/lib/phone.ts.
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
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-'));

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
    files: [path.join(root, 'src/lib/phone.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const p = require(path.join(outDir, 'lib/phone.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

// ------------------------------------------------------- the five spellings
// All of these are one person. If any pair disagrees, that person ends up with
// two accounts and loses half their rounds.
const SAME = ['5551234567', '555-123-4567', '(555) 123-4567', '555.123.4567', '+1 555 123 4567', '1-555-123-4567'];
for (const raw of SAME) check(`"${raw}" normalises to +15551234567`, p.toE164(raw), '+15551234567');
check('and every spelling equals every other', SAME.every((a) => SAME.every((b) => p.samePhone(a, b))), true);

// ------------------------------------------------------------- what is not
check('nine digits is not a number', p.toE164('555123456'), null);
check('twelve bare digits is not either', p.toE164('555123456789'), null);
check('eleven digits not starting with 1 is not a US number', p.toE164('25551234567'), null);
check('empty is nothing', p.toE164(''), null);
check('spaces alone are nothing', p.toE164('   '), null);
check('letters are nothing', p.toE164('call me'), null);
check('an invalid number never equals another', p.samePhone('abc', 'abc'), false);
check('nor does it equal a valid one', p.samePhone('abc', '5551234567'), false);

// --------------------------------------------------------- explicit country
// A leading + is the user telling us the country. Never override it: +445551234567
// must not become +1445551234567.
check('a + is obeyed, not re-guessed', p.toE164('+445551234567'), '+445551234567');
check('and its punctuation is stripped', p.toE164('+44 (555) 123-4567'), '+445551234567');
check('too short even with a +', p.toE164('+1234567'), null);
check('too long for E.164', p.toE164('+1234567890123456'), null);
check('fifteen digits is the ceiling, and allowed', p.toE164('+123456789012345'), '+123456789012345');

// ------------------------------------------------------------------ display
check('a US number reads back as people write it', p.prettyPhone('5551234567'), '(555) 123-4567');
check('however it was typed', p.prettyPhone('+1 555 123 4567'), '(555) 123-4567');
check('a foreign number stays in E.164 rather than being guessed at', p.prettyPhone('+445551234567'), '+445551234567');
check('an unparseable string is handed back unchanged', p.prettyPhone('not a phone'), 'not a phone');

// -------------------------------------------------------------------- codes
check('six digits is a code', p.isOtpValid('123456'), true);
check('with surrounding space, still a code', p.isOtpValid(' 123456 '), true);
check('five digits is not', p.isOtpValid('12345'), false);
check('seven is not', p.isOtpValid('1234567'), false);
check('letters are not', p.isOtpValid('12345a'), false);
check('empty is not', p.isOtpValid(''), false);

// ------------------------------------------------------------------- validity
check('isPhoneValid agrees with toE164', p.isPhoneValid('5551234567'), true);
check('and disagrees when it should', p.isPhoneValid('555'), false);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All phone checks passed.');
