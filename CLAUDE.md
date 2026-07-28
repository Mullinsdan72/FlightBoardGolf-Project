# Flight Board

A live, multiplayer golf scorecard app — Expo + expo-router (iOS/Android/web from one
codebase) with Supabase as the backend (Postgres + Realtime).

The full design is in `design/prototype/Golf Scorecard.dc.html` (an HTML/CSS/JS prototype
exported from Claude Design) — read it directly rather than relying on a description of a
screen. `design/chats/chat1.md` has the full design conversation, in case the *why* behind a
decision matters. `design/Build Guide.dc.html` is the phased build plan this project follows.

## Current state

Built so far, as five tabs — **Score** (`src/app/(tabs)/index.tsx`), **Board**
(`src/app/(tabs)/board.tsx`), **Card** (`src/app/(tabs)/card.tsx`, the final scorecard and
hold-to-sign), **Field** (`src/app/(tabs)/players.tsx`, the round's roster), and **Course**
(`src/app/(tabs)/course.tsx`, search/favourites/tees/holes-in-play/manual card entry) — all
wired to Supabase (Postgres + Realtime). No sign-in yet — each device picks which player in
the round it is (`src/components/PlayerPicker.tsx`) as a stand-in until real phone-number
auth is built. Teams and side games are not built yet — see `design/Build Guide.dc.html` for
the intended phase order and don't jump ahead of it without discussing scope first.

Only one group exists so far. The design's group-splitting, shotgun starting-hole
assignment, flights, and 300-player roster tools are all deliberately deferred — the Field
tab is a single group's roster, not the full field tool from screen 04.

**Hole data is never a constant.** The round's card comes from `useRound().holes` — the
holes actually in play, which is 9 or 18 depending on the course and the holes-in-play
setting. Everything in `src/lib/roundMath.ts` takes that array as its first argument, and
nothing may assume 18 holes or par 72. `HOLES` in `src/data/seed.ts` is only the offline
fallback for when Supabase isn't configured.

**Every screen shares one live-data connection and one roster** via `RoundProvider`
(`src/context/RoundContext.tsx`), mounted once at the tabs layout. Don't call
`useLiveScores()` or `useRoundPlayers()` directly from a screen — go through `useRound()`
instead. Two independent calls to `useLiveScores()` open two Supabase realtime channels with
the identical name, which crashes the app the moment both screens are mounted (this actually
happened and took a while to track down — Supabase's client rejects the second
`postgres_changes` subscription on a topic that already has one).

Screens must tolerate their chosen player disappearing from the roster (removed on another
device). Each one checks membership and falls back to `PlayerPicker` rather than indexing
into a roster that no longer contains them.

**Expo SDK is pinned to 54, not whatever `create-expo-app` scaffolds by default.** The
`expo` package on npm is regularly ahead of what the published Expo Go app actually
supports — check Expo Go's own Settings → App Info → "Supported SDK" on a real device
before bumping this, not just the npm version number. Bumping the SDK without checking that
first breaks the app on every physical phone still on the older Expo Go build, with a
misleading "requires a newer version of Expo Go" error that looks like the user's fault. If
package versions ever get out of sync, `node_modules/expo/bundledNativeModules.json` (after
installing the target `expo` version) has the exact compatible version of every other
expo-*/react-native-* package — hand-align to that rather than guessing.

## Rules that must not drift

These came out of building the prototype, several by getting them wrong first. They apply
everywhere in this codebase, not just the screens they were first written for.

1. **Scores write locally first, always.** The write succeeds on the phone and syncs later.
   Never make a golfer wait on a network to record a four.
2. **A player edits only their own score**, unless they are the group's designated scorer.
   Any hole can be disputed for five minutes after it posts.
3. **One number, one source.** Never store a figure that can be derived — a to-par total, a
   net score, a "thru" count are all computed from posted scores at render time, not saved
   separately. Every duplicate becomes a contradiction on screen sooner or later.
4. **Never show a score for a hole that hasn't been played.** Unplayed holes are blank
   (a dash), not zero and not par. A round in progress has no final net or Stableford total.
5. **Say what a number is.** "Thru 6" only makes sense for tee-time starts; on a shotgun
   start it's "6 played". Label each number for what it actually represents.
6. **The app never moves money.** It only tracks who owes whom (for side games, once those
   exist) and nets it to the fewest payments. It is not a payments processor.
7. **Rotations must be reshufflable.** Anything fixed (wolf order, starting holes, team
   draws) hands the same advantage to the same person every time, at the same course.
8. **A signed card is locked.** Reopening it takes the organizer, and every day-of change is
   logged with the name of whoever made it. Enforced today by `signoffs` (one row = locked,
   checked in the Score tab via `useSignoff`) — the "takes the organizer to reopen" and
   "day-of change log" halves aren't built yet, since there's no organizer role at all.

## Working notes

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` come from `.env` (gitignored,
  see `.env.example`). Until they're set, `src/lib/supabase.ts` exports `supabase: null` and
  the screens fall back to local-only state — they should keep working either way.
- `supabase/schema.sql` is the source of truth for the database shape; run it in the
  Supabase SQL editor after creating a project (safe to re-run — every statement is
  idempotent). It seeds the same round/players the app expects (`src/data/seed.ts` — the
  IDs must match).
- RLS policies in `supabase/schema.sql` currently allow full anon access. That's deliberate
  for now — there's no sign-in yet, so there's no identity to scope by — but it must be
  replaced with policies scoped to a real signed-in user before anyone but the developer
  uses this for real (Build Guide Phase 2).
- **Never call GolfCourseAPI from the app.** The key lives as a Supabase secret on the
  `courses` Edge Function (`supabase/functions/courses/index.ts`); the app talks only to that
  function via `src/lib/courseApi.ts`. An `EXPO_PUBLIC_` key would be compiled into the
  bundle for anyone to extract and spend the account's 300-lookups-a-day quota. The
  `GOLFCOURSE_API_KEY` in `.env` is only there for local reference — nothing reads it.
- The function is deployed with `--no-verify-jwt` because there's no sign-in yet, so anyone
  who found the URL could spend the quota. Drop that flag when phone auth lands. See
  `supabase/functions/README.md`.
- **Three tiers of course data, by design:** starred favourites (permanent, zero API calls),
  the round's own `round_holes` snapshot (fetched once, works offline at the tee), and search
  (the only thing that spends the daily quota). A course is fetched once ever and cached
  permanently in `courses`/`course_tees` — never re-fetch one that's already cached.
- `src/lib/courseApi.ts` parses upstream fields tolerantly on purpose (yardage vs yards,
  handicap vs stroke_index). If a real response doesn't map, it logs the raw payload and
  throws a readable error rather than silently returning nothing.
- One screen per conversation. Small, finished, tested changes beat one big one.
