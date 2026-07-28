# Flight Board

A live, multiplayer golf scorecard app that replaces the paper card — built with
[Expo](https://expo.dev) + [expo-router](https://docs.expo.dev/router/introduction/) and
[Supabase](https://supabase.com) for the backend.

The design this app implements lives in [`design/`](./design) — a prototype exported from
Claude Design, plus the chat that shaped it and a phased build guide. `CLAUDE.md` has the
project's working rules.

## What's built so far

- **Score entry** (`src/app/(tabs)/index.tsx`) — hole-by-hole, big +/− stepper, traditional
  circle/square notation (birdie, eagle, bogey...), both "everyone scores" and "one scorer
  for the group" modes.
- **Live leaderboard** (`src/app/(tabs)/board.tsx`) — My Group and Field tabs, live via
  Supabase Realtime.

No sign-in yet (see `src/components/PlayerPicker.tsx` for the stand-in), and no course
setup, teams, side games, or sign-off — those come later, in the order `design/Build
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
