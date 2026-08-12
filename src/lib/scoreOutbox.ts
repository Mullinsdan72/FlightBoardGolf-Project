import AsyncStorage from '@react-native-async-storage/async-storage';

// Durable local storage for scores, so CLAUDE.md rule 1 is actually true:
// "the write succeeds on the phone and syncs later."
//
// Two things live here, both on the phone's own disk:
//
//   scores  — every score this device knows about. Read on launch so a round
//             survives a force-quit or a dead battery even with no signal.
//   outbox  — scores not yet accepted by the server. Retried until they are.
//
// Without this, a score entered out of signal lived only in React state: the
// number showed on screen, the upsert failed, and a reload silently lost the
// hole. On a course in a canyon that means losing real strokes from a real
// round, which is the one bug that would make a golfer stop trusting the app.

// Keyed per round, so switching rounds can't show one round's scores against
// another's card, and an unsynced hole stays attached to the round it belongs to.
const scoresKey = (roundId: string) => `flightboard.scores.${roundId}`;
const outboxKey = (roundId: string) => `flightboard.outbox.${roundId}`;

export type ScoreMap = Record<number, Record<string, number>>; // hole -> playerId -> strokes

export type PendingScore = {
  hole: number;
  playerId: string;
  strokes: number;
  queuedAt: number;
};

const keyOf = (p: { hole: number; playerId: string }) => `${p.hole}:${p.playerId}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`Could not read ${key} from local storage:`, err);
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Nothing useful to do here, but never let a storage failure throw into a
    // tap handler — the golfer's score must still land on screen.
    console.warn(`Could not write ${key} to local storage:`, err);
  }
}

export const loadCachedScores = (roundId: string) => readJson<ScoreMap>(scoresKey(roundId), {});
export const saveCachedScores = (roundId: string, scores: ScoreMap) =>
  writeJson(scoresKey(roundId), scores);

export const loadOutbox = (roundId: string) => readJson<PendingScore[]>(outboxKey(roundId), []);
export const saveOutbox = (roundId: string, queue: PendingScore[]) =>
  writeJson(outboxKey(roundId), queue);

/**
 * Every change to the outbox runs one at a time.
 *
 * **This is a data-loss fix, and the loss was silent.** Queueing a score is a
 * read-modify-write on one storage key, and posting a hole for a four-ball fired
 * four of them in the same tick without waiting. All four read the same queue,
 * each appended its own score, each wrote the result back — so the last write
 * won and three scores were gone before the network was ever involved.
 *
 * Nothing reported it. The screen was right, because the local cache is written
 * in one go; the outbox emptied cleanly, because the one surviving row sent
 * fine; and "0 to sync" was true. The only symptom was three players missing
 * from the leaderboard on everybody else's phone, and the survivor was always
 * whoever came last in the list.
 *
 * A chain rather than a lock: each write waits for the one before it, and a
 * failure never stalls the ones behind it.
 */
let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(run: () => Promise<T>): Promise<T> {
  const next = writes.then(run, run);
  writes = next.catch(() => undefined);
  return next;
}

// One entry per hole+player: re-entering a score replaces the queued one rather
// than stacking a second write for the same cell.
export function enqueue(
  roundId: string,
  entry: Omit<PendingScore, 'queuedAt'>,
): Promise<PendingScore[]> {
  return enqueueMany(roundId, [entry]);
}

/**
 * Queue a whole hole at once — every card this phone is keeping, one write.
 *
 * The batch form exists because posting a hole for four players is one action
 * by the golfer and should be one write to disk. Serialised as well, so it is
 * safe even against a stray single `enqueue` arriving at the same moment.
 */
export function enqueueMany(
  roundId: string,
  entries: Omit<PendingScore, 'queuedAt'>[],
): Promise<PendingScore[]> {
  return serialize(async () => {
    if (!entries.length) return loadOutbox(roundId);
    const queue = await loadOutbox(roundId);
    const replacing = new Set(entries.map(keyOf));
    const queuedAt = Date.now();
    const next = queue.filter((q) => !replacing.has(keyOf(q)));
    for (const entry of entries) next.push({ ...entry, queuedAt });
    await saveOutbox(roundId, next);
    return next;
  });
}

// A deleted round takes its local cache with it. Otherwise an unsynced hole
// would sit in that round's outbox retrying forever against a row that no
// longer exists (the server rejects it on the foreign key), and the phone would
// keep storing a card nobody can open.
export async function clearRound(roundId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([scoresKey(roundId), outboxKey(roundId)]);
  } catch (err) {
    console.warn(`Could not clear local storage for round ${roundId}:`, err);
  }
}

/**
 * Every round this phone still owes the server scores for.
 *
 * The outbox is keyed per round, and for a long time only the *open* round's
 * queue was ever retried. So setting up tomorrow's round while playing today's
 * — which is an entirely reasonable thing to do between nines — switched the
 * active round and left today's unsynced holes with nothing running to send
 * them. They sat on the phone, correct on screen and invisible to everybody
 * else, for ever.
 *
 * Read off the keys rather than a list we maintain, because a list we maintain
 * is a second place for this to be wrong.
 */
export async function roundsWithPending(): Promise<string[]> {
  const prefix = 'flightboard.outbox.';
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  } catch (err) {
    console.warn('Could not list pending rounds:', err);
    return [];
  }
}

// Serialised for the same reason `enqueue` is: this reads the queue, decides
// what to drop and writes it back, and a score queued between the read and the
// write would be thrown away by it.
export function dequeue(roundId: string, entries: PendingScore[]): Promise<PendingScore[]> {
  return serialize(async () => {
    if (!entries.length) return loadOutbox(roundId);
    const done = new Set(entries.map(keyOf));
    const queue = await loadOutbox(roundId);
    // Only drop an entry if it hasn't been re-queued with a newer score since the
    // flush started — otherwise a correction made mid-sync would be discarded.
    const sentAt = new Map(entries.map((e) => [keyOf(e), e.queuedAt]));
    const next = queue.filter((q) => !(done.has(keyOf(q)) && q.queuedAt <= (sentAt.get(keyOf(q)) ?? 0)));
    await saveOutbox(roundId, next);
    return next;
  });
}
