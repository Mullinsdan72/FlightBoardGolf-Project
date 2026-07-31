// Invite links and the message that carries them.
//
// Pure — no React, no native modules — so the link format and the wording can be
// checked without a phone. `npm run check:invite`.

/**
 * Where to send someone who doesn't have the app.
 *
 * Null until Flight Board is actually published. A made-up App Store URL in a
 * text message is worse than none: the recipient taps it, gets a dead page, and
 * decides the whole thing is broken. Set this the day there's a listing.
 */
export const APP_STORE_URL: string | null = null;

/** The app's own scheme, matching `expo.scheme` in app.json. */
export const APP_SCHEME = 'flightboard';

/**
 * A link that opens the round in the app.
 *
 * Honest limitation: a custom scheme only resolves once Flight Board is a real
 * build on the phone. Inside Expo Go the app lives at an `exp://` URL tied to
 * whichever machine is running the dev server, so a `flightboard://` link in a
 * text message won't open anything yet. The round id in the link is still the
 * useful part — it can be pasted in — and the link starts working the day there
 * is a build, with no change to what was sent.
 */
export function inviteLink(roundId: string): string {
  return `${APP_SCHEME}://join?round=${encodeURIComponent(roundId)}`;
}

/** Pull a round id back out of a link. Null if it isn't one of ours. */
export function roundIdFromLink(url: string): string | null {
  const match = /[?&]round=([^&#]+)/.exec(url);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]).trim();
    return id || null;
  } catch {
    return null;
  }
}

export type InviteContext = {
  roundName: string;
  courseName?: string | null;
  playedOn?: string | null;
  organizerName?: string | null;
  roundId: string;
};

/**
 * The text that goes out.
 *
 * Written by the app's owner, and kept as written. It's his group being texted,
 * and the point of the message isn't the app — it's that nobody has to carry a
 * pencil.
 *
 * **The first line must name the registered A2P brand exactly.** Carriers check
 * the sample messages against the brand on the campaign, and a message that
 * opens with a different name than the one registered reads as somebody else's
 * traffic. This says "Flight Leaderboard Golf" — the approved brand — and not
 * "Flight Board", which is what the app is called. Changing one without the
 * other is a rejected campaign, which is how this wording got here.
 *
 * Deliberately says nothing about which round, which course, who invited them
 * or when: the text arrives from the organizer's own number, so the recipient
 * already knows. It also means the wording doesn't go stale on a round set up
 * the night before — "today's round" would have.
 *
 * `InviteContext` still carries the round's name, course and date. They're
 * unused by this wording and kept for the next one rather than deleted.
 */
export function inviteMessage(ctx: InviteContext): string {
  const lines = [
    "You've been added to Flight Leaderboard Golf.",
    '',
    "A live scoring leaderboard without the math. Everyone's round as it happens, the games being played inside it, and you keep your own score.",
    '',
    'Click here to join the round !',
    inviteLink(ctx.roundId),
  ];

  // Only once there's a listing to point at. A dead store link in a text is
  // worse than none — the recipient taps it, gets an error, and decides the
  // whole thing is broken.
  if (APP_STORE_URL) lines.push('', `Need the app first? ${APP_STORE_URL}`);

  return lines.join('\n');
}

/** Digits only, so two spellings of the same number aren't two people. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  // Loose on purpose — numbers vary by country and rejecting a real one is
  // worse than accepting an odd one. This only catches obvious nonsense.
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

/** Two numbers are the same person if their last nine digits match. */
export function samePhone(a: string, b: string): boolean {
  const tail = (s: string) => s.replace(/\D/g, '').slice(-9);
  const ta = tail(a);
  const tb = tail(b);
  return ta.length > 0 && ta === tb;
}

/** An ISO date `n` days from today, in the phone's own timezone. */
export function isoDaysFromNow(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Sat 1 Aug" — a date a person can read, from an ISO one. */
export function prettyDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * A round name nobody has to think of.
 *
 * Naming a round is the first thing the app used to ask for, and a first-time
 * user has nothing to type — it's a blank box guarding the door. The day is a
 * fine name, and it can be changed later.
 */
export const defaultRoundName = (iso: string): string => `${prettyDay(iso)} round`;

/** "Daniel Mullins" -> "Daniel Mullins"; trims and collapses whitespace. */
export const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ');

// The five-step run-through (`/setup`, `SetupBar`, `setupSteps`, `SETUP_ORDER`,
// `STEP_ROUTE`, `stepAfter`/`stepBefore`) was removed when the ROUND tab
// replaced it with one screen of tiles. It was built to a brief asking for a
// logical step-by-step flow and then turned out to *be* the clunkiness — one
// screen you can scan beats five you have to walk. Nothing links to it, and
// keeping dead wayfinding around invites somebody to wire it back up.

/**
 * A round somebody has put you in that you have not joined yet.
 *
 * An organizer types your name and mobile number in long before you ever open
 * the app — that is the *normal* way a field gets built here. So the moment
 * your phone knows who it is, there may already be rounds waiting for it, and
 * the app should say so rather than open on an empty ROUND tab and let you
 * organize a duplicate of the round you were already invited to.
 */
export type PendingInvite = {
  /** The player row the organizer created for you. Claiming it is joining. */
  playerId: string;
  /** The name they typed. Worth showing — it's how you'll appear on the board. */
  playerName: string;
  roundId: string;
  roundName: string;
  courseName: string;
  /** ISO date, or null if they haven't set one. */
  playedOn: string | null;
};

export type InviteFilter = {
  /** Rounds this device is already playing. Not invitations — memberships. */
  joinedRoundIds: string[];
  /** Rounds this device has said "not now" to. Asked once, not every launch. */
  declinedRoundIds: string[];
};

/**
 * The invitations worth interrupting somebody for, soonest first.
 *
 * Two things are deliberately *not* invitations:
 *
 *   - **A round you are already in.** You joined; there is nothing to accept.
 *   - **A round you declined.** Answering "not now" has to stick, or the
 *     question becomes a thing you dismiss on every cold start until you stop
 *     reading it — and then the one that mattered gets dismissed too.
 *
 * Sorted by the day it is played, undated last, so the round that is happening
 * first is the one being asked about.
 */
export function pendingInvites(all: PendingInvite[], filter: InviteFilter): PendingInvite[] {
  const joined = new Set(filter.joinedRoundIds);
  const declined = new Set(filter.declinedRoundIds);
  const seen = new Set<string>();
  return all
    .filter((i) => {
      if (joined.has(i.roundId) || declined.has(i.roundId)) return false;
      // One card per round, however many player rows matched your number. Two
      // organizers typing you into the same round is their mistake to fix, not
      // a question to ask you twice.
      if (seen.has(i.roundId)) return false;
      seen.add(i.roundId);
      return true;
    })
    .sort((a, b) => {
      if (a.playedOn === b.playedOn) return a.roundName.localeCompare(b.roundName);
      if (!a.playedOn) return 1;
      if (!b.playedOn) return -1;
      return a.playedOn.localeCompare(b.playedOn);
    });
}
