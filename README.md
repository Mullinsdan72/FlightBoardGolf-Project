# Flight Board

A live, multiplayer golf scorecard app that replaces the paper card — built with
[Expo](https://expo.dev) + [expo-router](https://docs.expo.dev/router/introduction/) and
[Supabase](https://supabase.com) for the backend.

The design this app implements lives in [`design/`](./design) — a prototype exported from
Claude Design, plus the chat that shaped it and a phased build guide. `CLAUDE.md` has the
project's working rules.

## What's built so far

Four tabs, once you've picked which player you are:

- **Score** (`src/app/(tabs)/index.tsx`) — hole-by-hole, big +/− stepper, traditional
  circle/square notation (birdie, eagle, bogey...), both "everyone scores" and "one scorer
  for the group" modes.
- **Board** (`src/app/(tabs)/board.tsx`) — My Group and Field leaderboard tabs, live via
  Supabase Realtime.
- **Card** (`src/app/(tabs)/card.tsx`) — the final scorecard (OUT/IN, gross/net/Stableford)
  and a hold-to-sign gesture that locks it once all 18 holes are posted.
- **Field** (`src/app/(tabs)/players.tsx`) — add and remove players on the round.

No sign-in yet (see `src/components/PlayerPicker.tsx` for the stand-in), one group only, and
no course setup, teams, or side games — those come later, in the order `design/Build
Guide.dc.html` lays out.

## Running it

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Supabase project's URL and anon key
   (Project Settings → API in the Supabase dashboard). See `supabase/schema.sql` for the
   database setup — run that file once in the Supabase SQL editor. Until `.env` is filled
   in, the app still runs, just without live sync between devices.

3. Start the app:

   ```bash
   npx expo start
   ```

   Then scan the QR code with [Expo Go](https://expo.dev/go) on your phone, or press `i` /
   `a` for a simulator.
