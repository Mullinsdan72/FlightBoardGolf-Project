import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROUND_ID } from '@/data/seed';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  buildLedger,
  plannedWolfFor,
  settleUp,
  shuffled,
  type WolfDecision,
  type WolfLedger,
  type Payment,
} from '@/lib/wolf';
import type { ScoreMap } from '@/lib/scoreOutbox';
import type { Hole } from '@/data/seed';

export type WolfState = {
  enabled: boolean;
  stake: number;
  loneMultiplier: number;
  order: string[];
  reshuffleEachRound: boolean;
};

const DEFAULTS: WolfState = {
  enabled: false,
  stake: 5,
  loneMultiplier: 3,
  order: [],
  reshuffleEachRound: true,
};

// Wolf's live state for the round. Settings and per-hole decisions are stored;
// every figure of money is derived (src/lib/wolf.ts) so it can never drift from
// the scores it came from.
export function useWolf(playerIds: string[], holes: Hole[], scores: ScoreMap) {
  const [state, setState] = useState<WolfState>(DEFAULTS);
  const [decisions, setDecisions] = useState<WolfDecision[]>([]);
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const [gameRes, holesRes] = await Promise.all([
      supabase
        .from('wolf_games')
        .select('enabled, stake, lone_multiplier, player_order, reshuffle_each_round')
        .eq('round_id', ROUND_ID)
        .maybeSingle(),
      supabase
        .from('wolf_holes')
        .select('hole, wolf_player_id, partner_player_id')
        .eq('round_id', ROUND_ID)
        .order('hole'),
    ]);
    if (gameRes.data) {
      const g = gameRes.data as any;
      setState({
        enabled: !!g.enabled,
        stake: Number(g.stake) || 0,
        loneMultiplier: g.lone_multiplier ?? 3,
        order: Array.isArray(g.player_order) ? g.player_order : [],
        reshuffleEachRound: !!g.reshuffle_each_round,
      });
    }
    setDecisions(
      ((holesRes.data ?? []) as any[]).map((r) => ({
        hole: r.hole,
        wolfId: r.wolf_player_id,
        partnerId: r.partner_player_id ?? null,
      })),
    );
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Follow decisions made on someone else's phone — the wolf picks a partner on
  // their own device and the rest of the group needs to see it.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`wolf:${ROUND_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wolf_holes', filter: `round_id=eq.${ROUND_ID}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wolf_games', filter: `round_id=eq.${ROUND_ID}` }, () => load())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [load]);

  const persist = useCallback(async (patch: Partial<WolfState>) => {
    setState((prev) => ({ ...prev, ...patch }));
    if (!isSupabaseConfigured || !supabase) return;
    const row: Record<string, unknown> = { round_id: ROUND_ID };
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.stake !== undefined) row.stake = patch.stake;
    if (patch.loneMultiplier !== undefined) row.lone_multiplier = patch.loneMultiplier;
    if (patch.order !== undefined) row.player_order = patch.order;
    if (patch.reshuffleEachRound !== undefined) row.reshuffle_each_round = patch.reshuffleEachRound;
    const { error } = await supabase.from('wolf_games').upsert(row, { onConflict: 'round_id' });
    if (error) console.warn('wolf settings save failed:', error.message);
  }, []);

  // The rotation only covers players actually in the round. Anyone added later
  // is appended rather than reshuffled in, so joining mid-round can't rewrite
  // who has the wolf on holes still to come.
  const order = useMemo(() => {
    const inRound = state.order.filter((id) => playerIds.includes(id));
    const missing = playerIds.filter((id) => !inRound.includes(id));
    return [...inRound, ...missing];
  }, [state.order, playerIds]);

  useEffect(() => {
    if (!loaded || !state.enabled) return;
    // Persist the reconciled order once, so what's on screen matches what's stored.
    if (order.length !== state.order.length || order.some((id, i) => id !== state.order[i])) {
      persist({ order });
    }
  }, [loaded, state.enabled, order, state.order, persist]);

  const decisionFor = useCallback(
    (hole: number) => decisions.find((d) => d.hole === hole) ?? null,
    [decisions],
  );

  const wolfFor = useCallback(
    (hole: number) => plannedWolfFor(order, hole, decisions),
    [order, decisions],
  );

  const decide = useCallback(
    async (hole: number, wolfId: string, partnerId: string | null) => {
      setDecisions((prev) => [...prev.filter((d) => d.hole !== hole), { hole, wolfId, partnerId }]);
      if (!isSupabaseConfigured || !supabase) return;
      const { error } = await supabase.from('wolf_holes').upsert(
        { round_id: ROUND_ID, hole, wolf_player_id: wolfId, partner_player_id: partnerId },
        { onConflict: 'round_id,hole' },
      );
      if (error) console.warn('wolf decision save failed:', error.message);
    },
    [],
  );

  const undecide = useCallback(async (hole: number) => {
    setDecisions((prev) => prev.filter((d) => d.hole !== hole));
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase.from('wolf_holes').delete().eq('round_id', ROUND_ID).eq('hole', hole);
    if (error) console.warn('wolf undo failed:', error.message);
  }, []);

  const shuffleOrder = useCallback(() => persist({ order: shuffled(order) }), [order, persist]);

  const scoreFor = useCallback(
    (hole: number, playerId: string) => scores[hole]?.[playerId] ?? null,
    [scores],
  );

  const ledger: WolfLedger = useMemo(
    () => buildLedger(decisions, playerIds, { stake: state.stake, loneMultiplier: state.loneMultiplier }, scoreFor),
    [decisions, playerIds, state.stake, state.loneMultiplier, scoreFor],
  );

  const payments: Payment[] = useMemo(() => settleUp(ledger.totals), [ledger.totals]);

  // Shuffling after play has started would leave the recorded holes alone but
  // change who is up next, which is confusing rather than wrong. Surfaced so the
  // UI can say so instead of silently doing it.
  const holesDecided = decisions.length;

  return {
    wolf: state,
    wolfLoaded: loaded,
    wolfOrder: order,
    wolfDecisions: decisions,
    wolfDecisionFor: decisionFor,
    wolfFor,
    wolfDecide: decide,
    wolfUndecide: undecide,
    wolfShuffleOrder: shuffleOrder,
    wolfSetSettings: persist,
    wolfLedger: ledger,
    wolfPayments: payments,
    wolfHolesDecided: holesDecided,
    wolfPlayHoles: holes,
  };
}
