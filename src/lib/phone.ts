/**
 * Phone numbers, normalised.
 *
 * Sign-in and invites both key off a phone number, and the same person types it
 * five different ways: `555-123-4567`, `(555) 123 4567`, `+1 555 123 4567`,
 * `15551234567`. Supabase wants one form — E.164, `+15551234567` — and a
 * mismatch doesn't error, it silently creates a *second* account. So this is the
 * only place a typed number becomes a stored one.
 *
 * Deliberately US-default: a bare ten-digit number gets +1. An explicit `+`
 * always wins, so an international number typed in full still works.
 */

/** Digits only, no punctuation, no spaces. */
const digitsOf = (raw: string): string => raw.replace(/\D+/g, '');

/**
 * A typed number in E.164, or null when it can't be one.
 *
 * Null is a real answer here rather than a thrown error: the sign-in screen
 * calls this on every keystroke to decide whether the button is live.
 */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // An explicit country code is the user telling us; never second-guess it.
  if (trimmed.startsWith('+')) {
    const digits = digitsOf(trimmed);
    // E.164 allows at most 15 digits, and nothing real is under 8.
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = digitsOf(trimmed);
  if (digits.length === 10) return `+1${digits}`;
  // 1-555-123-4567, which is how a lot of people write it.
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Whether a typed number could be dialled. */
export const isPhoneValid = (raw: string): boolean => toE164(raw) !== null;

/**
 * A number as a person reads it back: (555) 123-4567.
 *
 * Only North American numbers get the brackets treatment — anything else is
 * shown in E.164, because guessing another country's grouping produces
 * confident nonsense.
 */
export function prettyPhone(raw: string): string {
  const e164 = toE164(raw);
  if (!e164) return raw.trim();
  if (e164.startsWith('+1') && e164.length === 12) {
    const d = e164.slice(2);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164;
}

/**
 * Whether two typed numbers are the same number.
 *
 * Two people entering the same friend as `555-123-4567` and `+1 (555) 123 4567`
 * must not produce two players. Invalid numbers are never equal to anything,
 * including themselves — a pair of unparseable strings tells us nothing.
 */
export function samePhone(a: string, b: string): boolean {
  const x = toE164(a);
  const y = toE164(b);
  return x != null && y != null && x === y;
}

/** The six-digit code Supabase texts. Anything else can't be one. */
export const isOtpValid = (raw: string): boolean => /^\d{6}$/.test(raw.trim());
