# Flight Board

A live, multiplayer golf scorecard app — Expo + expo-router (iOS/Android/web from one
codebase) with Supabase as the backend (Postgres + Realtime).

The full design is in `design/prototype/Golf Scorecard.dc.html` (an HTML/CSS/JS prototype
exported from Claude Design) — read it directly rather than relying on a description of a
screen. `design/chats/chat1.md` has the full design conversation, in case the *why* behind a
decision matters. `design/Build Guide.dc.html` is the phased build plan this project follows.

## Current state

Rounds are created in the app (`src/app/rounds.tsx`). Everything keys off
`useRound().activeRoundId` — **never a hardcoded round id.** `ROUND_ID` in
`src/data/seed.ts` survives only as the no-backend fallback. Each hook takes the round id
and resets its own state when it changes, so switching rounds can't leave one round's
scores, roster, card or wolf ledger showing against another's; the score outbox is keyed
per round for the same reason. Creating a round makes you its organizer and puts you in the
field, which is why there's no seeded round in `schema.sql` any more — a round nobody
created is what forced the "claim the organizer role" button to exist.

Built so far, as six tabs — **Score** (`src/app/(tabs)/index.tsx`), **Board**
(`src/app/(tabs)/board.tsx`), **Card** (`src/app/(tabs)/card.tsx`, the final scorecard and
hold-to-sign), **Field** (`src/app/(tabs)/players.tsx`, the round's roster), **Course**
(`src/app/(tabs)/course.tsx`, search/favourites/tees/holes-in-play/manual card entry) and
**Games** (`src/app/(tabs)/games.tsx`, Wolf) — all wired to Supabase (Postgres + Realtime),
plus two screens outside the tabs, because the tab bar is full at six: `/rounds` (tap the
round name on FIELD) and `/teams` (the TEAMS row at the bottom of FIELD, which follows the
design's own players → teams → side games order). No sign-in yet — each device picks which
player in the round it is (`src/components/PlayerPicker.tsx`) as a stand-in until real
phone-number auth is built. The remaining side games aren't built — see
`design/prototype/Build Guide.dc.html` for the intended phase order and don't jump ahead of
it without discussing scope first.

Only one group exists so far. The design's group-splitting, shotgun starting-hole
assignment, flights, and 300-player roster tools are all deliberately deferred — the Field
tab is a single group's roster, not the full field tool from screen 04.

**Hole data is never a constant.** The round's card comes from `useRound().holes` — the
holes actually in play, which is 9 or 18 depending on the course and the holes-in-play
setting. Everything in `src/lib/roundMath.ts` takes that array as its first argument, and
nothing may assume 18 holes or par 72. `HOLES` in `src/data/seed.ts` is only the offline
fallback for when Supabase isn't configured.

**Every screen shares one live-data connection and one roster** via `RoundProvider`
(`src/context/RoundContext.tsx`), mounted once at the **root** layout — not the tabs layout,
because `/rounds` sits outside the tabs and needs the same round list. Don't call
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
   Never make a golfer wait on a network to record a four. Implemented by
   `src/lib/scoreOutbox.ts`: `postScore` persists to AsyncStorage and queues in an outbox
   *before* touching the network, and the queue is retried on reconnect, on a 15s timer, and
   whenever the app is foregrounded. Never "simplify" this back into a bare upsert — a score
   entered out of signal then lived only in React state, and a reload lost the hole. Run
   `npm run check:outbox` after touching it.
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
   logged with the name of whoever made it. Enforced by `signoffs` (one row = locked, checked
   in the Score tab via `useSignoff`); reopening lives on the Card tab behind a confirmation
   and only appears for `amOrganizer`. The change *log* half isn't built.
   - A player signs only their own card. The organizer can reopen **any** card, which is
     what the rule actually says.
   - `rounds.organizer_player_id` holds the role, set to whoever created the round. The
     FIELD tab can still hand it over, which is also the escape hatch for the rounds that
     predate Create Round. With no sign-in anyone can take it, so today it records who's
     running the round rather than restricting anything — move it into RLS once accounts
     exist.
   - Empty means nobody is organizer, not everybody. A card must not become unlockable just
     because the role is unclaimed.

## Working notes

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` come from `.env` (gitignored,
  see `.env.example`). Until they're set, `src/lib/supabase.ts` exports `supabase: null` and
  the screens fall back to local-only state — they should keep working either way.
- `supabase/schema.sql` is the source of truth for the database shape; run it in the
  Supabase SQL editor after creating a project (safe to re-run — every statement is
  idempotent). It seeds nothing: rounds and players are both created in the app, and a
  seeded row nobody created is what caused the filler data that couldn't be deleted.
  `supabase/reset.sql` wipes everything back to that empty state.
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
- **Search already returns the full card** (tees, per-hole par/yardage/stroke index), so
  picking a search result must not trigger a second lookup — that would double the quota cost
  of every course. `fetchCourseDetail` is a fallback for results that arrive without tees.
- Payload parsing lives in `src/lib/courseParse.ts` (pure, no network) so it can be checked
  against a recorded response: `npm run check:courses` runs
  `scripts/check-course-parse.js` over `scripts/fixtures/gladstan-search.json`. Run it after
  touching the parser. It exists because the failure it caught was silent — upstream `id` is
  a *number*, and a string-only guard dropped every result while reporting "nothing found".
- Parsing is tolerant of alternative field names (yardage vs yards, handicap vs stroke_index)
  on purpose. If a response genuinely doesn't map, it logs the raw payload and throws a
  readable error rather than returning an empty list.
- Tee names repeat across genders (Gladstan has a men's and a women's Gold at different
  ratings), so a tee's identity is always name **+ gender** — including its database key.
- Known simplification: `strokesReceivedFor` allocates strokes off the full course handicap
  even on a 9-hole round, where convention is to halve it. Fine for gross play and for the
  net figures shown today; revisit if net becomes a competitive format.
- `npm run check` runs the typecheck plus all four verification scripts (course parsing,
  score outbox, wolf money, teams) — 132 assertions. Worth running before pushing anything
  that touches scoring, course data, teams, or money.

## Who may change what

Three different kinds of permission, and they don't collapse into one:

- **Your own** — entering your score, signing your card. Nobody else's business, including
  the organizer's.
- **The wolf's own, per hole** — picking a partner or going alone. Gated to whoever has the
  wolf that hole, not to the organizer.
- **The organizer's** — the terms of the round and of a bet: the stake, the lone multiplier,
  the rotation, and reopening a signed card.

Read access is deliberately wider than write. A player in a bet is owed sight of the stake
and the rotation, so the Wolf setup tab stays visible to everyone and goes read-only rather
than hiding. Hiding terms from someone playing for money would be the wrong instinct.

## Wolf

`src/lib/wolf.ts` is pure and covered by `npm run check:wolf` — 30 assertions including the
design's own worked figures. Change the maths there and run it.

- **No money is ever stored.** `wolf_games` holds the terms (stake, multiplier, rotation),
  `wolf_holes` holds the decision per hole (who was wolf, who they took, null = alone).
  Everything else — what a hole paid, running totals, who owes whom — is recomputed from
  those plus posted scores. A stored total is a total that drifts.
- **A hole pays only when the whole group has posted it.** Outcome is `pending` otherwise,
  never a win. Equal best ball is a `push` and moves nothing.
- **Every hole sums to exactly zero.** Amounts are in cents and remainders are handed out
  deterministically, because a paired win in an odd-sized group divides unevenly. Money that
  doesn't balance is money someone argues about.
- **The wolf is recorded, not derived, once a hole is decided.** This deviates from the
  prototype on purpose: there the wolf came from the live rotation for every hole, so
  shuffling rewrote holes already played. Upcoming holes still follow the rotation, so
  shuffling before the round behaves as designed while shuffling mid-round can't rewrite
  history.
- Eighteen holes don't divide by four, so a fixed rotation stacks most par 3s on one seat —
  at Gladstan, holes 3, 7 and 11 all land on the same player. That's why the design shows the
  par-3 draw and offers a shuffle; it's structural, not bad luck.
- One screen per conversation. Small, finished, tested changes beat one big one.

## Teams

`src/lib/teams.ts` is pure and covered by `npm run check:teams` — 66 assertions. `/teams`
(`src/app/teams.tsx`) is organizer-only to edit and read-only to everyone else, same as Wolf
setup.

- **Only the two formats that keep per-player score entry**: best ball and team total. The
  design lists five more (scramble, 2-man scramble, shamble, alternate shot, Ryder Cup) and
  they are deliberately absent — they need one number per *group* instead of one per player,
  which is a change to score entry, not to teams. Don't add them to the format list without
  building that.
- **A hole counts only once every member has posted it.** Half a best ball is not a best
  ball; the number would drop the moment the last player posts. Same rule as a pending Wolf
  hole, and the same reason (rule 4). `toPar` is measured over the holes that counted, so a
  team two holes behind isn't flattered by the ones it hasn't played.
- **A team total pars against every card**, so its baseline is par × the number of players.
  Comparing a two-man total to a single par would make every team look 70 over.
- **`draftTeams` deviates from the prototype's version, on purpose.** The prototype rotated
  each handicap tier by `seg * (row + 1)`, which with two teams rotates the first tier and not
  the second — breaking the snake it exists to preserve. A re-draw of four players off 2, 8,
  14 and 22 came out 2+14 against 8+22, a 14-shot spread where a 2-shot one was available.
  Instead: generate candidate draws (seeded shuffles within each tier, so every team still
  gets one player per tier), dedupe by who's together, rank by handicap spread, and let `seg`
  pick. Seed 0 is the plain snake, so the fairest draw is always a candidate.
- Balance and variety genuinely conflict in a small group — four players have three possible
  pairings and only one is fair. The screen says so rather than quietly handing out a lopsided
  re-draw.
- Handicaps are **not** applied to team scoring yet; the figures are gross. Net best ball is
  the obvious next step and is the format most mixed-handicap groups actually play.
- `team_members`' primary key is `(round_id, segment, player_id)` — a player is on at most one
  team per segment. Two teams for one player would make a best ball count their score twice,
  so the database refuses it rather than trusting every screen to.
- Segments are what a re-draw at the turn produces. `segmentsFor` splits **by position, not by
  hole number** — the back nine is holes 10–18, and a round can legitimately start at hole 10.
  Nine holes get one segment however the setting is left, since there's no turn to re-draw at.
- **Segments never total up.** A re-draw makes the two halves separate contests between
  different teams, so BOARD lists them one after the other rather than adding them — a
  combined figure would be summing two different competitions.
- BOARD grows a TEAMS tab only while `teams.enabled`, and the tab shows a segment as "not
  drawn yet" rather than falling back to the suggested draft. `teamsForSegment` *does* fall
  back, which is right on the setup screen (you need something to accept) and wrong on a
  leaderboard (it would show standings for teams nobody agreed to). Use `teamDrawSavedFor`
  to tell them apart.
