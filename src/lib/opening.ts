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

/**
 * How far along a round is. Facts about the round itself, and nothing about who
 * is looking at it — `roundStatus` takes only this, because what state a round
 * is in cannot depend on whose phone is asking.
 */
export type RoundProgress = {
  /** How many holes have a score on them, from anyone in the field. */
  holesPosted: number;
  /** How many players are in the round. */
  fieldSize: number;
  /** How many of them have signed. */
  cardsSigned: number;
};

export type OpeningState = RoundProgress & {
  /** Is a round selected at all. */
  hasRound: boolean;
  /**
   * Whether ROUND is this person's tab at all.
   *
   * True for the organizer, and for a round nobody runs or nobody is in — an
   * unclaimed round belongs to whoever turns up. False for a guest who joined
   * somebody else's round, and for them ROUND is not merely uninteresting: it is
   * **not in their tab bar**, so being sent there is being put in a room with no
   * door on it.
   */
  runsRound: boolean;
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

export function roundStatus(state: RoundProgress): RoundStatus {
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
 *
 * **Never for somebody who does not run the round**, whatever state it is in.
 * ROUND is hidden from the tab bar for a guest, so sending them there strands
 * them on a setup screen for somebody else's round with no tab to leave by. It
 * happened the moment joining by code started working: `/joincode` sits outside
 * the tab group, so coming back remounts the layout and re-runs this decision —
 * and a round nobody has teed off in is "not started", so every guest who joined
 * was immediately posted to the organizer's setup screen. The screen they want
 * is their card.
 *
 * No round at all still means ROUND, whoever is asking: there is nothing to
 * score, and the tab is shown in that state precisely so a round can be made.
 */
export function opensOnRoundTab(state: OpeningState): boolean {
  if (!state.hasRound) return true;
  if (!state.runsRound) return false;
  return roundStatus(state) !== 'in-progress';
}

/** The route to open on. One place, so no screen has to guess. */
export const openingRoute = (state: OpeningState): '/(tabs)/round' | '/(tabs)' =>
  opensOnRoundTab(state) ? '/(tabs)/round' : '/(tabs)';
