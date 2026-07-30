import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Every signed card in the round, by player id.
 *
 * `useSignoff` answers "is this one card locked", which is the right question on
 * CARD and the wrong one on SCORE. One phone can be keeping four cards, and the
 * moment it signs its own, a per-card lock took the whole screen away — leaving
 * three unfinished cards with no way to post to them. It also left the organizer
 * unable to fix a mistake after reopening somebody's card, because reopening
 * theirs doesn't unsign yours.
 *
 * Undefined while loading, so callers can hold the screen rather than flash an
 * unlocked card at somebody.
 */
export function useSignoffs(roundId: string | null | undefined) {
  const [signoffs, setSignoffs] = useState<Record<string, string> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!roundId) {
      setSignoffs({});
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setSignoffs({});
      return;
    }
    const { data, error } = await supabase.from('signoffs').select('player_id, signed_at').eq('round_id', roundId);
    if (error) {
      console.warn('useSignoffs fetch failed:', error.message);
      // An unreadable signoffs table must not lock every card on the course.
      // Rule 8 is enforced by a row existing; a failed read is not that row.
      setSignoffs({});
      return;
    }
    const next: Record<string, string> = {};
    for (const row of data ?? []) if (row.signed_at) next[row.player_id] = row.signed_at;
    setSignoffs(next);
  }, [roundId]);

  useEffect(() => {
    setSignoffs(undefined);
    load();
  }, [load]);

  return { signoffs, refreshSignoffs: load };
}

// A signed card is locked (CLAUDE.md rule 8) — this is the one flag that
// makes that true. `signedAt` is undefined while loading, null if not yet
// signed, a timestamp once it is.
export function useSignoff(roundId: string | null | undefined, playerId: string | null | undefined) {
  const [signedAt, setSignedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // Back to "loading" first: keeping the previous card's lock while the new
    // one loads would briefly show the wrong state on a switch.
    setSignedAt(undefined);
    if (!playerId || !roundId) return;
    if (!isSupabaseConfigured || !supabase) {
      setSignedAt(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('signoffs')
      .select('signed_at')
      .eq('round_id', roundId)
      .eq('player_id', playerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('useSignoff fetch failed:', error.message);
          setSignedAt(null);
          return;
        }
        setSignedAt(data?.signed_at ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, roundId]);

  const sign = useCallback(async () => {
    if (!playerId || !roundId) return;
    const now = new Date().toISOString();
    setSignedAt(now); // local-first: the card locks on this device immediately
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase
      .from('signoffs')
      .upsert({ round_id: roundId, player_id: playerId, signed_at: now }, { onConflict: 'round_id,player_id' });
    if (error) console.warn('signoff upsert failed, staying locked locally:', error.message);
  }, [playerId, roundId]);

  // Deliberately not easy: the design's rule is that reopening a signed card
  // takes the organizer. There's no organizer role yet, so this is gated behind
  // a confirmation that spells out the consequence, and callers only offer it on
  // the player's own card. When roles exist this should move behind one, and
  // grow the "logged with the name of whoever did it" half of the rule.
  const reopen = useCallback(async () => {
    if (!playerId || !roundId) return null;
    setSignedAt(null);
    if (!isSupabaseConfigured || !supabase) return null;
    const { error } = await supabase
      .from('signoffs')
      .delete()
      .eq('round_id', roundId)
      .eq('player_id', playerId);
    if (error) {
      console.warn('reopen failed:', error.message);
      // Put the lock back rather than leaving the card editable on a device
      // whose unlock never reached the server.
      const { data } = await supabase
        .from('signoffs')
        .select('signed_at')
        .eq('round_id', roundId)
        .eq('player_id', playerId)
        .maybeSingle();
      setSignedAt(data?.signed_at ?? null);
      return error.message;
    }
    return null;
  }, [playerId, roundId]);

  return { signedAt, sign, reopen };
}
