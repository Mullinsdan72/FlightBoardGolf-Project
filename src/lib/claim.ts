/**
 * Working out who you are in a round, once accounts exist.
 *
 * A player row has an owner (`userId`) or it doesn't. Unclaimed is the *normal*
 * state for most of a field: an organizer types Steve in long before Steve ever
 * opens the app. So a roster is a mix, and the three states have to stay apart.
 *
 * Pure on purpose. This is the code that decides whether a stranger can become
 * you, and it should be checkable without a database.
 */

export type ClaimablePlayer = {
  id: string;
  name: string;
  handicap: number;
  userId?: string | null;
  /** Optional: only the organizer's roster carries it, and only some rows have one. */
  phone?: string | null;
};

/** What a signed-in person may do with a given row. */
export type ClaimStatus =
  /** Already yours. Not a claim — recognition. */
  | 'you'
  /** Nobody owns it. Yours to take if it's you. */
  | 'free'
  /** Somebody else's. Never takeable, at any layer. */
  | 'taken';

export function claimStatus(player: ClaimablePlayer, userId: string | null | undefined): ClaimStatus {
  if (!player.userId) return 'free';
  if (userId && player.userId === userId) return 'you';
  return 'taken';
}

/**
 * The row in this round that already belongs to you, if any.
 *
 * Signing in on a second device shouldn't ask who you are again — the answer is
 * recorded. Returns null when signed out, so the old "pick a name" path is
 * untouched for anyone who hasn't got an account yet.
 */
export function mineInRoster(
  players: ClaimablePlayer[],
  userId: string | null | undefined,
): ClaimablePlayer | null {
  if (!userId) return null;
  return players.find((p) => p.userId === userId) ?? null;
}

/**
 * The roster, annotated, in the order a chooser should see it: you first, then
 * the rows you could take, then the ones you can't.
 *
 * Sorting taken rows last rather than hiding them is deliberate. A field of four
 * that shows two names looks broken and invites the organizer to "fix" it by
 * adding a duplicate — which is exactly the mess claiming exists to prevent.
 */
export function claimRoster(
  players: ClaimablePlayer[],
  userId: string | null | undefined,
): Array<ClaimablePlayer & { status: ClaimStatus }> {
  const rank: Record<ClaimStatus, number> = { you: 0, free: 1, taken: 2 };
  return players
    .map((p) => ({ ...p, status: claimStatus(p, userId) }))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

/**
 * Whether the round still has a seat this person could take.
 *
 * False means every row is spoken for, and the honest offer is "add yourself"
 * rather than a list of names that will all refuse.
 */
export const hasFreeSeat = (players: ClaimablePlayer[], userId: string | null | undefined): boolean =>
  mineInRoster(players, userId) == null && players.some((p) => !p.userId);

/**
 * Whether the person a seat was made for has actually taken it.
 *
 * This is the organizer's view of the same three states `claimStatus` describes
 * from the guest's side, and it exists because its absence corrupted a real
 * round. The roster showed nine names and said nothing about which of them had
 * opened the app, so when somebody said "I don't see anything" the only
 * available response was to add them again — four rows for one man, three of
 * them orphans. The duplicates were not carelessness; adding people twice was
 * the only feedback loop there was.
 *
 * `no-number` is a legitimate resting state, not a problem to fix: it is the
 * friend who will never install the app, whose card somebody else keeps under
 * rule 2. It reads differently from `waiting` precisely so that nobody tries to
 * chase it.
 */
export type SeatState =
  /** Claimed. They have the app, they are in, and their card is their own. */
  | 'joined'
  /** Unclaimed, and there is a number to invite. Nobody need do anything but them. */
  | 'waiting'
  /** Unclaimed, with nothing to send an invitation to. Somebody keeps their card. */
  | 'no-number';

export function seatState(player: ClaimablePlayer): SeatState {
  if (player.userId) return 'joined';
  return player.phone ? 'waiting' : 'no-number';
}

export type FieldProgress = {
  total: number;
  joined: number;
  waiting: number;
  noNumber: number;
};

/** The field counted by state, for one line at the top of the roster. */
export function fieldProgress(players: ClaimablePlayer[]): FieldProgress {
  const progress: FieldProgress = { total: players.length, joined: 0, waiting: 0, noNumber: 0 };
  for (const p of players) {
    const state = seatState(p);
    if (state === 'joined') progress.joined += 1;
    else if (state === 'waiting') progress.waiting += 1;
    else progress.noNumber += 1;
  }
  return progress;
}

/**
 * Whether you may keep this player's card — post their scores, and sign it.
 *
 * Two cases, and only two:
 *
 *   - **Your own**, always. Nobody else's business, including the organizer's.
 *   - **An unclaimed player, if you run the round.** Somebody has to mark the
 *     card for the friend who never installed the app, and a row with no owner
 *     has nobody else to do it. This is rule 2's "designated scorer" exception,
 *     which has been in the rules since the beginning and never built — and
 *     keeping all four cards on one phone is exactly what it was written for.
 *
 * The moment that person claims their row it stops being true, and their card
 * becomes theirs alone. That is the whole point of claiming.
 *
 * Deliberately identical to `may_score_for` in `supabase/rls.sql`. If these two
 * ever disagree, the database wins and the app lies — so change them together.
 */
export function mayScoreFor(
  player: ClaimablePlayer,
  opts: { myPlayerId: string | null | undefined; amOrganizer: boolean },
): boolean {
  if (opts.myPlayerId && player.id === opts.myPlayerId) return true;
  return opts.amOrganizer && !player.userId;
}

/** Everyone whose card you may keep, you first. */
export function scoreableRoster(
  players: ClaimablePlayer[],
  opts: { myPlayerId: string | null | undefined; amOrganizer: boolean },
): ClaimablePlayer[] {
  return players
    .filter((p) => mayScoreFor(p, opts))
    .sort((a, b) =>
      a.id === opts.myPlayerId ? -1 : b.id === opts.myPlayerId ? 1 : a.name.localeCompare(b.name),
    );
}
