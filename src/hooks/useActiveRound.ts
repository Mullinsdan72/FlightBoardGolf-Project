import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearRound } from '@/lib/scoreOutbox';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ROUND_ID as FALLBACK_ROUND_ID } from '@/data/seed';

const ACTIVE_KEY = 'flightboard.activeRoundId';

/** Gross, net, or off the low man — a property of the round, not of a game. */
export type ScoringMode = 'gross' | 'net' | 'lowman';

const asScoringMode = (v: unknown): ScoringMode =>
  v === 'gross' || v === 'lowman' ? v : 'net';

export type RoundSummary = {
  id: string;
  name: string;
  courseName: string;
  playedOn: string | null;
  createdAt: string;
  organizerId: string | null;
  scoringMode: ScoringMode;
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
  // Why there are no rounds, when the reason is a failure rather than a fresh
  // install. Identical-looking states, opposite responses.
  const [roundsError, setRoundsError] = useState<string | null>(null);

  const loadRounds = useCallback(async (): Promise<RoundSummary[]> => {
    if (!isSupabaseConfigured || !supabase) return [];
    const { data, error } = await supabase
      .from('rounds')
      .select('id, name, course_name, played_on, created_at, organizer_player_id, scoring_mode')
      .order('created_at', { ascending: false });
    if (error || !data) {
      console.warn('loadRounds failed:', error?.message);
      // Loaded, even though it failed. Leaving this false left `roundsLoaded`
      // permanently false, and the tabs layout returns null while it is — so a
      // failed fetch showed a blank white screen after the splash, with no
      // error and no way forward. Exactly the failure the players roster had.
      setRoundsError(error?.message ?? 'Could not load your rounds.');
      setRoundsLoaded(true);
      return [];
    }
    setRoundsError(null);
    const list = (data as any[]).map((r) => ({
      id: r.id,
      name: r.name ?? '',
      courseName: r.course_name ?? '',
      playedOn: r.played_on ?? null,
      createdAt: r.created_at,
      organizerId: r.organizer_player_id ?? null,
      scoringMode: asScoringMode(r.scoring_mode),
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

  /**
   * Create a round, and put the person creating it in charge of it.
   *
   * `creatorName` is the first-run path: a brand new phone has no player yet, so
   * the round would be created with no organizer — and with no organizer the
   * FIELD tab hides, the setup screen goes read-only, and the person who just
   * made the round can't add themselves to it. That was a dead end on a fresh
   * install. Passing a name mints the player, puts them in the field and makes
   * them the organizer, all against the round just created.
   *
   * Returns the new player's id when it made one, so the caller can become them.
   */
  const createRound = useCallback(
    async (input: {
      name: string;
      playedOn: string | null;
      creatorPlayerId?: string | null;
      creatorName?: string | null;
      creatorHandicap?: number;
    }): Promise<{ id: string | null; playerId: string | null; error: string | null }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { id: null, playerId: null, error: 'Creating rounds needs Supabase configured.' };
      }

      let organizerId = input.creatorPlayerId ?? null;
      let mintedPlayerId: string | null = null;

      // Make the player first, so the round is never written without an
      // organizer when we know who the organizer is.
      if (!organizerId && input.creatorName) {
        const { data: person, error: personErr } = await supabase
          .from('players')
          .insert({ name: input.creatorName, handicap: input.creatorHandicap ?? 0 })
          .select('id')
          .single();
        if (personErr || !person) {
          return { id: null, playerId: null, error: personErr?.message ?? 'Could not create your player.' };
        }
        organizerId = person.id as string;
        mintedPlayerId = organizerId;
      }

      const { data, error } = await supabase
        .from('rounds')
        .insert({
          name: input.name,
          played_on: input.playedOn,
          organizer_player_id: organizerId,
          course_name: '',
          course_meta: '',
          holes_in_play: 'all18',
        })
        .select('id')
        .single();
      if (error || !data) {
        return { id: null, playerId: mintedPlayerId, error: error?.message ?? 'Could not create the round.' };
      }

      if (organizerId) {
        const { error: joinErr } = await supabase
          .from('round_players')
          .insert({ round_id: data.id, player_id: organizerId });
        // Not fatal — the round exists and they can be added on the FIELD tab —
        // but worth reporting rather than leaving them wondering why they're not
        // in their own round.
        if (joinErr) console.warn('createRound could not add the creator to the field:', joinErr.message);
      }

      await loadRounds();
      await switchRound(data.id);
      return { id: data.id, playerId: mintedPlayerId, error: null };
    },
    [loadRounds, switchRound],
  );

  /**
   * Change how the whole round is scored.
   *
   * Optimistic, because this is a tile you tap and the number beside it has to
   * change under your thumb — a leaderboard that re-ranks half a second later
   * reads as a bug.
   */
  const setScoringMode = useCallback(
    async (mode: ScoringMode): Promise<string | null> => {
      setRounds((prev) => prev.map((r) => (r.id === activeRoundId ? { ...r, scoringMode: mode } : r)));
      if (!isSupabaseConfigured || !supabase || !activeRoundId) return null;
      const { error } = await supabase.from('rounds').update({ scoring_mode: mode }).eq('id', activeRoundId);
      if (error) {
        console.warn('setScoringMode failed:', error.message);
        await loadRounds();
        return error.message;
      }
      return null;
    },
    [activeRoundId, loadRounds],
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
    roundsError,
    loadRounds,
    switchRound,
    createRound,
    deleteRound,
    setScoringMode,
    scoringMode: activeRound?.scoringMode ?? 'net',
  };
}
