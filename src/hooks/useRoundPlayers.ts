import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { PLAYERS as SEED_PLAYERS, ROUND_ID } from '@/data/seed';
import type { SeedPlayer } from '@/data/seed';

type Row = { player_id: string; players: { id: string; name: string; handicap: number } | null };

// The round's actual roster — who's in this group. Falls back to the seed
// four when Supabase isn't configured, same pattern as useLiveScores.
export function useRoundPlayers() {
  const [players, setPlayers] = useState<SeedPlayer[]>(SEED_PLAYERS);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const { data, error } = await supabase
      .from('round_players')
      .select('player_id, players(id, name, handicap)')
      .eq('round_id', ROUND_ID);
    if (error || !data) {
      console.warn('useRoundPlayers fetch failed:', error?.message);
      return;
    }
    const rows = data as unknown as Row[];
    const list = rows
      .map((r) => r.players)
      .filter((p): p is NonNullable<Row['players']> => p != null)
      .map((p) => ({ id: p.id, name: p.name, handicap: p.handicap }));
    if (list.length) setPlayers(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPlayer = useCallback(
    async (name: string, handicap: number) => {
      if (!isSupabaseConfigured || !supabase) {
        // Local-only fallback: keep it in memory for this session.
        setPlayers((prev) => [...prev, { id: `local-${Date.now()}`, name, handicap }]);
        return;
      }
      const { data: inserted, error: playerErr } = await supabase
        .from('players')
        .insert({ name, handicap })
        .select('id')
        .single();
      if (playerErr || !inserted) {
        console.warn('addPlayer failed:', playerErr?.message);
        return;
      }
      const { error: linkErr } = await supabase
        .from('round_players')
        .insert({ round_id: ROUND_ID, player_id: inserted.id });
      if (linkErr) console.warn('addPlayer (round link) failed:', linkErr.message);
      await refresh();
    },
    [refresh],
  );

  const removePlayer = useCallback(
    async (playerId: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      if (!isSupabaseConfigured || !supabase) return;
      const { error } = await supabase
        .from('round_players')
        .delete()
        .eq('round_id', ROUND_ID)
        .eq('player_id', playerId);
      if (error) {
        console.warn('removePlayer failed, restoring:', error.message);
        await refresh();
      }
    },
    [refresh],
  );

  return { players, addPlayer, removePlayer };
}
