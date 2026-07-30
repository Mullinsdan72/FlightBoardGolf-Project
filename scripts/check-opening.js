#!/usr/bin/env node
/**
 * Exercises src/lib/opening.ts.
 *
 * Worth not trusting: the two states this decides between want opposite
 * screens, and getting it wrong is invisible in code review — it only shows up
 * as "I opened the app on the first tee and it put me on a finished card", or
 * as a round tab you can never leave. The interesting cases are the boundaries:
 * a round that exists but has nothing on it, and a round where *your* card is
 * signed but three others are not.
 *
 *   node scripts/check-opening.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opening-'));

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
    files: [path.join(root, 'src/lib/opening.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const p = require(path.join(outDir, 'lib/opening.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const state = (over) => ({ hasRound: true, holesPosted: 0, fieldSize: 4, cardsSigned: 0, ...over });

// ------------------------------------------------------------ nothing on yet
check('a phone with no round opens on ROUND', p.opensOnRoundTab(state({ hasRound: false })), true);
check('and it does so whatever else is claimed to be true', p.opensOnRoundTab({ hasRound: false, holesPosted: 9, fieldSize: 4, cardsSigned: 1 }), true);
check('a round with nobody in it opens on ROUND', p.opensOnRoundTab(state({ fieldSize: 0 })), true);
check('a round set up but never played opens on ROUND', p.opensOnRoundTab(state({ holesPosted: 0 })), true);

// ------------------------------------------------------------ mid-round
check('one hole posted is a round in progress', p.opensOnRoundTab(state({ holesPosted: 1 })), false);
check('so is eighteen with nobody signed', p.opensOnRoundTab(state({ holesPosted: 18 })), false);
// The one that matters for a designated scorer: signing your own card does not
// finish the round, and taking SCORE away is what stranded three other cards.
check('your card signed, three still open, stays on SCORE', p.opensOnRoundTab(state({ holesPosted: 18, cardsSigned: 1 })), false);
check('three of four signed still stays on SCORE', p.opensOnRoundTab(state({ holesPosted: 18, cardsSigned: 3 })), false);

// ------------------------------------------------------------ finished
check('every card signed opens on ROUND', p.opensOnRoundTab(state({ holesPosted: 18, cardsSigned: 4 })), true);
check('a solo round signed is finished too', p.opensOnRoundTab(state({ holesPosted: 18, fieldSize: 1, cardsSigned: 1 })), true);
// Defensive: a stale signoff for a player since removed must not read as short.
check('more signatures than players is still finished', p.opensOnRoundTab(state({ holesPosted: 18, cardsSigned: 5 })), true);
// A finished round reopened by the organizer is in progress again — that is the
// whole point of reopening, and it has to bring SCORE back with it.
check('reopening one card puts it back in progress', p.opensOnRoundTab(state({ holesPosted: 18, cardsSigned: 3 })), false);

// ------------------------------------------------------------ the route
check('in progress routes to SCORE', p.openingRoute(state({ holesPosted: 4 })), '/(tabs)');
check('nothing in progress routes to ROUND', p.openingRoute(state({ hasRound: false })), '/(tabs)/round');
check('finished routes to ROUND', p.openingRoute(state({ holesPosted: 18, cardsSigned: 4 })), '/(tabs)/round');

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All opening checks passed.');
