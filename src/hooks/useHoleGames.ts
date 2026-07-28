import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  holeGameLedgers,
  type HoleGame,
  type HoleGameResult,
  type HoleGameType,
  type HoleGameWinner,
} from '@/lib/sideGames';

// Closest to the pin and longest drive. The terms and the winners are stored;
// every figure of money is derived in src/lib/sideGames.ts.
export function useHoleGames(roundId: string | null | undefined, entrantIds: string[]) {
  const [games, setGames] = useState<HoleGame[]>([]);
  const [winners, setWinners] = useState<HoleGameWinner[]>([]);
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const { data: gameRows, error } = await supabase
      .from('hole_games')
      .select('id, type, holes, wager_cents')
      .eq('round_id', roundId)
      .order('created_at');
    if (error) {
      console.warn('loading hole games failed:', error.message);
      setLoaded(true);
      return;
    }
    const list: HoleGame[] = ((gameRows ?? []) as any[]).map((g) => ({
      id: g.id,
      type: g.type === 'ld' ? 'ld' : 'ctp',
      holes: Array.isArray(g.holes) ? g.holes.slice().sort((a: number, b: number) => a - b) : [],
      wagerCents: Number(g.wager_cents) || 0,
    }));
    setGames(list);

    if (!list.length) {
      setWinners([]);
      setLoaded(true);
      return;
    }
    const { data: winRows } = await supabase
      .from('hole_game_winners')
      .select('game_id, hole, player_id')
      .in('game_id', list.map((g) => g.id));
    setWinners(
      ((winRows ?? []) as any[]).map((w) => ({ gameId: w.game_id, hole: w.hole, playerId: w.player_id })),
    );
    setLoaded(true);
  }, [roundId]);

  // Games belong to one round; reset before refetching.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setGames([]);
    setWinners([]);
    setLoaded(false);
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  // Somebody else records the closest tee shot on their own phone; the group has
  // to see it without reloading.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const client = supabase;
    const channel = client
      .channel(`holegames:${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_games', filter: `round_id=eq.${roundId}` }, () => load())
      // No round_id on the winners table — it hangs off the game — so this
      // listens to all of them and reloads. Cheap: a handful of rows a round.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_game_winners' }, () => load())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [roundId, load]);

  const addGame = useCallback(
    async (type: HoleGameType, holes: number[], wagerCents: number): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase || !roundId) return 'Adding a game needs Supabase configured.';
      const { error } = await supabase
        .from('hole_games')
        .insert({ round_id: roundId, type, holes, wager_cents: wagerCents });
      if (error) return error.message;
      await load();
      return null;
    },
    [roundId, load],
  );

  const updateGame = useCallback(
    async (gameId: string, patch: { holes?: number[]; wagerCents?: number }): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase) return null;
      const row: Record<string, unknown> = {};
      if (patch.holes !== undefined) row.holes = patch.holes;
      if (patch.wagerCents !== undefined) row.wager_cents = patch.wagerCents;
      const { error } = await supabase.from('hole_games').update(row).eq('id', gameId);
      if (error) return error.message;
      await load();
      return null;
    },
    [load],
  );

  const removeGame = useCallback(
    async (gameId: string): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase.from('hole_games').delete().eq('id', gameId);
      if (error) return error.message;
      await load();
      return null;
    },
    [load],
  );

  /** Record a winner, or clear the hole by passing null. */
  const setWinner = useCallback(
    async (gameId: string, hole: number, playerId: string | null): Promise<string | null> => {
      setWinners((prev) => {
        const rest = prev.filter((w) => !(w.gameId === gameId && w.hole === hole));
        return playerId ? [...rest, { gameId, hole, playerId }] : rest;
      });
      if (!isSupabaseConfigured || !supabase) return null;
      if (!playerId) {
        const { error } = await supabase.from('hole_game_winners').delete().eq('game_id', gameId).eq('hole', hole);
        return error?.message ?? null;
      }
      const { error } = await supabase
        .from('hole_game_winners')
        .upsert({ game_id: gameId, hole, player_id: playerId }, { onConflict: 'game_id,hole' });
      return error?.message ?? null;
    },
    [],
  );

  const ledgers: HoleGameResult[] = useMemo(
    () => holeGameLedgers(games, winners, entrantIds),
    [games, winners, entrantIds],
  );

  return {
    holeGames: games,
    holeGameWinners: winners,
    holeGamesLoaded: loaded,
    holeGameLedgers: ledgers,
    addHoleGame: addGame,
    updateHoleGame: updateGame,
    removeHoleGame: removeGame,
    setHoleGameWinner: setWinner,
  };
}
