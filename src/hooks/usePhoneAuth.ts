import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { toE164 } from '@/lib/phone';

export type AuthStage = 'loading' | 'signedOut' | 'codeSent' | 'signedIn';

/**
 * Phone sign-in, one six-digit code at a time.
 *
 * This is what replaces "pick which player you are off a list" — a stand-in that
 * was always going to end, because a list anyone can pick from is not an
 * identity and cannot be the basis of an RLS policy.
 *
 * The session lives in AsyncStorage (configured on the client in
 * `src/lib/supabase.ts`) and refreshes itself, so signing in is a once-ever
 * thing rather than a once-a-round thing.
 *
 * Nothing here claims a player. Signing in proves whose phone this is; deciding
 * *which player row* that person is stays a separate, deliberate step — a link
 * that silently seated whoever opened it is the same mistake as an invite that
 * auto-joins.
 */
export function usePhoneAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<AuthStage>(isSupabaseConfigured ? 'loading' : 'signedOut');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStage(data.session ? 'signedIn' : 'signedOut');
    });

    // Covers the token refreshing, signing out on another screen, and the
    // session expiring while the app was backgrounded.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStage(next ? 'signedIn' : 'signedOut');
      if (next) setPendingPhone(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Text a code to a number. Returns an error message, or null on success. */
  const sendCode = useCallback(async (raw: string): Promise<string | null> => {
    const phone = toE164(raw);
    if (!phone) return 'That doesn’t look like a phone number.';
    if (!isSupabaseConfigured || !supabase) return 'Sign-in needs Supabase configured.';

    setBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);

    if (error) {
      setAuthError(error.message);
      return error.message;
    }
    setPendingPhone(phone);
    setStage('codeSent');
    return null;
  }, []);

  /** Check the code. On success the session arrives via onAuthStateChange. */
  const verifyCode = useCallback(
    async (code: string): Promise<string | null> => {
      if (!isSupabaseConfigured || !supabase) return 'Sign-in needs Supabase configured.';
      if (!pendingPhone) return 'Ask for a code first.';

      setBusy(true);
      setAuthError(null);
      const { error } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: code.trim(),
        type: 'sms',
      });
      setBusy(false);

      if (error) {
        setAuthError(error.message);
        return error.message;
      }
      return null;
    },
    [pendingPhone],
  );

  /** Back to the number entry, e.g. "wrong number". Sends nothing. */
  const cancelCode = useCallback(() => {
    setPendingPhone(null);
    setAuthError(null);
    setStage('signedOut');
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    await supabase.auth.signOut();
    setPendingPhone(null);
    setAuthError(null);
  }, []);

  return {
    session,
    userId: session?.user.id ?? null,
    userPhone: session?.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : null,
    authStage: stage,
    authBusy: busy,
    authError,
    pendingPhone,
    sendCode,
    verifyCode,
    cancelCode,
    signOut,
  };
}
