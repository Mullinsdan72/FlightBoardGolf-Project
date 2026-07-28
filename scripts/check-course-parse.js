#!/usr/bin/env node
/**
 * Runs src/lib/courseParse.ts over a real recorded GolfCourseAPI response and
 * asserts the result is actually usable as a scorecard.
 *
 * Worth having because the API host isn't reachable from every dev environment,
 * and because the failure mode this catches was silent: `id` arrives as a
 * number, and a string-only guard dropped every search result while reporting
 * "nothing found".
 *
 *   node scripts/check-course-parse.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-parse-'));

// Compile the parser on its own. It imports only a type, which is erased, so
// the emitted JS has no imports to resolve at runtime — but tsc still has to
// resolve the `@/` alias at compile time, hence the generated tsconfig.
const tsconfigPath = path.join(outDir, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      outDir,
      module: 'commonjs',
      target: 'es2020',
      moduleResolution: 'node',
      skipLibCheck: true,
      baseUrl: root,
      paths: { '@/*': ['src/*'] },
    },
    files: [path.join(root, 'src/lib/courseParse.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const parse = require(path.join(outDir, 'lib/courseParse.js'));
const body = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gladstan-search.json'), 'utf8'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const courses = parse.parseSearchBody(body);

check('one course parsed', courses.length, 1);

const c = courses[0];
check('numeric id becomes a string', c.externalId, '7260');
check('club name', c.clubName, 'Gladstan Gc');
check('location prefers the full address', c.location, '1 Gladstan Dr, Payson, UT 84651, USA');

// 5 male tees + 2 female
check('all tee sets found', c.tees.length, 7);
check(
  'tee names and genders',
  c.tees.map((t) => `${t.teeName}/${t.gender}`),
  ['Black/male', 'Blue/male', 'White/male', 'Gold/male', 'Red/male', 'Gold/female', 'Red/female'],
);

const blue = c.tees.find((t) => t.teeName === 'Blue' && t.gender === 'male');
check('blue tee rating', blue.courseRating, 70.5);
check('blue tee slope', blue.slopeRating, 129);
check('blue tee total yards', blue.totalYards, 6433);
check('blue tee par total', blue.parTotal, 72);
check('blue tee has 18 holes', blue.holes.length, 18);
check('hole numbers come from position', blue.holes.map((h) => h.hole), Array.from({ length: 18 }, (_, i) => i + 1));
check('first hole parsed from "yardage"', blue.holes[0], { hole: 1, par: 4, yards: 428, handicap: 4 });
check('last hole', blue.holes[17], { hole: 18, par: 5, yards: 501, handicap: 3 });
check('pars sum to par_total', blue.holes.reduce((a, h) => a + h.par, 0), blue.parTotal);
check('yardages sum to total_yards', blue.holes.reduce((a, h) => a + h.yards, 0), blue.totalYards);

// Net scoring depends on stroke index being a real 1..18 ranking. This course
// puts all the even indexes on the front nine and the odd ones on the back,
// which is legitimate — what matters is that all 18 appear exactly once.
const indexes = blue.holes.map((h) => h.handicap).sort((a, b) => a - b);
check('stroke index is 1..18 with no repeats', indexes, Array.from({ length: 18 }, (_, i) => i + 1));

// Same-named tees across genders must stay distinct — they carry different
// ratings and become separate database rows.
const goldM = c.tees.find((t) => t.teeName === 'Gold' && t.gender === 'male');
const goldF = c.tees.find((t) => t.teeName === 'Gold' && t.gender === 'female');
check('male and female Gold are separate', [goldM.courseRating, goldF.courseRating], [65.1, 70.2]);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log(`All checks passed against the recorded response.`);
