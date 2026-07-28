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
 * Written to be read on a lock screen by somebody who has never heard of this
 * app: what it is, when, and what tapping does. It invites them to a live
 * leaderboard rather than to "install an app", because the leaderboard is the
 * thing they actually want.
 */
export function inviteMessage(ctx: InviteContext): string {
  // With no organizer name this used to read "You've added you to Sunday",
  // which is nonsense — the passive is the right fallback.
  const opener = ctx.organizerName ? `${ctx.organizerName} has added you to` : "You've been added to";
  const when = ctx.playedOn ? ` on ${ctx.playedOn}` : '';
  const where = ctx.courseName ? ` at ${ctx.courseName}` : '';

  const lines = [
    `${opener} ${ctx.roundName}${where}${when}.`,
    '',
    'Live scoring and a leaderboard that updates as everyone plays — you post your own scores, everybody sees them.',
    '',
    inviteLink(ctx.roundId),
  ];

  if (APP_STORE_URL) {
    lines.push('', `Need the app first? ${APP_STORE_URL}`);
  } else {
    // Say what's true rather than pointing at a store page that doesn't exist.
    lines.push('', "If the link doesn't open anything, you don't have Flight Board yet — ask me for it.");
  }

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

/** "Daniel Mullins" -> "Daniel Mullins"; trims and collapses whitespace. */
export const cleanName = (name: string): string => name.trim().replace(/\s+/g, ' ');

export type SetupStep = {
  key: 'round' | 'course' | 'players' | 'teams' | 'games';
  title: string;
  /** What this step is for, in a sentence a first-time organizer can act on. */
  blurb: string;
  done: boolean;
  /** A step that can be skipped without breaking the round. */
  optional: boolean;
  detail: string;
};

/**
 * The setup checklist, in the order a round actually gets built.
 *
 * Order matters and isn't arbitrary: teams can't be drawn before there are
 * players, and the games worth playing depend on whether there are teams. The
 * first three are required — a round with no course has no card to score
 * against, and one with no players has nobody to score.
 */
export function setupSteps(state: {
  hasRound: boolean;
  roundName: string;
  courseName: string | null;
  holeCount: number;
  teeName: string | null;
  playerCount: number;
  teamsOn: boolean;
  teamCount: number;
  gamesOn: number;
}): SetupStep[] {
  return [
    {
      key: 'round',
      title: 'The round',
      blurb: 'Name it and set the date. Creating it makes you the organizer.',
      done: state.hasRound,
      optional: false,
      detail: state.hasRound ? state.roundName : 'Not created yet',
    },
    {
      key: 'course',
      title: 'The course',
      blurb: 'Search for it once and the card is saved — par, yardage and stroke index for every hole.',
      done: state.holeCount > 0,
      optional: false,
      detail: state.holeCount
        ? [state.courseName, state.teeName, `${state.holeCount} holes`].filter(Boolean).join(' · ')
        : 'No course picked',
    },
    {
      key: 'players',
      title: 'The players',
      blurb: 'Add everyone playing. Type them in, pull them from your contacts, or text them an invite.',
      done: state.playerCount >= 2,
      optional: false,
      detail:
        state.playerCount === 0
          ? 'Nobody added'
          : `${state.playerCount} player${state.playerCount === 1 ? '' : 's'}${state.playerCount < 2 ? ' — needs at least two' : ''}`,
    },
    {
      key: 'teams',
      title: 'Teams',
      blurb: 'Only if you are playing a team format. Draws balanced sides off handicaps.',
      done: state.teamsOn && state.teamCount > 0,
      optional: true,
      detail: state.teamsOn ? `${state.teamCount} teams` : 'Not playing teams',
    },
    {
      key: 'games',
      title: 'Side games',
      blurb: 'Wolf, closest to the pin, longest drive, the team challenge. Set the stakes before the first tee.',
      done: state.gamesOn > 0,
      optional: true,
      detail: state.gamesOn ? `${state.gamesOn} running` : 'None',
    },
  ];
}

/** The first thing still to do, or null when the round is ready to play. */
export function nextStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done && !s.optional) ?? null;
}

/** A round can be played once every required step is done. */
export const readyToPlay = (steps: SetupStep[]): boolean => nextStep(steps) == null;
