#!/usr/bin/env node
/**
 * Exercises src/lib/invite.ts — the invite link, the message that carries it,
 * and the order of the setup checklist.
 *
 * A link that loses its round id, or a message that promises a download that
 * doesn't exist, both fail in somebody else's text inbox where they can't be
 * seen. So they get checked here.
 *
 *   node scripts/check-invite.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invite-'));

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
    files: [path.join(root, 'src/lib/invite.ts')],
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

const inv = require(path.join(outDir, 'lib/invite.js'));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};

const ROUND = 'b3f1c2d4-0000-4000-8000-abcdefabcdef';

// ---------------------------------------------------------------- the link

check('the link uses the app scheme', inv.inviteLink(ROUND).startsWith('flightboard://join?round='), true);
check('and carries the round', inv.roundIdFromLink(inv.inviteLink(ROUND)), ROUND);
// The round id is the whole point of the link — it must survive the round trip.
check('an id needing escaping survives', inv.roundIdFromLink(inv.inviteLink('a b&c')), 'a b&c');
check('a link with other params still parses', inv.roundIdFromLink('flightboard://join?x=1&round=abc&y=2'), 'abc');
check('a fragment is not part of the id', inv.roundIdFromLink('flightboard://join?round=abc#frag'), 'abc');
check('a link without a round is not one of ours', inv.roundIdFromLink('flightboard://join'), null);
check('nor is an empty round', inv.roundIdFromLink('flightboard://join?round='), null);
check('a malformed escape does not throw', inv.roundIdFromLink('flightboard://join?round=%E0%A4%A'), null);
check('junk is rejected', inv.roundIdFromLink('hello'), null);

// ---------------------------------------------------------------- the message

const msg = inv.inviteMessage({
  roundName: 'Saturday at Gladstan',
  courseName: 'Gladstan Golf Course',
  playedOn: '2026-08-01',
  organizerName: 'Danny Mullins',
  roundId: ROUND,
});

check('it opens by saying what happened', msg.startsWith("You've been added to Flight Board golf."), true);
// Nothing time-bound in the wording, so an invite sent the night before still
// reads correctly the next morning.
check('it does not claim the round is today', msg.toLowerCase().includes('today'), false);
check('it says the round is live', msg.includes('in real time'), true);
check('it mentions the games', msg.includes('games being played within the round'), true);
check('it says you keep your own score', msg.includes('lets you keep your own score'), true);
// The line that actually sells it: what the app takes off you is the adding up.
check('the payoff line', msg.includes('Live scoring leaderboard without the math.'), true);
// "without" is one word. It read as "with out" in the first draft of this line.
check('without is one word', msg.includes('with out'), false);
check('it tells them to tap', msg.includes('Click here to join the round !'), true);
check('and the link is the last line', msg.trim().endsWith(inv.inviteLink(ROUND)), true);

// The wording is fixed on purpose: the text arrives from the organizer's own
// number, so it doesn't repeat who sent it or where they're playing.
check('the same message whatever the round is called', msg, inv.inviteMessage({ roundName: 'Anything', roundId: ROUND }));
check('the round id is the only thing that varies', inv.inviteMessage({ roundName: 'x', roundId: 'other' }).includes('round=other'), true);

// Every character has to survive a text message. A single non-GSM character
// (an em dash, a curly quote) cuts an SMS segment from 160 characters to 70,
// so the wording is checked for them rather than trusted.
const NON_GSM = /[^A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r^{}\\[~\]|€]/;
const offenders = [...msg].filter((c) => NON_GSM.test(c));
check('nothing in the message breaks GSM-7 encoding', offenders, []);
// 304 characters — two concatenated segments (153 each). Pinned so an edit that
// pushes it to three gets noticed rather than just quietly costing more to send.
check('it fits in two SMS segments', Math.ceil(msg.length / 153), 2);

// The store link doesn't exist yet, so the message must not imply one does.
check('no store link is configured yet', inv.APP_STORE_URL, null);
check('so the message never invents one', /apps\.apple\.com|play\.google\.com/.test(msg), false);
check('and adds no download line while there is nothing to download', msg.includes('Need the app'), false);

// ---------------------------------------------------------------- phones

check('a plain number', inv.normalizePhone('8015550142'), '8015550142');
check('punctuation is stripped', inv.normalizePhone('(801) 555-0142'), '8015550142');
check('a country code is kept', inv.normalizePhone('+1 801 555 0142'), '+18015550142');
check('too short is not a number', inv.normalizePhone('12345'), null);
check('too long is not a number', inv.normalizePhone('1234567890123456'), null);
check('empty is not a number', inv.normalizePhone('   '), null);
check('letters are not a number', inv.normalizePhone('call me'), null);

// The same person, typed two ways, must not become two players.
check('same number, different formatting', inv.samePhone('(801) 555-0142', '8015550142'), true);
check('same number with a country code', inv.samePhone('+1 801 555 0142', '801-555-0142'), true);
check('different numbers', inv.samePhone('8015550142', '8015550143'), false);
check('nothing matches nothing', inv.samePhone('', ''), false);

check('a name is tidied', inv.cleanName('  Daniel   Mullins '), 'Daniel Mullins');

// ---------------------------------------------------------------- the checklist

const empty = inv.setupSteps({
  hasRound: false,
  roundName: '',
  courseName: null,
  holeCount: 0,
  teeName: null,
  playerCount: 0,
  teamsOn: false,
  teamCount: 0,
  gamesOn: 0,
});
check('five steps', empty.length, 5);
// The order is the order a round is actually built — teams can't be drawn
// before there are players to draw from.
check('in build order', empty.map((s) => s.key), ['round', 'course', 'players', 'teams', 'games']);
check('nothing is done yet', empty.every((s) => !s.done), true);
check('the first thing to do is create the round', inv.nextStep(empty).key, 'round');
check('and it is not ready to play', inv.readyToPlay(empty), false);
check('teams are optional', empty.find((s) => s.key === 'teams').optional, true);
check('games are optional', empty.find((s) => s.key === 'games').optional, true);
check('the course is not', empty.find((s) => s.key === 'course').optional, false);

const mid = inv.setupSteps({
  hasRound: true,
  roundName: 'Saturday',
  courseName: 'Gladstan',
  holeCount: 18,
  teeName: 'Blue',
  playerCount: 1,
  teamsOn: false,
  teamCount: 0,
  gamesOn: 0,
});
check('the round shows as done', mid[0].done, true);
check('the course shows what was picked', mid[1].detail, 'Gladstan · Blue · 18 holes');
// One player is a round with nobody to play against.
check('one player is not enough', mid[2].done, false);
check('and it says so', mid[2].detail.includes('needs at least two'), true);
check('the next thing to do is the players', inv.nextStep(mid).key, 'players');

const ready = inv.setupSteps({
  hasRound: true,
  roundName: 'Saturday',
  courseName: 'Gladstan',
  holeCount: 18,
  teeName: 'Blue',
  playerCount: 4,
  teamsOn: false,
  teamCount: 0,
  gamesOn: 0,
});
check('four players is enough', ready[2].done, true);
// Teams and games are undone but optional, so the round can still start.
check('nothing required is left', inv.nextStep(ready), null);
check('so it is ready to play', inv.readyToPlay(ready), true);
check('even with no teams', ready[3].done, false);
check('and no games', ready[4].done, false);

const full = inv.setupSteps({
  hasRound: true,
  roundName: 'Saturday',
  courseName: 'Gladstan',
  holeCount: 18,
  teeName: 'Blue',
  playerCount: 4,
  teamsOn: true,
  teamCount: 2,
  gamesOn: 2,
});
check('a fully set up round has every step done', full.every((s) => s.done), true);
check('and reads the teams back', full[3].detail, '2 teams');
check('and the games', full[4].detail, '2 running');

// ------------------------------------------------- moving through the steps

check('the order matches the checklist', inv.SETUP_ORDER, empty.map((s) => s.key));
check('five steps to walk', inv.stepCount, 5);
check('the course is step two', inv.stepNumber('course'), 2);
check('games is the last', inv.stepNumber('games'), 5);

check('after the course comes the players', inv.stepAfter('course'), 'players');
check('before the course is the round', inv.stepBefore('course'), 'round');
// The ends must stop rather than wrap — a "next" off the end of the last step
// would send somebody round the loop again.
check('there is nothing after the last step', inv.stepAfter('games'), null);
check('and nothing before the first', inv.stepBefore('round'), null);
check('an unknown step has no next', inv.stepAfter('nonsense'), null);
check('nor a previous', inv.stepBefore('nonsense'), null);

// Every step needs somewhere to go, or a Next button lands on nothing.
check('every step has a route', inv.SETUP_ORDER.every((k) => !!inv.STEP_ROUTE[k]), true);
check('every step has a title', inv.SETUP_ORDER.every((k) => !!inv.STEP_TITLE[k]), true);
// The players step is the run-through itself — it's handled inline.
check('the players step is the setup screen', inv.STEP_ROUTE.players, '/setup');
check('the course step is the course tab', inv.STEP_ROUTE.course, '/(tabs)/course');

// Walking forward from the start must reach the end and stop.
const walked = [];
let cur = inv.SETUP_ORDER[0];
while (cur) {
  walked.push(cur);
  cur = inv.stepAfter(cur);
}
check('walking forward covers every step once', walked, inv.SETUP_ORDER);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All invite checks passed.');
