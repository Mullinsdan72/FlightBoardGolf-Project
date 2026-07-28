import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { ROUND_ID } from '@/data/seed';

// A signed card is locked (CLAUDE.md rule 8) — this is the one flag that
// makes that true. `signedAt` is undefined while loading, null if not yet
// signed, a timestamp once it is.
export function useSignoff(playerId: string | null | undefined) {
  const [signedAt, setSignedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!playerId) return;
    if (!isSupabaseConfigured || !supabase) {
      setSignedAt(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('signoffs')
      .select('signed_at')
      .eq('round_id', ROUND_ID)
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
  }, [playerId]);

  const sign = useCallback(async () => {
    if (!playerId) return;
    const now = new Date().toISOString();
    setSignedAt(now); // local-first: the card locks on this device immediately
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase
      .from('signoffs')
      .upsert({ round_id: ROUND_ID, player_id: playerId, signed_at: now }, { onConflict: 'round_id,player_id' });
    if (error) console.warn('signoff upsert failed, staying locked locally:', error.message);
  }, [playerId]);

  return { signedAt, sign };
}
