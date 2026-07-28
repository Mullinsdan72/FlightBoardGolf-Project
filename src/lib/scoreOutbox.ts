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

// One entry per hole+player: re-entering a score replaces the queued one rather
// than stacking a second write for the same cell.
export async function enqueue(
  roundId: string,
  entry: Omit<PendingScore, 'queuedAt'>,
): Promise<PendingScore[]> {
  const queue = await loadOutbox(roundId);
  const next = queue.filter((q) => keyOf(q) !== keyOf(entry));
  next.push({ ...entry, queuedAt: Date.now() });
  await saveOutbox(roundId, next);
  return next;
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

export async function dequeue(roundId: string, entries: PendingScore[]): Promise<PendingScore[]> {
  if (!entries.length) return loadOutbox(roundId);
  const done = new Set(entries.map(keyOf));
  const queue = await loadOutbox(roundId);
  // Only drop an entry if it hasn't been re-queued with a newer score since the
  // flush started — otherwise a correction made mid-sync would be discarded.
  const sentAt = new Map(entries.map((e) => [keyOf(e), e.queuedAt]));
  const next = queue.filter((q) => !(done.has(keyOf(q)) && q.queuedAt <= (sentAt.get(keyOf(q)) ?? 0)));
  await saveOutbox(roundId, next);
  return next;
}
