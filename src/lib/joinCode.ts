/**
 * The code that gets somebody into a round.
 *
 * Read out across a car park, texted, or typed off a phone held up on the first
 * tee — so it has to survive being heard, misread and re-typed. That is the
 * whole design brief, and it is why this is not just `substring(uuid, 0, 6)`.
 *
 * **Crockford's base32**, which exists for exactly this: no `I`, `L`, `O` or
 * `U`. The first three are the ones people confuse with `1` and `0`, and `U` is
 * left out so a random five characters can't spell something unfortunate. On
 * input `O` is read as `0` and `I`/`L` as `1`, so a person who writes down what
 * they heard still gets in.
 *
 * Pure — no React, no Supabase. `npm run check:joincode`.
 *
 * The alphabet here and the one in `supabase/join-codes.sql` are the same
 * alphabet, and they have to stay that way: the database generates the codes and
 * this validates them, so a character allowed in one and not the other is a code
 * that exists and can never be typed in.
 */

/** 32 characters, no look-alikes. Deliberately identical to the SQL. */
export const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Five characters is 33.5 million codes, and still one breath to say. */
export const JOIN_CODE_LENGTH = 5;

/**
 * A typed code in the one form the database stores, or null if it can't be one.
 *
 * Null rather than an exception because this runs on every keystroke to decide
 * whether the button is live.
 *
 * Forgiving about everything that isn't information: case, spaces, and the
 * hyphen people add on their own. Strict about length, because a four-character
 * lookup that finds nothing is indistinguishable from a wrong code.
 */
export function normalizeJoinCode(raw: string): string | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    // What the ear and the eye get wrong. Crockford's own mapping.
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** Whether a typed code could be looked up. */
export const isJoinCodeValid = (raw: string): boolean => normalizeJoinCode(raw) !== null;

/**
 * How far through typing a code somebody is, for a progress hint.
 *
 * Counts the characters that carry information, so "ab-1" is 3 of 5 rather
 * than 4 — otherwise the hint disagrees with the button.
 */
export const joinCodeProgress = (raw: string): number =>
  Math.min(raw.toUpperCase().replace(/[^0-9A-Z]/g, '').length, JOIN_CODE_LENGTH);
