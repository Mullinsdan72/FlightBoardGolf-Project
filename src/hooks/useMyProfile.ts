import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { SeedPlayer } from '@/data/seed';

/**
 * The player this device is, fetched by id and nothing else.
 *
 * Identity is **global and remembered** (`flightboard.myPlayerId`), but until
 * now every screen read it out of the open round's roster. Open a round you
 * weren't in — an old one, or a friend's — and the app forgot who you were and
 * asked again. That is the same class of mistake as reading the round creator
 * from `players.find(...)`, and it deserves its own fix rather than another
 * special case.
 *
 * Round-scoped screens should still use the roster; this is for the ones that
 * ask "who is holding this phone", which is a question a round has no part in.
 */
export function useMyProfile(myId: string | null | undefined) {
  const [profile, setProfile] = useState<SeedPlayer | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !myId) {
      setProfile(null);
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('players')
      .select('id, name, handicap, user_id, phone')
      .eq('id', myId)
      .maybeSingle();
    if (error) {
      console.warn('useMyProfile failed:', error.message);
      // Loaded regardless — a flag that gates a render must be set on the
      // failure path too, or the loading state becomes a permanent one.
      setLoaded(true);
      return;
    }
    setProfile(
      data
        ? {
            id: (data as any).id,
            name: (data as any).name,
            handicap: (data as any).handicap,
            userId: (data as any).user_id ?? null,
            phone: (data as any).phone ?? null,
          }
        : null,
    );
    setLoaded(true);
  }, [myId]);

  useEffect(() => {
    setLoaded(false);
    load();
  }, [load]);

  return { myProfile: profile, myProfileLoaded: loaded, reloadMyProfile: load };
}
