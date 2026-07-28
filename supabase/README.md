# Supabase setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (free tier
   is plenty for this). Save the database password somewhere — you likely won't need it
   again, but it's a pain to lose.
2. Open **SQL Editor** in the project's left sidebar → **New query** → paste the entire
   contents of `schema.sql` → **Run**. This creates the tables, sets (permissive, for-now)
   row-level security, turns on realtime for the `scores` table, and seeds the sample round
   (Gladstan Grudge Match, four players) that the app expects.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key
   (not `service_role` — that one is secret) into the app's `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

4. Restart `npx expo start` so it picks up the new `.env` values.

That's it — score entry will start writing to `scores`, and the leaderboard will update
live on any other device pointed at the same project.

## What's deliberately not here yet

- **Phone-number sign-in.** Supabase supports it, but only once you connect a paid SMS
  provider (Twilio, MessageBird, etc.) under Authentication → Providers → Phone — that's its
  own signup and its own per-text cost, so it's Build Guide Phase 2, not part of getting
  these two screens live-syncing today. Until then, `src/components/PlayerPicker.tsx` is the
  stand-in.
- **Locked-down RLS.** The policies in `schema.sql` allow anyone with the anon key to read
  and write every row. That's fine while there's no real identity to restrict by, but it
  needs to become policies scoped to `auth.uid()` before real players (and real money
  tracking, later) touch this — see `CLAUDE.md`.
