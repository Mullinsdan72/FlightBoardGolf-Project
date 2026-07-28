import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ROUND_ID } from '@/data/seed';
import {
  dequeue,
  enqueue,
  loadCachedScores,
  loadOutbox,
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
export function useLiveScores() {
  const [scores, setScores] = useState<ScoreMap>({});
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const flushing = useRef(false);

  // Local disk first, so a round is on screen before any network call resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cached, queue] = await Promise.all([loadCachedScores(), loadOutbox()]);
      if (cancelled) return;
      setScores((prev) => ({ ...cached, ...prev }));
      setPendingCount(queue.length);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror every change back to disk once hydration has happened — writing
  // before then would persist an empty map over a real cached round.
  useEffect(() => {
    if (!hydrated) return;
    saveCachedScores(scores);
  }, [scores, hydrated]);

  const flushOutbox = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || flushing.current) return;
    const client = supabase;
    flushing.current = true;
    try {
      const queue = await loadOutbox();
      if (!queue.length) {
        setPendingCount(0);
        return;
      }
      const rows = queue.map((q) => ({
        round_id: ROUND_ID,
        hole: q.hole,
        player_id: q.playerId,
        strokes: q.strokes,
      }));
      const { error } = await client.from('scores').upsert(rows, { onConflict: 'round_id,hole,player_id' });
      if (error) {
        // Still offline, or the server refused. Keep the queue and try again —
        // dropping it here is exactly how a score gets lost.
        console.warn(`Score sync failed, ${queue.length} still queued:`, error.message);
        setPendingCount(queue.length);
        return;
      }
      const remaining = await dequeue(queue as PendingScore[]);
      setPendingCount(remaining.length);
    } finally {
      flushing.current = false;
    }
  }, []);

  // Pull the server's copy, then subscribe. Anything queued locally wins on
  // merge, since it may not have reached the server yet.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !hydrated) return;
    const client = supabase;
    let cancelled = false;

    client
      .from('scores')
      .select('hole, player_id, strokes')
      .eq('round_id', ROUND_ID)
      .then(async ({ data, error }) => {
        if (cancelled || error || !data) return;
        const queue = await loadOutbox();
        const queuedKeys = new Set(queue.map((q) => `${q.hole}:${q.playerId}`));
        const serverRows = (data as Row[]).filter((r) => !queuedKeys.has(`${r.hole}:${r.player_id}`));
        setScores((prev) => mergeRows(prev, serverRows));
        flushOutbox();
      });

    const channel = client
      .channel(`scores:${ROUND_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${ROUND_ID}` },
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
  }, [hydrated, flushOutbox]);

  // Keep trying on a timer, and again whenever the app comes back to the
  // foreground — signal usually returns while the phone is in a pocket.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setInterval(() => {
      if (pendingCount > 0) flushOutbox();
    }, RETRY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushOutbox();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [hydrated, pendingCount, flushOutbox]);

  // Never throws and never awaits the network: queue it, then try to send.
  const postScore = useCallback(
    async (hole: number, playerId: string, strokes: number) => {
      const queue = await enqueue({ hole, playerId, strokes });
      setPendingCount(queue.length);
      flushOutbox();
    },
    [flushOutbox],
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
