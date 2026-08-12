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

// The organizer's view is the default here, because it is the one every rule
// below was written against. The guest's view gets its own section at the end.
const state = (over) => ({ hasRound: true, holesPosted: 0, fieldSize: 4, cardsSigned: 0, runsRound: true, ...over });

// ------------------------------------------------------------ nothing on yet
check('a phone with no round opens on ROUND', p.opensOnRoundTab(state({ hasRound: false })), true);
check('and it does so whatever else is claimed to be true', p.opensOnRoundTab({ hasRound: false, holesPosted: 9, fieldSize: 4, cardsSigned: 1, runsRound: true }), true);
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


// ------------------------------------------------------------ the three states
check('no field is not started', p.roundStatus({ holesPosted: 0, fieldSize: 0, cardsSigned: 0 }), 'not-started');
check('a field with nothing posted is not started', p.roundStatus({ holesPosted: 0, fieldSize: 4, cardsSigned: 0 }), 'not-started');
check('one hole posted is live', p.roundStatus({ holesPosted: 1, fieldSize: 4, cardsSigned: 0 }), 'live');
check('three of four signed is still live', p.roundStatus({ holesPosted: 9, fieldSize: 4, cardsSigned: 3 }), 'live');
check('every card signed is closed', p.roundStatus({ holesPosted: 9, fieldSize: 4, cardsSigned: 4 }), 'closed');
// Reopening one card is what makes a closed round editable again — the status
// has to follow the signatures, or ACTIVITY keeps calling it closed while SCORE
// lets you type in it.
check('reopening one card puts it back to live', p.roundStatus({ holesPosted: 9, fieldSize: 4, cardsSigned: 3 }), 'live');
// A player removed after signing leaves more signatures than seats.
check('more signatures than seats is closed, not broken', p.roundStatus({ holesPosted: 9, fieldSize: 2, cardsSigned: 3 }), 'closed');
// The two must never disagree; ACTIVITY and the opening tab read the same rule.
check('only in-progress keeps you on SCORE', p.opensOnRoundTab({ hasRound: true, holesPosted: 9, fieldSize: 4, cardsSigned: 0, runsRound: true }), false);
check('closed sends you to ROUND', p.opensOnRoundTab({ hasRound: true, holesPosted: 9, fieldSize: 4, cardsSigned: 4, runsRound: true }), true);

// ------------------------------------------------------- somebody else's round
//
// ROUND is hidden from the tab bar for a guest, so sending them there strands
// them on a setup screen for a round that is not theirs with no tab to leave by.
// It happened the moment joining by code worked: /joincode sits outside the tab
// group, so returning remounts the layout and re-runs this decision — and a
// round nobody has teed off in reads as "not started".
const guest = (over) => ({ hasRound: true, holesPosted: 0, fieldSize: 4, cardsSigned: 0, runsRound: false, ...over });

check('a guest who just joined opens on SCORE, not setup', p.opensOnRoundTab(guest()), false);
check('a guest opens on SCORE mid-round too', p.opensOnRoundTab(guest({ holesPosted: 9 })), false);
// Even finished. A guest has no START ROUND and no RE-OPEN; their card is the
// only thing on that phone worth showing them.
check('and on a round that is over', p.opensOnRoundTab(guest({ holesPosted: 18, cardsSigned: 4 })), false);
check('and on a round with an empty field', p.opensOnRoundTab(guest({ fieldSize: 0 })), false);
check('a guest never routes to ROUND', p.openingRoute(guest()), '/(tabs)');

// The one case where not running it still means ROUND: there is no round. The
// tab is shown in that state precisely so one can be made.
check('no round at all still opens on ROUND', p.opensOnRoundTab(guest({ hasRound: false })), true);
check('and routes there', p.openingRoute(guest({ hasRound: false })), '/(tabs)/round');

// The organizer's behaviour is untouched by any of this.
check('the organizer still gets ROUND before anyone tees off', p.opensOnRoundTab(state()), true);
check('and SCORE once play starts', p.opensOnRoundTab(state({ holesPosted: 1 })), false);

