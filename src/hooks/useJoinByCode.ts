import { useCallback, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { normalizeJoinCode } from '@/lib/joinCode';

export type CodeRound = {
  roundId: string;
  roundName: string;
  courseName: string;
  playedOn: string | null;
  fieldSize: number;
  organizerName: string | null;
};

export type CodeSeat = {
  playerId: string;
  name: string;
  handicap: number;
  /** Somebody holds it. Shown and refused — never hidden. */
  taken: boolean;
  /** Held by *this* account, which means you are already in. */
  mine: boolean;
};

/**
 * Finding and joining a round by its code.
 *
 * The counterpart to `usePendingInvites`, and deliberately the opposite shape.
 * An invitation is *pushed*: somebody types your number and your phone waits for
 * a screen to appear. A code is *pulled* — you do it, you can retry it, and it
 * works whether or not the organizer typed your number correctly, or at all.
 * That is why this exists: the push path has no second path when it misses, and
 * a morning proved that.
 *
 * Every call goes through a `security definer` function, because under RLS a
 * guest cannot read a round they are not in — which is every round they might
 * want to join. The code is the credential.
 */
export function useJoinByCode() {
  const [round, setRound] = useState<CodeRound | null>(null);
  const [seats, setSeats] = useState<CodeSeat[]>([]);
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);

  const clear = useCallback(() => {
    setRound(null);
    setSeats([]);
  }, []);

  /**
   * Look a code up. Returns an error to show, or null when it found something.
   *
   * "Not found" is a plain sentence, not an error state: the overwhelmingly
   * likely cause is a typo in five characters, and being told off for that is
   * no help at all.
   */
  const lookUp = useCallback(async (typed: string): Promise<string | null> => {
    const code = normalizeJoinCode(typed);
    if (!code) return 'A round code is five characters.';
    if (!isSupabaseConfigured || !supabase) return 'Joining by code needs a connection.';

    setLooking(true);
    try {
      const { data, error } = await supabase.rpc('round_by_code', { p_code: code });
      if (error) {
        console.warn('round_by_code failed:', error.message);
        return error.message;
      }
      const row = (data as any[])?.[0];
      if (!row) {
        clear();
        return `No round has the code ${code}. Check it with whoever is running the round — it's easy to hear one character wrong.`;
      }
      setRound({
        roundId: row.round_id,
        roundName: row.round_name ?? '',
        courseName: row.course_name ?? '',
        playedOn: row.played_on ?? null,
        fieldSize: row.field_size ?? 0,
        organizerName: row.organizer_name ?? null,
      });

      const { data: seatRows, error: seatErr } = await supabase.rpc('seats_by_code', { p_code: code });
      if (seatErr) {
        // The round was found, so this is not a dead end — you can still add
        // yourself. Worth a warning in the log and nothing on screen.
        console.warn('seats_by_code failed:', seatErr.message);
        setSeats([]);
        return null;
      }
      setSeats(
        (seatRows as any[]).map((s) => ({
          playerId: s.player_id,
          name: s.player_name,
          handicap: s.handicap ?? 0,
          taken: !!s.taken,
          mine: !!s.mine,
        })),
      );
      return null;
    } finally {
      setLooking(false);
    }
  }, [clear]);

  /**
   * Take a seat — either one already made for you, or a new one.
   *
   * Returns the player id you are now, or an error to show. Never both.
   */
  const join = useCallback(
    async (
      typed: string,
      who: { playerId?: string; name?: string; handicap?: number },
    ): Promise<{ playerId: string | null; error: string | null }> => {
      const code = normalizeJoinCode(typed);
      if (!code) return { playerId: null, error: 'A round code is five characters.' };
      if (!isSupabaseConfigured || !supabase) {
        return { playerId: null, error: 'Joining by code needs a connection.' };
      }
      setJoining(true);
      try {
        const { data, error } = await supabase.rpc('join_round_by_code', {
          p_code: code,
          p_player_id: who.playerId ?? null,
          p_name: who.name ?? null,
          p_handicap: who.handicap ?? 0,
        });
        if (error) {
          console.warn('join_round_by_code failed:', error.message);
          return { playerId: null, error: error.message };
        }
        return { playerId: (data as string) ?? null, error: null };
      } finally {
        setJoining(false);
      }
    },
    [],
  );

  return { codeRound: round, codeSeats: seats, lookingUpCode: looking, joiningByCode: joining, lookUp, join, clearCode: clear };
}
