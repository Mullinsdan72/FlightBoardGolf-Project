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
    "You've been added to Flight Board golf.",
    '',
    "Flight Board shows everyone's round in real time, shows games being played within the round, and lets you keep your own score. Live scoring leaderboard without the math.",
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

export type StepKey = SetupStep['key'];

/** The run-through, in order. One list, so nothing can disagree about it. */
export const SETUP_ORDER: StepKey[] = ['round', 'course', 'players', 'teams', 'games'];

/**
 * Which screen does each step's work.
 *
 * `players` is `/setup` itself — that step is inline, because it's the one a
 * first-time organizer needs the most help with.
 */
export const STEP_ROUTE: Record<StepKey, string> = {
  round: '/rounds',
  course: '/(tabs)/course',
  players: '/setup',
  teams: '/teams',
  games: '/(tabs)/games',
};

export const STEP_TITLE: Record<StepKey, string> = {
  round: 'The round',
  course: 'The course',
  players: 'The players',
  teams: 'Teams',
  games: 'Side games',
};

/** 1-based, because "step 2 of 5" is how it reads on screen. */
export const stepNumber = (key: StepKey): number => SETUP_ORDER.indexOf(key) + 1;

export const stepCount = SETUP_ORDER.length;

/** The next step, or null at the end of the run-through. */
export function stepAfter(key: StepKey): StepKey | null {
  const i = SETUP_ORDER.indexOf(key);
  if (i < 0 || i === SETUP_ORDER.length - 1) return null;
  return SETUP_ORDER[i + 1];
}

/** The previous step, or null at the start. */
export function stepBefore(key: StepKey): StepKey | null {
  const i = SETUP_ORDER.indexOf(key);
  if (i <= 0) return null;
  return SETUP_ORDER[i - 1];
}

/** The first thing still to do, or null when the round is ready to play. */
export function nextStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done && !s.optional) ?? null;
}

/** A round can be played once every required step is done. */
export const readyToPlay = (steps: SetupStep[]): boolean => nextStep(steps) == null;
