import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ROUND_ID } from '@/data/seed';

export type ScoreMap = Record<number, Record<string, number>>; // hole -> playerId -> strokes

type Row = { hole: number; player_id: string; strokes: number };

function mergeRows(prev: ScoreMap, rows: Row[]): ScoreMap {
  const next: ScoreMap = { ...prev };
  for (const r of rows) {
    next[r.hole] = { ...(next[r.hole] || {}), [r.player_id]: r.strokes };
  }
  return next;
}

// The live sync layer for a round's scores. Posting is local-first: the
// caller applies its own optimistic update to `scores` right away (so a
// golfer never waits on a network to record a four), and this hook pushes
// the same write to Supabase in the background and pulls in whatever
// everyone else's phones post, over the same realtime channel.
export function useLiveScores() {
  const [scores, setScores] = useState<ScoreMap>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;

    client
      .from('scores')
      .select('hole, player_id, strokes')
      .eq('round_id', ROUND_ID)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setScores((prev) => mergeRows(prev, data as Row[]));
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
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, []);

  const postScore = useCallback(async (hole: number, playerId: string, strokes: number) => {
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase
      .from('scores')
      .upsert(
        { round_id: ROUND_ID, hole, player_id: playerId, strokes },
        { onConflict: 'round_id,hole,player_id' },
      );
    if (error) console.warn('postScore failed — will still show locally, retry next post:', error.message);
  }, []);

  return { scores, setScores, postScore, live: isSupabaseConfigured, connected };
}
