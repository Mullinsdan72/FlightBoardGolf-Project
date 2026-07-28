import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearRound } from '@/lib/scoreOutbox';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ROUND_ID as FALLBACK_ROUND_ID } from '@/data/seed';

const ACTIVE_KEY = 'flightboard.activeRoundId';

export type RoundSummary = {
  id: string;
  name: string;
  courseName: string;
  playedOn: string | null;
  createdAt: string;
  organizerId: string | null;
};

// Which round this device is looking at, and the list of rounds to choose from.
//
// Everything else keys off the active round id, so a new round each week is a
// new row rather than wiping the last one — which is what makes round history
// possible at all.
export function useActiveRound() {
  const [activeRoundId, setActiveRoundId] = useState<string | null | undefined>(undefined);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [roundsLoaded, setRoundsLoaded] = useState(!isSupabaseConfigured);

  const loadRounds = useCallback(async (): Promise<RoundSummary[]> => {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase
      .from('rounds')
      .select('id, name, course_name, played_on, created_at, organizer_player_id')
      .order('created_at', { ascending: false });
    if (error || !data) {
      console.warn('loadRounds failed:', error?.message);
      return [];
    }
    const list = (data as any[]).map((r) => ({
      id: r.id,
      name: r.name ?? '',
      courseName: r.course_name ?? '',
      playedOn: r.played_on ?? null,
      createdAt: r.created_at,
      organizerId: r.organizer_player_id ?? null,
    }));
    setRounds(list);
    setRoundsLoaded(true);
    return list;
  }, []);

  // Resolve which round to open: whatever this device last used, as long as it
  // still exists. Otherwise the newest one, so an existing database lands
  // somewhere sensible instead of on an empty screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!isSupabaseConfigured) {
        if (!cancelled) setActiveRoundId(stored ?? FALLBACK_ROUND_ID);
        return;
      }
      const list = await loadRounds();
      if (cancelled) return;
      if (stored && list.some((r) => r.id === stored)) {
        setActiveRoundId(stored);
        return;
      }
      setActiveRoundId(list.length ? list[0].id : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRounds]);

  const switchRound = useCallback(async (roundId: string) => {
    await AsyncStorage.setItem(ACTIVE_KEY, roundId);
    setActiveRoundId(roundId);
  }, []);

  // Creating a round makes you its organizer and puts you in the field, because
  // that is what creating a round means — you're running it and you're playing.
  // No claiming a role afterwards.
  const createRound = useCallback(
    async (input: {
      name: string;
      playedOn: string | null;
      creatorPlayerId: string | null;
    }): Promise<{ id: string | null; error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { id: null, error: 'Creating rounds needs Supabase configured.' };
      }
      const { data, error } = await supabase
        .from('rounds')
        .insert({
          name: input.name,
          played_on: input.playedOn,
          organizer_player_id: input.creatorPlayerId,
          course_name: '',
          course_meta: '',
          holes_in_play: 'all18',
        })
        .select('id')
        .single();
      if (error || !data) return { id: null, error: error?.message ?? 'Could not create the round.' };

      if (input.creatorPlayerId) {
        const { error: joinErr } = await supabase
          .from('round_players')
          .insert({ round_id: data.id, player_id: input.creatorPlayerId });
        // Not fatal — the round exists and they can be added on the FIELD tab —
        // but worth reporting rather than leaving them wondering why they're not
        // in their own round.
        if (joinErr) console.warn('createRound could not add the creator to the field:', joinErr.message);
      }

      await loadRounds();
      await switchRound(data.id);
      return { id: data.id, error: null };
    },
    [loadRounds, switchRound],
  );

  const deleteRound = useCallback(
    async (roundId: string): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase) return null;
      // Scores, players, wolf rows and the card all cascade from rounds.
      const { error } = await supabase.from('rounds').delete().eq('id', roundId);
      if (error) {
        console.warn('deleteRound failed:', error.message);
        return error.message;
      }
      await clearRound(roundId);
      const list = await loadRounds();
      if (activeRoundId === roundId) {
        const next = list.length ? list[0].id : null;
        if (next) await switchRound(next);
        else {
          await AsyncStorage.removeItem(ACTIVE_KEY);
          setActiveRoundId(null);
        }
      }
      return null;
    },
    [activeRoundId, loadRounds, switchRound],
  );

  const activeRound = rounds.find((r) => r.id === activeRoundId) ?? null;

  return {
    activeRoundId,
    activeRound,
    rounds,
    roundsLoaded,
    loadRounds,
    switchRound,
    createRound,
    deleteRound,
  };
}
