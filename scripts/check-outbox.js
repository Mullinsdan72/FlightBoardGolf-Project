#!/usr/bin/env node
/**
 * Exercises src/lib/scoreOutbox.ts against a fake AsyncStorage.
 *
 * This is the code standing between a golfer and a lost score, so it gets
 * tested rather than trusted: queue survives a "restart", re-entering a hole
 * replaces rather than duplicates, and a correction made while a sync is in
 * flight is not thrown away by the dequeue that follows.
 *
 *   node scripts/check-outbox.js
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-'));

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
    files: [path.join(root, 'src/lib/scoreOutbox.ts')],
  }),
);
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', tsconfigPath], { stdio: 'inherit' });

const STORAGE_MODULE = '@react-native-async-storage/async-storage';
const storagePath = require.resolve(STORAGE_MODULE, { paths: [root] });

// The emitted JS lives in a temp dir, so two kinds of request need redirecting:
// tsc does not rewrite the "@/" path alias, and a bare package name won't
// resolve from outside the repo's node_modules.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return originalResolve.call(this, path.join(outDir, request.slice(2)), ...rest);
  }
  if (request === STORAGE_MODULE) return storagePath;
  return originalResolve.call(this, request, ...rest);
};

// Stand-in for the phone's storage. Also lets us simulate an app restart by
// keeping the data while dropping every module's in-memory state.
let store = {};
const fakeStorage = {
  getItem: async (k) => (k in store ? store[k] : null),
  setItem: async (k, v) => {
    store[k] = v;
  },
  removeItem: async (k) => {
    delete store[k];
  },
  multiRemove: async (keys) => {
    for (const k of keys) delete store[k];
  },
};
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: { __esModule: true, default: fakeStorage },
};

const outboxPath = path.join(outDir, 'lib/scoreOutbox.js');
let ob = require(outboxPath);

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
};
const simulateRestart = () => {
  delete require.cache[outboxPath];
  ob = require(outboxPath);
};
const summary = (q) => q.map((e) => `${e.hole}:${e.playerId}=${e.strokes}`);

// Scores are stored per round, so every call carries the round it belongs to.
const R = 'round-a';
const OTHER = 'round-b';

(async () => {
  // A hole entered with no signal
  await ob.enqueue(R, { hole: 1, playerId: 'a', strokes: 5 });
  await ob.saveCachedScores(R, { 1: { a: 5 } });
  check('one score queued', summary(await ob.loadOutbox(R)), ['1:a=5']);

  // Force-quit / flat battery: the round must still be there
  simulateRestart();
  check('queue survives a restart', summary(await ob.loadOutbox(R)), ['1:a=5']);
  check('scores survive a restart', await ob.loadCachedScores(R), { 1: { a: 5 } });

  // Fixing a score you already entered replaces it — two writes for one cell
  // would let the older number win a race and overwrite the correction.
  await ob.enqueue(R, { hole: 1, playerId: 'a', strokes: 4 });
  check('re-entering a hole replaces it', summary(await ob.loadOutbox(R)), ['1:a=4']);

  // Several players, several holes
  await ob.enqueue(R, { hole: 1, playerId: 'b', strokes: 3 });
  await ob.enqueue(R, { hole: 2, playerId: 'a', strokes: 6 });
  check('queue holds each hole+player', summary(await ob.loadOutbox(R)).sort(), ['1:a=4', '1:b=3', '2:a=6']);

  // Signal returns: everything queued goes up and clears
  const inFlight = await ob.loadOutbox(R);
  check('nothing left after a good flush', summary(await ob.dequeue(R, inFlight)), []);

  // The race that would silently lose a correction: a score is changed while
  // the previous value is mid-upload. Dequeuing the sent batch must not drop
  // the newer entry.
  await ob.enqueue(R, { hole: 3, playerId: 'a', strokes: 7 });
  const sending = await ob.loadOutbox(R);
  await new Promise((r) => setTimeout(r, 2)); // ensure a later queuedAt
  await ob.enqueue(R, { hole: 3, playerId: 'a', strokes: 5 }); // player fixes it
  const after = await ob.dequeue(R, sending);
  check('a correction made mid-sync is kept', summary(after), ['3:a=5']);

  // A failed flush keeps everything, so a dropped connection loses nothing
  simulateRestart();
  check('failed flush leaves the queue intact', summary(await ob.loadOutbox(R)), ['3:a=5']);

  // Corrupt storage shouldn't take the app down at a tee box
  store[`flightboard.outbox.${R}`] = '{not json';
  simulateRestart();
  check('unreadable queue degrades to empty, not a crash', await ob.loadOutbox(R), []);

  // Rounds must not share a queue: an unsynced hole belongs to the round it was
  // entered in, and switching rounds must not carry it across.
  store = {};
  simulateRestart();
  await ob.enqueue(R, { hole: 4, playerId: 'a', strokes: 4 });
  await ob.enqueue(OTHER, { hole: 4, playerId: 'a', strokes: 9 });
  check('each round keeps its own queue', summary(await ob.loadOutbox(R)), ['4:a=4']);
  check('the other round is unaffected', summary(await ob.loadOutbox(OTHER)), ['4:a=9']);
  await ob.saveCachedScores(R, { 4: { a: 4 } });
  await ob.saveCachedScores(OTHER, { 4: { a: 9 } });
  check('cached scores are per round too', await ob.loadCachedScores(R), { 4: { a: 4 } });

  // Deleting a round must take its local cache with it, or its unsynced holes
  // retry forever against a row the server no longer has.
  await ob.clearRound(R);
  check('a deleted round leaves no queue behind', summary(await ob.loadOutbox(R)), []);
  check('a deleted round leaves no cached scores', await ob.loadCachedScores(R), {});
  check('deleting one round spares the other', summary(await ob.loadOutbox(OTHER)), ['4:a=9']);

  // ------------------------------------------- posting a hole for a four-ball
  //
  // The bug this exists for lost real scores from a real round and said
  // nothing. Queueing is a read-modify-write on one key, and posting a hole for
  // four players fired four of them in the same tick without waiting. All four
  // read the same queue, each wrote back a queue holding only its own score,
  // and the last one won — three scores gone before the network was involved.
  //
  // Nothing reported it: the screen was right (the cache is written in one go),
  // the queue emptied cleanly (the survivor sent fine), and "0 to sync" was
  // true. The only symptom was three players missing from everybody else's
  // leaderboard, and the survivor was always whoever came last in the list.
  await ob.clearRound('race');

  await Promise.all([
    ob.enqueue('race', { hole: 1, playerId: 'danny', strokes: 4 }),
    ob.enqueue('race', { hole: 1, playerId: 'jaxon', strokes: 5 }),
    ob.enqueue('race', { hole: 1, playerId: 'kory', strokes: 6 }),
    ob.enqueue('race', { hole: 1, playerId: 'kyler', strokes: 3 }),
  ]);
  const raced = await ob.loadOutbox('race');
  check('four scores queued at once all survive', raced.length, 4);
  check(
    'and every player is there, not just the last',
    raced.map((q) => q.playerId).sort(),
    ['danny', 'jaxon', 'kory', 'kyler'],
  );
  check('with their own strokes', raced.find((q) => q.playerId === 'danny')?.strokes, 4);

  // The batch form: one action by the golfer, one write to disk.
  await ob.clearRound('batch');
  const batched = await ob.enqueueMany('batch', [
    { hole: 7, playerId: 'a', strokes: 4 },
    { hole: 7, playerId: 'b', strokes: 5 },
    { hole: 7, playerId: 'c', strokes: 6 },
  ]);
  check('a whole hole queues in one go', batched.length, 3);
  check('and lands on disk', (await ob.loadOutbox('batch')).length, 3);

  // Re-posting a hole replaces those scores rather than stacking a second set.
  const corrected = await ob.enqueueMany('batch', [
    { hole: 7, playerId: 'a', strokes: 3 },
    { hole: 7, playerId: 'b', strokes: 5 },
    { hole: 7, playerId: 'c', strokes: 6 },
  ]);
  check('correcting a hole does not duplicate it', corrected.length, 3);
  check('and keeps the new number', corrected.find((q) => q.playerId === 'a')?.strokes, 3);

  // A correction racing the rest of the hole must not be lost either.
  await ob.clearRound('mixed');
  await Promise.all([
    ob.enqueueMany('mixed', [
      { hole: 2, playerId: 'a', strokes: 4 },
      { hole: 2, playerId: 'b', strokes: 4 },
    ]),
    ob.enqueue('mixed', { hole: 3, playerId: 'a', strokes: 7 }),
  ]);
  check('a single score racing a batch survives', (await ob.loadOutbox('mixed')).length, 3);

  await ob.clearRound('race');
  await ob.clearRound('batch');
  await ob.clearRound('mixed');

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} check(s) failed:\n`);
    for (const f of failures) console.error(`  ${f}\n`);
    process.exit(1);
  }
  console.log('All outbox checks passed.');
})();
