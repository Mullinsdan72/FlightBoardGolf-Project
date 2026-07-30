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
 * Where the privacy policy is hosted. `docs/privacy.html` is the source.
 *
 * Null until it's actually published, and the screen adapts rather than
 * rendering a dead link — the same rule as `APP_STORE_URL`. A privacy link that
 * 404s is worse than none, because the one place it will certainly be clicked
 * is a carrier compliance review.
 */
export const PRIVACY_URL: string | null = null;

/**
 * The line beside the sign-in button.
 *
 * Carriers look for four things, and all four are here: what you'll get, how
 * often, that rates apply, and how to stop. Keep it that way — trimming this
 * for tidiness is trimming the thing the registration was granted on.
 */
export const SMS_CONSENT =
  'By tapping the button above you agree to receive a one-time verification code by text ' +
  'from Flight Board. Message frequency varies — normally one text per sign-in. Message and ' +
  'data rates may apply. Reply STOP to opt out, HELP for help. Your number is used to sign ' +
  'you in and match you to rounds you’ve been invited to, and is never shared with anyone ' +
  'for marketing.';
