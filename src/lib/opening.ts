/**
 * Which tab the app lands on when you open it.
 *
 * Golf apps get opened in two states and they want opposite screens. Standing on
 * the seventh with a round going, anything other than SCORE is in the way.
 * Sitting in the car park with nothing on, SCORE is a card for a round you have
 * already finished — the screen you actually want is ROUND, with START ROUND on
 * it.
 *
 * Pure so the rule can be checked without a phone: `npm run check:opening`.
 */

export type OpeningState = {
  /** Is a round selected at all. */
  hasRound: boolean;
  /** How many holes have a score on them, from anyone in the field. */
  holesPosted: number;
  /** How many players are in the round. */
  fieldSize: number;
  /** How many of them have signed. */
  cardsSigned: number;
};

/**
 * True when the app should open on ROUND rather than SCORE.
 *
 * Three ways a round fails to be "in progress", and they are not the same thing:
 *
 *   - **There isn't one.** First run, or you deleted your last one.
 *   - **Nothing has been posted.** A round set up last night is a plan, not a
 *     round. ROUND is where you finish setting it up and tee off from, so this
 *     is the screen even when the round already exists.
 *   - **Every card is signed.** Finished. Opening on a locked scorecard reads as
 *     the app being stuck, which is exactly the complaint that started this.
 *
 * Anything else means somebody is mid-round, and mid-round SCORE wins — even if
 * *your* card is signed, because you may still be marking for three others.
 */
export function opensOnRoundTab(state: OpeningState): boolean {
  if (!state.hasRound) return true;
  if (state.fieldSize === 0) return true;
  if (state.holesPosted === 0) return true;
  return state.cardsSigned >= state.fieldSize;
}

/** The route to open on. One place, so no screen has to guess. */
export const openingRoute = (state: OpeningState): '/(tabs)/round' | '/(tabs)' =>
  opensOnRoundTab(state) ? '/(tabs)/round' : '/(tabs)';
