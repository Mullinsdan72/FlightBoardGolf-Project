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
 * Where a round is in its life. One definition, used by every screen that shows
 * a round's state, so ACTIVITY and the opening tab can never disagree.
 *
 *   - **not started** — no field, or nothing posted. A round set up last night
 *     is a plan, not a round.
 *   - **in progress** — somebody has posted and somebody has not signed.
 *   - **closed** — every card in the field is signed. The round is over and its
 *     scores are locked; reopening one takes the organizer.
 *
 * Note what closed is *not*: your own signature. One phone can be keeping four
 * cards, and a round where you signed first is still very much being played.
 */
export type RoundStatus = 'not-started' | 'in-progress' | 'closed';

export function roundStatus(state: Omit<OpeningState, 'hasRound'>): RoundStatus {
  if (state.fieldSize === 0) return 'not-started';
  if (state.holesPosted === 0) return 'not-started';
  return state.cardsSigned >= state.fieldSize ? 'closed' : 'in-progress';
}

/**
 * True when the app should open on ROUND rather than SCORE.
 *
 * Anything that isn't actively being played: no round at all, one nobody has
 * teed off in, or one that is finished. Opening on a locked scorecard reads as
 * the app being stuck, which is exactly the complaint that started this.
 *
 * Mid-round SCORE wins — even if *your* card is signed, because you may still
 * be marking for three others.
 */
export function opensOnRoundTab(state: OpeningState): boolean {
  if (!state.hasRound) return true;
  return roundStatus(state) !== 'in-progress';
}

/** The route to open on. One place, so no screen has to guess. */
export const openingRoute = (state: OpeningState): '/(tabs)/round' | '/(tabs)' =>
  opensOnRoundTab(state) ? '/(tabs)/round' : '/(tabs)';
