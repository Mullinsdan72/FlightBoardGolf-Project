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
