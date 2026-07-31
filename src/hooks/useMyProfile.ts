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
 *
 * Also returns every player row this account owns, from `my_players()`. That is
 * the answer to "who could this phone be" once RLS is live, and the roster is
 * not: with no rounds the roster is empty, so ME had nothing to offer and a
 * signed-in person could not get back onto their own claimed row — which then
 * refuses every write, because a round may only be created naming a player you
 * own. A locked door with the key on the other side of it.
 */
export function useMyProfile(myId: string | null | undefined, userId?: string | null) {
  const [profile, setProfile] = useState<SeedPlayer | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [owned, setOwned] = useState<SeedPlayer[]>([]);

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

  /**
   * Every player row this account owns, whatever round it belongs to.
   *
   * `my_players()` is `security definer` because it matches on
   * `auth.users.phone`, which the app cannot read. It also returns unclaimed
   * rows carrying your number — the seat an organizer made for you — so this
   * filters to the ones actually linked to your account. Being *offered* a seat
   * is not the same as owning it.
   */
  const loadOwned = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !userId) {
      setOwned([]);
      return;
    }
    const { data, error } = await supabase.rpc('my_players');
    if (error || !data) {
      if (error) console.warn('my_players failed:', error.message);
      setOwned([]);
      return;
    }
    setOwned(
      (data as any[])
        .filter((r) => r.user_id === userId)
        .map((r) => ({
          id: r.id,
          name: r.name,
          handicap: r.handicap,
          userId: r.user_id ?? null,
          phone: r.phone ?? null,
        })),
    );
  }, [userId]);

  useEffect(() => {
    setLoaded(false);
    load();
  }, [load]);

  useEffect(() => {
    loadOwned();
  }, [loadOwned]);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadOwned()]);
  }, [load, loadOwned]);

  return { myProfile: profile, myProfileLoaded: loaded, myOwnedPlayers: owned, reloadMyProfile: reload };
}
