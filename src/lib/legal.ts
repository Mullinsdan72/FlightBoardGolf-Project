/**
 * The public documents the app has to point at, and the consent it has to show.
 *
 * This isn't decoration. A2P 10DLC registration — the US carrier process that
 * decides whether a verification code is delivered at all — requires the opt-in
 * screen itself to state what you're agreeing to, and reviewers ask for a
 * screenshot of it. A campaign whose described consent flow doesn't match the
 * actual screen gets rejected.
 */

/**
 * Where the policies are hosted. `docs/` holds the source of both pages, so the
 * repo and the live site can't drift apart without it being visible in a diff.
 *
 * These stay null until actually published, and the screen hides the link
 * rather than rendering a dead one — the same rule as `APP_STORE_URL`. A
 * privacy link that 404s is worse than none, because the one place it is
 * certain to be clicked is a carrier compliance review.
 */
const SITE = 'https://flightboardgolf.netlify.app';

export const PRIVACY_URL: string | null = `${SITE}/privacy.html`;
export const TERMS_URL: string | null = `${SITE}/terms.html`;

/**
 * The line beside the sign-in button.
 *
 * Carriers look for four things, and all four are here: what you'll get, how
 * often, that rates apply, and how to stop. Keep it that way — trimming this
 * for tidiness is trimming the thing the registration was granted on.
 */
// Word for word what the A2P campaign's "opt-in message" field says, and inside
// its 320-character cap. Carriers compare the two, and a screenshot of this
// screen is what they compare it against — so editing this is editing a filed
// regulatory document, not app copy.
//
// Two deliberate things. "Flight Leaderboard Golf" is the registered brand, not
// the app's name. And it no longer mentions being invited to rounds: those texts
// are sent from the organizer's own phone, never through Twilio, and every
// mention of them in the filing read as person-to-person traffic — which is what
// got the campaign rejected.
//
// Plain hyphen and plain apostrophes on purpose: a curly dash here cuts an SMS
// segment from 160 characters to 70, and this text is quoted verbatim in the
// registration.
export const SMS_CONSENT =
  'By tapping TEXT ME A CODE you agree to receive a one-time verification code by text from ' +
  'Flight Leaderboard Golf. Msg frequency varies - normally one text per sign-in. Msg and data ' +
  'rates may apply. Reply STOP to opt out, HELP for help. Your number is never shared with ' +
  'anyone for marketing.';
