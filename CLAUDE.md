# Flight Board

A live, multiplayer golf scorecard app — Expo + expo-router (iOS/Android/web from one
codebase) with Supabase as the backend (Postgres + Realtime).

The full design is in `design/prototype/Golf Scorecard.dc.html` (an HTML/CSS/JS prototype
exported from Claude Design) — read it directly rather than relying on a description of a
screen. `design/chats/chat1.md` has the full design conversation, in case the *why* behind a
decision matters. `design/Build Guide.dc.html` is the phased build plan this project follows.

## Current state

Built so far: **score entry** (`src/app/(tabs)/index.tsx`) and **live leaderboard**
(`src/app/(tabs)/board.tsx`), both wired to Supabase. No sign-in yet — each device picks
which of four seeded players it is (`src/components/PlayerPicker.tsx`) as a stand-in until
real phone-number auth is built. Course setup, teams, side games, and sign-off are not built
yet — see `design/Build Guide.dc.html` for the intended phase order and don't jump ahead of
it without discussing scope first.

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
   logged with the name of whoever made it. (Not yet built — sign-off is a later phase.)

## Working notes

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` come from `.env` (gitignored,
  see `.env.example`). Until they're set, `src/lib/supabase.ts` exports `supabase: null` and
  the screens fall back to local-only state — they should keep working either way.
- `supabase/schema.sql` is the source of truth for the database shape; run it in the
  Supabase SQL editor after creating a project. It seeds the same round/players the app
  expects (`src/data/seed.ts` — the IDs must match).
- RLS policies in `supabase/schema.sql` currently allow full anon access. That's deliberate
  for now — there's no sign-in yet, so there's no identity to scope by — but it must be
  replaced with policies scoped to a real signed-in user before anyone but the developer
  uses this for real (Build Guide Phase 2).
- `GOLFCOURSE_API_KEY` (golfcourseapi.com, in `.env`, no `EXPO_PUBLIC_` prefix) isn't wired
  to anything yet. It's for the future course-search screen, and should be called from a
  Supabase Edge Function, not directly from the client — an `EXPO_PUBLIC_` key ships inside
  the app bundle for anyone to read out.
- One screen per conversation. Small, finished, tested changes beat one big one.