// ------------------------------------------------------------- started_at
//
// A round used to have no state of its own: "being played" was inferred from
// whether anybody had posted, so START ROUND navigated to the Score tab and
// marked nothing — and a round set up the night before was indistinguishable
// from one being played. The organizer pressing START told the other ten phones
// nothing at all.
const AT = '2026-08-11T14:00:00.000Z';

check('a draft is not started', p.roundStatus({ holesPosted: 0, fieldSize: 4, cardsSigned: 0, startedAt: null }), 'not-started');
// The line that matters: started, and nobody has hit a shot yet. Standing on
// the first tee is the single most likely moment for the app to be open.
check('started with nothing posted is live', p.roundStatus({ holesPosted: 0, fieldSize: 4, cardsSigned: 0, startedAt: AT }), 'live');
check('started and part played is live', p.roundStatus({ holesPosted: 6, fieldSize: 4, cardsSigned: 0, startedAt: AT }), 'live');
check('started and every card signed is closed', p.roundStatus({ holesPosted: 18, fieldSize: 4, cardsSigned: 4, startedAt: AT }), 'closed');

// The safety net. A score on a round nobody pressed START on still means it is
// being played — saying otherwise would be the app arguing with the scorecard.
check('a posted score counts as started on its own', p.roundStatus({ holesPosted: 1, fieldSize: 4, cardsSigned: 0, startedAt: null }), 'live');
// But an empty field is still nothing, however emphatically it was started.
check('started with nobody in it is still not started', p.roundStatus({ holesPosted: 0, fieldSize: 0, cardsSigned: 0, startedAt: AT }), 'not-started');
// Leaving it out entirely must behave exactly as before this existed.
check('an absent startedAt falls back to the old rule', p.roundStatus({ holesPosted: 0, fieldSize: 4, cardsSigned: 0 }), 'not-started');

// And what it does to the opening tab — the reason the column exists.
check('the organizer of a started round opens on SCORE', p.opensOnRoundTab(state({ startedAt: AT })), false);
check('a guest in a started round opens on SCORE', p.opensOnRoundTab(guest({ startedAt: AT })), false);
check('a draft still opens the organizer on ROUND', p.opensOnRoundTab(state({ startedAt: null })), true);
check('a started round routes to SCORE before a ball is struck', p.openingRoute(state({ startedAt: AT })), '/(tabs)');

// --------------------------------------------------------- the organizer ends it
//
// For the round that cannot end by itself: somebody drives off after the 18th
// without signing, and it sits at "3 of 4 signed" for ever. The alternative was
// letting the organizer sign somebody else's card, which would make a signature
// mean "a button was pressed" rather than "they agreed".
const FIN = '2026-08-11T19:30:00.000Z';

check('called over is closed, whatever the signatures say', p.roundStatus({ holesPosted: 18, fieldSize: 4, cardsSigned: 3, startedAt: AT, finishedAt: FIN }), 'closed');
check('closed even with nobody signed at all', p.roundStatus({ holesPosted: 18, fieldSize: 4, cardsSigned: 0, startedAt: AT, finishedAt: FIN }), 'closed');
// Reopening clears it, and the round has to come back to life or the button
// appears to do nothing.
check('clearing it puts the round back to live', p.roundStatus({ holesPosted: 18, fieldSize: 4, cardsSigned: 3, startedAt: AT, finishedAt: null }), 'live');
// An empty round is nothing to finish, however emphatically it was finished.
check('a round with no field is still not started', p.roundStatus({ holesPosted: 0, fieldSize: 0, cardsSigned: 0, finishedAt: FIN }), 'not-started');
check('leaving it out changes nothing', p.roundStatus({ holesPosted: 18, fieldSize: 4, cardsSigned: 4, startedAt: AT }), 'closed');
// And a finished round must not hold anybody on SCORE.
check('a finished round opens the organizer on ROUND', p.opensOnRoundTab(state({ startedAt: AT, finishedAt: FIN })), true);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All opening checks passed.');
