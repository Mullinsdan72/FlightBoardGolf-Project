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

check('it opens by saying what happened', msg.startsWith("You've been added to Flight Board Golf."), true);
// Matches the wordmark, which reads FLIGHT BOARD GOLF.
check('the brand is capitalised', msg.includes('Flight Board Golf'), true);
// Nothing time-bound in the wording, so an invite sent the night before still
// reads correctly the next morning.
check('it does not claim the round is today', msg.toLowerCase().includes('today'), false);
check('it leads on the payoff', msg.includes('A live scoring leaderboard without the math.'), true);
check('it mentions the games', msg.includes('the games being played inside it'), true);
check('it says you keep your own score', msg.includes('you keep your own score'), true);
// "Live" now leads. It used to sit after "in real time", which said the same
// thing one sentence earlier.
check('nothing says real time twice', msg.includes('in real time'), false);
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
// 274 characters — two concatenated segments (153 each). Pinned so an edit that
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

// ------------------------------------------------- dates a person can pick

const base = new Date(2026, 6, 29); // 29 July 2026, local time
check('today', inv.isoDaysFromNow(0, base), '2026-07-29');
check('tomorrow', inv.isoDaysFromNow(1, base), '2026-07-30');
// Month and year boundaries are where hand-rolled date maths goes wrong.
check('over a month end', inv.isoDaysFromNow(3, base), '2026-08-01');
check('over a year end', inv.isoDaysFromNow(1, new Date(2026, 11, 31)), '2027-01-01');
// Built from local date parts, not from a UTC ISO string: toISOString() on an
// evening in the western hemisphere returns tomorrow's date.
check('a late evening still counts as today', inv.isoDaysFromNow(0, new Date(2026, 6, 29, 23, 30)), '2026-07-29');
check('months and days are zero padded', inv.isoDaysFromNow(0, new Date(2026, 0, 5)), '2026-01-05');

check('a round names itself after the day', inv.defaultRoundName('2026-08-01').endsWith('round'), true);
check('and that name is never empty', inv.defaultRoundName('2026-08-01').length > 6, true);
check('rubbish in gives rubbish back, not a crash', inv.defaultRoundName('nonsense'), 'nonsense round');

// ---------------------------------------------------------------- the checklist

// The setup-checklist assertions went with the run-through they described.
// Their subject — that a suggested team draw is not a saved one — survives in
// CLAUDE.md and in the teams screen's own red box.


// ------------------------------------------------- invitations waiting for you
const waiting = (over) => ({
  playerId: 'pl',
  playerName: 'Dan',
  roundId: 'r1',
  roundName: 'Saturday',
  courseName: 'Gladstan',
  playedOn: '2026-08-01',
  ...over,
});
const noFilter = { joinedRoundIds: [], declinedRoundIds: [] };

check('an invitation to a round you are not in stands', inv.pendingInvites([waiting()], noFilter).map((i) => i.roundId), ['r1']);
check(
  'a round you already play is not an invitation',
  inv.pendingInvites([waiting()], { joinedRoundIds: ['r1'], declinedRoundIds: [] }),
  [],
);
// "Not now" has to stick or the question becomes noise you dismiss unread.
check(
  'a round you declined is not asked again',
  inv.pendingInvites([waiting()], { joinedRoundIds: [], declinedRoundIds: ['r1'] }),
  [],
);
check(
  'two player rows in one round ask once',
  inv.pendingInvites([waiting({ playerId: 'a' }), waiting({ playerId: 'b' })], noFilter).length,
  1,
);
check(
  'and it is the first one, not the last',
  inv.pendingInvites([waiting({ playerId: 'a' }), waiting({ playerId: 'b' })], noFilter)[0].playerId,
  'a',
);
check(
  'separate rounds both stand',
  inv.pendingInvites([waiting({ roundId: 'r1' }), waiting({ roundId: 'r2', playedOn: '2026-08-02' })], noFilter).map((i) => i.roundId),
  ['r1', 'r2'],
);
check(
  'the round played first is asked about first',
  inv.pendingInvites(
    [waiting({ roundId: 'late', playedOn: '2026-09-01' }), waiting({ roundId: 'soon', playedOn: '2026-08-01' })],
    noFilter,
  ).map((i) => i.roundId),
  ['soon', 'late'],
);
check(
  'a round with no date goes last, not first',
  inv.pendingInvites(
    [waiting({ roundId: 'undated', playedOn: null }), waiting({ roundId: 'dated', playedOn: '2026-08-01' })],
    noFilter,
  ).map((i) => i.roundId),
  ['dated', 'undated'],
);
check('nothing waiting is an empty list, not a null', inv.pendingInvites([], noFilter), []);
check(
  'joined and declined together still filter',
  inv.pendingInvites([waiting({ roundId: 'a' }), waiting({ roundId: 'b' }), waiting({ roundId: 'c' })], {
    joinedRoundIds: ['a'],
    declinedRoundIds: ['b'],
  }).map((i) => i.roundId),
  ['c'],
);

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log('All invite checks passed.');
