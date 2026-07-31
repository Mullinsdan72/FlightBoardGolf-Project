import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { roundStatus, type RoundStatus } from '@/lib/opening';

export type HistoryPlayer = {
  id: string;
  name: string;
  handicap: number;
  /** Strokes over the holes actually posted. Null when they posted none. */
  gross: number | null;
  /** To par over those same holes — not the whole card. */
  toPar: number | null;
  holesPlayed: number;
};

export type HistoryRound = {
  roundId: string;
  players: HistoryPlayer[];
  holeCount: number;
  /** How many cards in this round are signed. Closed is all of them. */
  cardsSigned: number;
  /** Holes with a score on them, from anyone. Zero means never teed off. */
  holesPosted: number;
  status: RoundStatus;
};

/**
 * Every round's finishing order, for the Activity tab.
 *
 * Deliberately separate from `useLiveScores`, which is one round, live, and
 * realtime. This is all rounds, once, on demand — a second realtime channel on
 * the same topic is what crashed the app the first time two screens both wanted
 * scores.
 *
 * Three queries rather than a join, because PostgREST joins across three tables
 * with aggregates get unreadable, and this runs once when a tab opens rather
 * than per hole.
 *
 * **Par comes from `round_holes`, per round.** Using the current round's holes
 * would score a nine-hole round in June against eighteen holes in July. A round
 * keeps the card it was played on (rule: hole data is never a constant).
 */
export function useRoundHistory(roundIds: string[]) {
  const [history, setHistory] = useState<Record<string, HistoryRound>>({});
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const key = roundIds.join(',');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || roundIds.length === 0) {
      setLoaded(true);
      return;
    }
    const [rosterRes, scoreRes, holeRes, signRes] = await Promise.all([
      supabase
        .from('round_players')
        .select('round_id, player_id, players(id, name, handicap)')
        .in('round_id', roundIds),
      supabase.from('scores').select('round_id, player_id, hole, strokes').in('round_id', roundIds),
      supabase.from('round_holes').select('round_id, hole, par').in('round_id', roundIds),
      // Which cards are signed, so ACTIVITY can say a round is closed without
      // asking each one separately. Same rule as the opening tab reads.
      supabase.from('signoffs').select('round_id, player_id').in('round_id', roundIds),
    ]);

    if (rosterRes.error || scoreRes.error || holeRes.error) {
      const message =
        rosterRes.error?.message ?? scoreRes.error?.message ?? holeRes.error?.message ?? 'Could not load past rounds.';
      console.warn('useRoundHistory failed:', message);
      // Loaded even on failure. A `loaded` flag that gates a whole render must
      // be set on the failure path too, or the loading state becomes permanent —
      // this app has shipped that blank screen twice already.
      setError(message);
      setLoaded(true);
      return;
    }

    // par per round per hole, so a score can be measured against the hole it
    // was actually played on.
    const parOf = new Map<string, number>();
    const holeCount = new Map<string, number>();
    for (const h of (holeRes.data ?? []) as any[]) {
      parOf.set(`${h.round_id}|${h.hole}`, h.par);
      holeCount.set(h.round_id, (holeCount.get(h.round_id) ?? 0) + 1);
    }

    type Tally = { gross: number; toPar: number; holes: number };
    const tally = new Map<string, Tally>();
    for (const s of (scoreRes.data ?? []) as any[]) {
      const par = parOf.get(`${s.round_id}|${s.hole}`);
      // A score on a hole the round has no card for cannot be measured, so it
      // is not counted rather than counted as par.
      if (par == null) continue;
      const k = `${s.round_id}|${s.player_id}`;
      const t = tally.get(k) ?? { gross: 0, toPar: 0, holes: 0 };
      t.gross += s.strokes;
      t.toPar += s.strokes - par;
      t.holes += 1;
      tally.set(k, t);
    }

    // A failed signoffs read means nothing is signed, never that everything is.
    // Rule 8 is enforced by a row existing, and a round wrongly shown as closed
    // is a round somebody thinks they cannot edit.
    if (signRes.error) console.warn('useRoundHistory signoffs failed:', signRes.error.message);
    const signed = new Map<string, number>();
    for (const s of (signRes.data ?? []) as any[]) signed.set(s.round_id, (signed.get(s.round_id) ?? 0) + 1);

    const posted = new Map<string, Set<number>>();
    for (const s of (scoreRes.data ?? []) as any[]) {
      const set = posted.get(s.round_id) ?? new Set<number>();
      set.add(s.hole);
      posted.set(s.round_id, set);
    }

    const out: Record<string, HistoryRound> = {};
    for (const r of (rosterRes.data ?? []) as any[]) {
      const p = r.players;
      if (!p) continue;
      const t = tally.get(`${r.round_id}|${r.player_id}`);
      const entry = (out[r.round_id] ??= {
        roundId: r.round_id,
        players: [],
        holeCount: holeCount.get(r.round_id) ?? 0,
        cardsSigned: signed.get(r.round_id) ?? 0,
        holesPosted: posted.get(r.round_id)?.size ?? 0,
        status: 'not-started',
      });
      entry.players.push({
        id: p.id,
        name: p.name,
        handicap: p.handicap,
        gross: t ? t.gross : null,
        toPar: t ? t.toPar : null,
        holesPlayed: t ? t.holes : 0,
      });
    }

    // Finishing order: anyone who posted nothing sorts last rather than first,
    // which a null would otherwise do.
    for (const r of Object.values(out)) {
      r.players.sort((a, b) => {
        if (a.toPar == null && b.toPar == null) return a.name.localeCompare(b.name);
        if (a.toPar == null) return 1;
        if (b.toPar == null) return -1;
        return a.toPar - b.toPar;
      });
    }

    for (const r of Object.values(out)) {
      r.status = roundStatus({
        holesPosted: r.holesPosted,
        fieldSize: r.players.length,
        cardsSigned: r.cardsSigned,
      });
    }

    setError(null);
    setHistory(out);
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    setLoaded(!isSupabaseConfigured);
    load();
  }, [load]);

  /**
   * Unlock every card in a round, so its scores can be edited again.
   *
   * Rule 8 says reopening a signed card takes the organizer, and this is that
   * rule applied to a whole round at once — the card-by-card version already
   * lives on CARD. It is here because the place you notice a wrong score is
   * usually the leaderboard afterwards, not the scorecard at the time.
   *
   * Deletes signatures, never scores. A reopened round is the same round with
   * its cards unlocked; nothing that was posted is touched.
   */
  const reopenRound = useCallback(async (roundId: string): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase) return null;
    const { error: err } = await supabase.from('signoffs').delete().eq('round_id', roundId);
    if (err) {
      console.warn('reopenRound failed:', err.message);
      return err.message;
    }
    await load();
    return null;
  }, [load]);

  return { history, historyLoaded: loaded, historyError: error, reloadHistory: load, reopenRound };
}
