import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROUND_ID } from '@/data/seed';

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

const SCORES_KEY = `flightboard.scores.${ROUND_ID}`;
const OUTBOX_KEY = `flightboard.outbox.${ROUND_ID}`;

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

export const loadCachedScores = () => readJson<ScoreMap>(SCORES_KEY, {});
export const saveCachedScores = (scores: ScoreMap) => writeJson(SCORES_KEY, scores);

export const loadOutbox = () => readJson<PendingScore[]>(OUTBOX_KEY, []);
export const saveOutbox = (queue: PendingScore[]) => writeJson(OUTBOX_KEY, queue);

// One entry per hole+player: re-entering a score replaces the queued one rather
// than stacking a second write for the same cell.
export async function enqueue(entry: Omit<PendingScore, 'queuedAt'>): Promise<PendingScore[]> {
  const queue = await loadOutbox();
  const next = queue.filter((q) => keyOf(q) !== keyOf(entry));
  next.push({ ...entry, queuedAt: Date.now() });
  await saveOutbox(next);
  return next;
}

export async function dequeue(entries: PendingScore[]): Promise<PendingScore[]> {
  if (!entries.length) return loadOutbox();
  const done = new Set(entries.map(keyOf));
  const queue = await loadOutbox();
  // Only drop an entry if it hasn't been re-queued with a newer score since the
  // flush started — otherwise a correction made mid-sync would be discarded.
  const sentAt = new Map(entries.map((e) => [keyOf(e), e.queuedAt]));
  const next = queue.filter((q) => !(done.has(keyOf(q)) && q.queuedAt <= (sentAt.get(keyOf(q)) ?? 0)));
  await saveOutbox(next);
  return next;
}
