import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  dequeue,
  enqueue,
  loadCachedScores,
  loadOutbox,
  roundsWithPending,
  saveCachedScores,
  type PendingScore,
  type ScoreMap,
} from '@/lib/scoreOutbox';

export type { ScoreMap };

type Row = { hole: number; player_id: string; strokes: number };

function mergeRows(prev: ScoreMap, rows: Row[]): ScoreMap {
  const next: ScoreMap = { ...prev };
  for (const r of rows) {
    next[r.hole] = { ...(next[r.hole] || {}), [r.player_id]: r.strokes };
  }
  return next;
}

const RETRY_MS = 15_000;

// The live sync layer for a round's scores, local-first for real (CLAUDE.md
// rule 1): a posted score is written to the phone's own storage and queued in
// an outbox before the network is involved at all. It shows on screen
// immediately, survives a force-quit or a flat battery, and syncs whenever
// signal comes back. A golfer never waits on a network to record a four, and
// never loses one to a canyon.
export function useLiveScores(roundId: string | null | undefined) {
  const [scores, setScores] = useState<ScoreMap>({});
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const flushing = useRef(false);

  // Local disk first, so a round is on screen before any network call resolves.
  // Re-runs on a round switch, and replaces rather than merges — one round's
  // scores must never appear against another round's card.
  useEffect(() => {
    if (!roundId) {
      setScores({});
      setPendingCount(0);
      setHydrated(false);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    (async () => {
      const [cached, queue] = await Promise.all([loadCachedScores(roundId), loadOutbox(roundId)]);
      if (cancelled) return;
      setScores(cached);
      setPendingCount(queue.length);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  // Mirror every change back to disk once hydration has happened — writing
  // before then would persist an empty map over a real cached round.
  useEffect(() => {
    if (!hydrated || !roundId) return;
    saveCachedScores(roundId, scores);
  }, [scores, hydrated, roundId]);

  const flushOutbox = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || flushing.current || !roundId) return;
    const client = supabase;
    flushing.current = true;
    try {
      const queue = await loadOutbox(roundId);
      if (!queue.length) {
        setPendingCount(0);
        return;
      }
      const rows = queue.map((q) => ({
        round_id: roundId,
        hole: q.hole,
        player_id: q.playerId,
        strokes: q.strokes,
      }));
      const { error } = await client.from('scores').upsert(rows, { onConflict: 'round_id,hole,player_id' });
      if (error) {
        // **One refused row must not strand the rest.** The whole queue went up
        // as a single statement, so a single score the server would not take —
        // a player who claimed their row mid-round, say — failed the batch and
        // every other hole with it, on every retry, for ever. Three players'
        // scores sat on one phone that way while a fourth's went through.
        //
        // So on failure, go row by row. Anything the server accepts is done;
        // anything it refuses stays queued rather than being dropped, because
        // dropping it is exactly how a score gets lost.
        console.warn(`Score sync failed as a batch, retrying one at a time:`, error.message);
        const sent: PendingScore[] = [];
        for (const q of queue) {
          const { error: rowErr } = await client
            .from('scores')
            .upsert(
              [{ round_id: roundId, hole: q.hole, player_id: q.playerId, strokes: q.strokes }],
              { onConflict: 'round_id,hole,player_id' },
            );
          if (rowErr) console.warn(`Hole ${q.hole} for ${q.playerId} still queued:`, rowErr.message);
          else sent.push(q as PendingScore);
        }
        const left = await dequeue(roundId, sent);
        setPendingCount(left.length);
        return;
      }
      const remaining = await dequeue(roundId, queue as PendingScore[]);
      setPendingCount(remaining.length);
    } finally {
      flushing.current = false;
    }
  }, [roundId]);

  /**
   * Send scores for **every** round this phone still owes, not just the open one.
   *
   * The flush above is keyed to the round you are looking at, which was fine
   * for as long as nobody opened another one mid-play. Then somebody set up
   * tomorrow's round between nines — an entirely reasonable thing to do — and
   * the active round changed. Today's unsynced holes were left with nothing
   * running to send them: correct on the phone that entered them, invisible to
   * everybody else, and never retried again.
   *
   * Row by row, and nothing is dropped unless the server took it.
   */
  const flushOtherRounds = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    const pending = await roundsWithPending();
    for (const rid of pending) {
      if (rid === roundId) continue;
      const queue = await loadOutbox(rid);
      if (!queue.length) continue;
      const sent: PendingScore[] = [];
      for (const q of queue) {
        const { error } = await client
          .from('scores')
          .upsert(
            [{ round_id: rid, hole: q.hole, player_id: q.playerId, strokes: q.strokes }],
            { onConflict: 'round_id,hole,player_id' },
          );
        if (error) console.warn(`Queued hole ${q.hole} in round ${rid} still not sent:`, error.message);
        else sent.push(q);
      }
      if (sent.length) await dequeue(rid, sent);
    }
  }, [roundId]);

  // Pull the server's copy, then subscribe. Anything queued locally wins on
  // merge, since it may not have reached the server yet.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !hydrated || !roundId) return;
    const client = supabase;
    let cancelled = false;

    client
      .from('scores')
      .select('hole, player_id, strokes')
      .eq('round_id', roundId)
      .then(async ({ data, error }) => {
        if (cancelled || error || !data) return;
        const queue = await loadOutbox(roundId);
        const queuedKeys = new Set(queue.map((q) => `${q.hole}:${q.playerId}`));
        const serverRows = (data as Row[]).filter((r) => !queuedKeys.has(`${r.hole}:${r.player_id}`));
        setScores((prev) => mergeRows(prev, serverRows));
        flushOutbox();
      });

    const channel = client
      .channel(`scores:${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${roundId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Row | null;
          if (!row) return;
          setScores((prev) => mergeRows(prev, [row]));
        },
      )
      .subscribe((status) => {
        const up = status === 'SUBSCRIBED';
        setConnected(up);
        if (up) flushOutbox();
      });

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [hydrated, roundId, flushOutbox]);

  // Keep trying on a timer, and again whenever the app comes back to the
  // foreground — signal usually returns while the phone is in a pocket.
  //
  // **Every round, not just this one.** `pendingCount` only counts the open
  // round, so gating the sweep on it would leave a round you switched away from
  // stranded exactly as before — the count is zero precisely because those
  // scores belong to a round nothing is watching. The sweep is cheap when there
  // is nothing to send: one key listing and no network at all.
  useEffect(() => {
    if (!hydrated) return;
    flushOtherRounds();
    const timer = setInterval(() => {
      if (pendingCount > 0) flushOutbox();
      flushOtherRounds();
    }, RETRY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushOutbox();
        flushOtherRounds();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [hydrated, pendingCount, flushOutbox, flushOtherRounds]);

  // Never throws and never awaits the network: queue it, then try to send.
  const postScore = useCallback(
    async (hole: number, playerId: string, strokes: number) => {
      if (!roundId) return;
      const queue = await enqueue(roundId, { hole, playerId, strokes });
      setPendingCount(queue.length);
      flushOutbox();
    },
    [roundId, flushOutbox],
  );

  return {
    scores,
    setScores,
    postScore,
    live: isSupabaseConfigured,
    connected,
    pendingCount,
    scoresHydrated: hydrated,
  };
}
