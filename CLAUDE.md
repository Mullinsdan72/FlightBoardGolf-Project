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
hold-to-sign), **Players** (`src/app/(tabs)/players.tsx`, the round's roster), **Course**
(`src/app/(tabs)/course.tsx`, search/favourites/tees/holes-in-play/manual card entry) and
**Games** (`src/app/(tabs)/games.tsx`, every side game plus SET UP) — all wired to Supabase
(Postgres + Realtime), plus three screens outside the tabs: `/rounds` (the round name on
SCORE, or past rounds on CARD), `/teams` (the TEAMS row on PLAYERS, following the design's own
players → teams → side games order) and `/settle` (SETTLE UP on GAMES).

**Four tabs, the same four for everyone: SCORE, LEADERBOARD, CARD, GAMES.** There are no
organizer-only tabs any more, because `/start` is the round's home — course, tee, holes,
scoring, players, teams and games are tiles on one screen, reached by **tapping the round
name on SCORE**. That is the door back into setup from inside a round, and it is the door
that was missing the day a fourth player turned up mid-round with nowhere to be added.
GAMES still only appears once a game exists. Inside GAMES the sub-tabs are built from the
games actually running — each states its rules and shows its results — with the controls on
an organizer-only SET UP tab.

`/(tabs)/players` and `/(tabs)/course` are still routes and still live inside the tabs
group; they simply have no tab button. Both therefore need their own way back, and both have
one — a tab screen without a tab is a room with the door bricked up.

No sign-in yet: each device picks which player in the round it is
(`src/components/PlayerPicker.tsx`) as a stand-in until real phone-number auth is built.
**That choice is remembered and it is who creates rounds.** `usePlayerIdentity` keeps
`flightboard.myPlayerId` in AsyncStorage, so the phone knows who it is across rounds and
restarts, and creating a round seats that player in the field and makes them its organizer
without asking. Read the id from `myId` directly — never from `players.find(...)`, because
that list is the *open* round's roster and you can be looking at a round you're not in.
Filtering identity through it produced rounds with no organizer and nobody in the field.
The creator is a player until they say otherwise, and saying otherwise is one REMOVE on the
PLAYERS tab.
Every side game the design calls for is built (Wolf, closest to the pin, longest drive, team
challenge) and they converge on `/settle`. See `design/prototype/Build Guide.dc.html` for the
phase order and don't jump ahead of it without discussing scope first.

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
   - `mayScoreFor`/`scoreableRoster` in `src/lib/claim.ts` are the one definition of who the
     designated scorer is: your own row always, plus **unclaimed** rows in a round you
     organize. Deliberately identical to `may_score_for` in `supabase/rls.sql` — change them
     together, because if they disagree the database wins and the app lies.
   - It covers signing as well as posting. Somebody has to sign for the friend who never
     installed the app, and SCORE and CARD must gate on the same function or one offers what
     the other refuses.
   - **Show the rows you can't score, and say why.** Group mode gives steppers only to cards
     this phone keeps — it used to give them to the whole field, so a number for a player
     scoring on their own phone moved on screen and was thrown away on post.
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
   - A player signs their own card, and any card they are keeping under rule 2. The
     organizer can reopen **any** card, which is what the rule actually says.
   - **The lock is per card, and SCORE must read the whole round's.** `useSignoffs` exists
     because `useSignoff` answers "is this card locked", which is right on CARD and wrong on
     SCORE: keying the screen off your own signature took it away the moment a scorer signed
     their own, stranding the three cards they were still marking — and left an organizer
     unable to fix anything after reopening, because reopening yours isn't what was signed.
     SCORE shows while any card it keeps is open, and refreshes signoffs on focus, since
     signing and reopening both happen on the tab next door.
   - A failed signoffs read means **unlocked**, never locked. Rule 8 is enforced by a row
     existing; a network error is not that row, and locking a course full of cards on a bad
     connection is the worse failure.
   - `rounds.organizer_player_id` holds the role, set to whoever created the round. The
     PLAYERS tab can still hand it over, which is also the escape hatch for the rounds that
     predate Create Round. With no sign-in anyone can take it, so today it records who's
     running the round rather than restricting anything — move it into RLS once accounts
     exist.
   - Empty means nobody is organizer, not everybody. A card must not become unlockable just
     because the role is unclaimed.

## Invitations waiting for you

`/invited` (`src/app/invited.tsx`), `usePendingInvites`, and `pendingInvites` in
`src/lib/invite.ts` — covered by `npm run check:invite`.

- **An invitation outranks every other opening screen, including `/welcome`.** A guest whose
  organizer typed their number is precisely a phone with no player and no round, so checking
  welcome first sends the one person this was built for to "set a round up".
- **The failure that matters isn't a wrong screen, it's a second round.** Hand somebody START
  ROUND when they were already in a field and the group ends up on two leaderboards arguing
  about which is real.
- **It hangs entirely on `my_players()`, so it needs phone sign-in.** That is the only way a
  phone can know an invitation is for *it* — the match is against `auth.users.phone`, which
  the app can't read, which is why the function is `security definer`. Signed out there are
  no invitations and the app behaves exactly as it did before. Nothing to switch on when
  codes start delivering.
- **"Not now" is remembered** (`flightboard.declinedInvites`). Asked on every cold start, the
  question becomes something you dismiss unread — and then the one that mattered gets
  dismissed too.
- **Acceptance is read off the player row, not off the rounds list.** A row linked to your
  account is one you took. `rounds` is every round in the database while RLS is open, so
  passing it as "already joined" would filter away every invitation there is.
- **ROUND comes off the tab bar for anyone who isn't the organizer.** The course, tees, field,
  format and games are the organizer's; a tab full of settings you may not change is worse
  than no tab. Not a trap — ACTIVITY's + NEW ROUND makes you organizer of your own round and
  the tab returns. A round with no organizer or an empty field still shows it, because an
  unclaimed round belongs to whoever turns up.

## Which tab the app opens on

`src/lib/opening.ts` is pure and covered by `npm run check:opening` — 15 assertions.
`(tabs)/_layout.tsx` decides once per cold start and redirects.

- **A round is "in progress" only once a hole is posted, and only until every card is
  signed.** A round set up last night is a plan, not a round, so ROUND — the screen with
  START ROUND on it — is where the app opens. Opening on a locked, finished scorecard is
  what reads as the app being stuck.
- **Decided once, then never revisited.** A layout that kept re-deciding would pull you off
  ROUND the moment somebody posted a hole and off SCORE the moment the last card was signed.
  The opening tab is an opening move, not a rule about where you may be.
- **It has to be a `<Redirect>`, not `initialRouteName`.** A cold start opens the URL `/`,
  and `/` *is* the Score tab, so the navigator's initial route loses to the link every time.
- **`playersLoaded` and `scoresHydrated` only settle for a round that exists.** With no
  round, `useRoundPlayers.refresh` returns before setting its flag and `useLiveScores` stops
  at hydrated false. Gate on them unconditionally and a first-time user gets a permanent
  blank screen — this file has shipped that bug twice already, so gate with
  `!activeRoundId || (...)`.
- **`roundStatus` is the one definition of not-started / in-progress / closed**, and both
  ACTIVITY and the opening tab read it. Closed is *every* card signed, never your own — one
  phone can be keeping four cards, and a round you signed first is still being played.
- **ACTIVITY shows the field as soon as there are players in it.** It used to wait for a
  posted score, so a round you had just added four people to looked empty. Reported as "it
  doesn't show the players that were added", and it didn't.
- **RE-OPEN on ACTIVITY unlocks a whole round**; the card-by-card version is on CARD. It
  deletes signatures and never scores. It is on ACTIVITY because the place a wrong score gets
  noticed is the leaderboard afterwards, not the scorecard at the time.
- Posted holes are counted off the **local cache**, which is what the phone knows before the
  network answers. A phone that has never seen the round reads it as unplayed and opens on
  ROUND: one tap wrong, and much better than holding the whole app on a network call at a
  tee.

## Working with Dan

Dan is building this as his first app and runs every change on a real phone. Two things
follow from that, and both were asked for directly:

- **Spell out every step, numbered, with the exact command to type and what success looks
  like.** Not "apply the patch and restart" — the `cd`, the command, the expected output,
  and what to do when it isn't that. He has lost time to instructions that assumed a step.
- **Terminal commands and SQL are different places.** Never put `cd`, `git` and `pbcopy` in
  the same block as something meant for the Supabase editor; that has already been pasted
  into the wrong one. Label which window every block belongs to.
- **After every `git am`, have him run `git log --oneline -1` before looking at the phone.**
  Most "it isn't working" reports in this project have been a patch that never applied, and
  that is indistinguishable from a bug at this end without the check.

## Working notes

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` come from `.env` (gitignored,
  see `.env.example`). Until they're set, `src/lib/supabase.ts` exports `supabase: null` and
  the screens fall back to local-only state — they should keep working either way.
- `supabase/schema.sql` is the source of truth for the database shape; run it in the
  Supabase SQL editor after creating a project (safe to re-run — every statement is
  idempotent). It seeds nothing: rounds and players are both created in the app, and a
  seeded row nobody created is what caused the filler data that couldn't be deleted.
  `supabase/reset.sql` wipes everything back to that empty state.
- RLS policies in `supabase/schema.sql` still allow full anon access, and that is now the
  **single most important open item**. Phone sign-in exists (`supabase/auth.sql`,
  `usePhoneAuth`, `/signin`) but the policies have not been flipped, because flipping them
  before everyone has signed in and claimed a player would make every existing round
  invisible to its own players. The order is fixed and must be kept:
    1. `supabase/auth.sql` + phone sign-in in the app — **done**
    2. everyone signs in once and claims their player row — **built**, needs doing
       for real once codes are being delivered
    3. `supabase/rls.sql`, the actual lockdown — **written, not yet run**
  Step 3 is the one no tap in the app can undo, so it goes last.
- **Signing in and being a player are two different things.** `usePhoneAuth` proves whose
  phone this is; `usePlayerIdentity` still decides which player row this device is. Don't
  collapse them — a link that seated whoever opened it is the same mistake as an invite that
  auto-joins, and `players.user_id` being null is the *normal* state for most of a field
  (an organizer types Steve in long before Steve opens the app).
- `claim_player()` and `my_players()` are `security definer` because `players.user_id` must
  never be writable directly. Writing it directly is "claim anybody", including the
  organizer — the one row that decides who can reopen a signed card.
- **Owning a row is read; taking one is a decision.** `src/lib/claim.ts` is pure and covered
  by `npm run check:claim` (25 assertions). `RoundProvider` auto-adopts a row whose `userId`
  is already yours — signing in on a second phone must not ask who you are again — but an
  *unclaimed* row always needs a deliberate tap, because guessing wrong seats you as somebody
  else and hands you their card. Signed out, a claimed row reads `taken`, never `you`; there
  is an assertion for exactly that.
- **Re-running `schema.sql` restores the permissive policies.** It is idempotent and safe
  in every other respect — nothing dropped, nothing seeded — but its policy block recreates
  `"anon full access"` on all 16 tables. Once `rls.sql` has been run, `schema.sql` silently
  undoes it. Always run them in that order, never one alone.
- **The lockdown ships as three files and must be used as three.**
  `rls-preflight.sql` changes nothing and answers the only question that matters:
  *ROUNDS THAT WOULD VANISH* must read 0. A round with no claimed member is unreachable
  from every phone the moment policies go live — not deleted, but identical to deleted from
  inside the app. `rls-rollback.sql` restores the permissive policies in one paste and
  should be open in another tab while `rls.sql` runs. Recovering beats diagnosing when a
  group is standing on a tee.
- **The RLS helpers are `security definer` for correctness, not convenience.** A policy on
  `rounds` that queries `round_players` gets `round_players`' policy evaluated inside it,
  which queries `rounds` — and Postgres refuses the recursion. `stable` matters too: without
  it the planner calls them per row instead of per statement, which is a leaderboard that
  loads versus one that doesn't.
- **`may_score_for` is the strict reading of rule 2**: your own row always, plus unclaimed
  rows in a round you organize — because somebody has to keep the card for the friend who
  never installed the app, and an unowned row has nobody else. It stops applying the instant
  that person claims their row. Widening it to any member is one line if keeping a mate's
  card matters more than the guarantee.
- **"The wolf's own, per hole" is not enforced in the database, on purpose.** Checking that
  the writer holds the wolf means resolving the rotation in SQL, and the rotation is app-side
  precisely so a reshuffle can't rewrite played holes. The app gates the hole; RLS gates the
  round.
- **A claimed row is shown and refused, never hidden.** A four-ball that displays two names
  looks broken, and the organizer "fixes" it by adding a duplicate — the precise mess
  claiming exists to prevent.
- **`auth.users.phone` has no leading `+`; the app writes proper E.164 with one.** Comparing
  them raw silently never matches, and the failure looks exactly like "nobody invited you".
  `my_players()` strips it. `src/lib/phone.ts` is the only place a typed number becomes a
  stored one, covered by `npm run check:phone` — a number that normalises two ways doesn't
  error, it quietly creates a second account with none of your rounds in it.
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
- `npm run check` runs the typecheck plus all seven verification scripts (course parsing,
  score outbox, wolf money, teams, side games, team challenge, invites) — 395 assertions. Worth running before pushing anything
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
and the rotation, so every game's tab states its terms in plain words — what it costs, when
it pays, who set it. What players don't get is the *controls*, which live on GAMES → SET UP,
an organizer-only tab. Hiding the terms from someone playing for money would still be the
wrong instinct; hiding the knobs is just tidy.

**COURSE is off the tab bar.** Search, tees and holes-in-play all live on `/start` now, and
two doors to the same settings is clutter rather than choice. The route still exists and
`/start` links to it, because **entering a card by hand is only there** — the standing rule
applies: hiding a tab must never hide the last way to something.

**Tab visibility is a tidier screen, not a permission.** PLAYERS shows only for
`amOrganizer` (or when the round has no organizer or an empty field), and GAMES only once a game exists. With no sign-in
any device can pick any player and take the organizer role, and every route stays reachable
by URL. The real boundary arrives with accounts and RLS — don't let this get mistaken for it.

Because those tabs hide, two doors had to be cut elsewhere, and they must not be closed
again: the round name on SCORE opens `/rounds`, and "NOT YOU?" at the bottom of SCORE is the
only way back to the player picker. The Card's header opens past rounds. Before hiding any
further tab, check what was only reachable through it.

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

## Setting a round up, and invites

`/setup` (`src/app/setup.tsx`) is the organizer's run-through — the checklist a first-time
organizer is missing. `src/lib/invite.ts` holds the link format, the message and the step
order, covered by `npm run check:invite` — 72 assertions.

- **It links to the screens that already do each job** rather than reimplementing course
  search or team drawing. What a new organizer lacks isn't the screens, it's knowing which
  one is next and when a step is finished. Only the players step is inline, because that's
  the one that needed the most help.
- **`SetupBar` is what stops that being a dead end.** Every step screen mounts it, and it
  shows only when the route carries `?setup=1` — so the Course tab is an ordinary tab the
  rest of the time. Keep the flag on every hop (`router.replace({ pathname, params: { setup:
  '1' } })`) or the run-through drops you where it found you. There is deliberately **no Save
  button** anywhere in it: picking a course, adding a player and drawing teams all write as
  you tap, and a Save button would imply they don't.
- `SETUP_ORDER`, `STEP_ROUTE` and `stepAfter`/`stepBefore` in `invite.ts` are the single
  source of the order. Add a step there, not in a screen.
- **The order is the order a round is built**: round, course, players, then optionally teams
  and games. Teams can't be drawn before there are players. Course and two players are
  *required* — a round with no card has nothing to score against.
- **Two honest limits, stated on screen rather than discovered by a friend:**
  - `flightboard://` resolves only in a real build. Inside Expo Go the app lives at an
    `exp://` URL tied to whichever machine runs the dev server, so an invite link in a text
    message opens nothing yet. It starts working the day there's a build, with no change to
    what was sent.
  - `APP_STORE_URL` is **null** until Flight Board is published. Never put a plausible-looking
    store URL there — a dead link in a text message is worse than none.
- **Contacts are read on tap and never uploaded.** A picked contact lands in a staging list
  the organizer confirms; nothing joins the round on its own.
- `/join?round=<id>` is where an invite lands: it switches the device to that round, then asks
  who you are. Joining is never automatic — with no sign-in the link is the only credential,
  and a link that silently adds whoever opens it would put strangers in the field.
- `addPlayer` returns the new player's id so a joiner can become the player they just created.

## Side games and settle-up

`src/lib/sideGames.ts` is pure and covered by `npm run check:sidegames` — 55 assertions.
`/settle` (`src/app/settle.tsx`) is where every game converges; hole games live on the GAMES
tab's third sub-tab.

- **A hole pays only when it has a winner.** Nobody on the green means nobody won it and the
  antes stay in pockets — the money must never go to the least-bad miss. Same rule as a
  pending Wolf hole, same reason.
- **One game covers many holes.** Closest to the pin on every par 3 is one game with four
  payouts, not four games — straight from the design.
- **Netting across games is the point.** A fiver lost at Wolf and won back at closest-to-the-pin
  against the same player is *no payment*, not two people swapping notes. `settleEverything`
  combines positions and hands them to the same greedy `settleUp` Wolf already uses.
- **Every game is shown separately alongside the total**, so a disputed figure can be traced
  to the game that produced it. A single number nobody can explain is what starts the argument
  the screen exists to end.
- **The settle screen checks its own arithmetic.** If the positions ever fail to sum to zero
  it says so in red and tells you not to pay off it, rather than quietly paying out a number
  that came from nowhere.
- **Deviation from the design, deliberate:** the design excludes pot games from the settle-up
  because a 96-entrant field's pot is collected by the pro shop. Here every entrant is a player
  in the round, so the pot *is* person-to-person and nets like anything else. Revisit when
  field-wide games exist (Phase 5) — that's when a pot stops being nettable inside the group.
- Terms are the organizer's (adding, removing and pricing a game); **recording who won a hole
  is any player's**, like posting a score. That's the existing three-tier permission model, not
  a new one.

### Team challenge

`src/lib/teamChallenge.ts`, covered by `npm run check:challenge` — 82 assertions including the
design's own worked figure ($5 a hole five down, plus a nine, plus the match).

- **Three wagers settle on three different clocks.** The per-hole rate runs live, because the
  margin is a fact about holes already played. A nine pays only when that nine is finished and
  the match only when the round is — neither may settle early, which is the easiest thing here
  to get wrong.
- **A nine-hole match has no nines inside it.** `ninesOf` returns nothing below 18 holes,
  because the per-nine wager and the match would otherwise be the same contest settled twice.
- **The wager is per team and splits between its members** ("split it between the two of you",
  per the design). `splitCents` hands out the remainder rather than rounding it away — a £25
  win between two is 13 and 12.
- **More than two teams: every pair plays.** The design assumes two; with three, "team to
  team" can only mean each pairing, and it keeps the whole thing zero-sum.
- **A re-drawn turn is two matches, not one.** You can't carry a margin across a change of
  partner, so each segment settles its own three wagers.
- Only a **saved** draw is a match. A suggested draft isn't a bet, so `challengePositions`
  skips segments where `teamDrawSavedFor` is false.

## Teams

`src/lib/teams.ts` is pure and covered by `npm run check:teams` — 107 assertions. `/teams`
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
- **Gross, net or off the low man is a property of the ROUND** (`rounds.scoring_mode`,
  defaulting to net), not of the team game. It used to live on `team_games.handicap_mode`,
  where it governed team standings and nothing else — so "net" meant one number in the
  standings and a different one on your own card, which is exactly what a group argues about
  after a bet. `useTeams` now takes it as an argument and `team_games.handicap_mode` is
  retained but unread (rule 3). The teams screen still edits it, because that is where you
  are thinking about it, but the label says *whole round*.
- **The leaderboard ranks by it, not just mentions it.** BOARD applies `allowanceFor` — the
  same function teams use — so a player's strokes on the board and in the standings can never
  disagree. Off the low man is a *smaller* allowance than full net, so reading `p.handicap`
  directly would quietly hand out shots nobody won. The FIELD tab names the mode in its
  header, per rule 5. The allocation comes from
  `strokesOnHole` in `roundMath.ts` — the one definition of the rule — so a player's net in
  the team's best ball always matches the net on their own card.
- **In a net best ball the low net ball wins the hole, not the low gross one.** Taking the
  low gross and deducting a stroke afterwards credits the wrong player's shot; there's an
  assertion for exactly that.
- `roundMath.ts` imports `ScoreMap` from `@/lib/scoreOutbox`, not from `@/hooks/useLiveScores`
  which merely re-exports it. A pure maths module must not pull React and Supabase in behind
  a type import — it breaks the isolated builds the check scripts do.
- **Allowance and allocation are separate steps.** `allowanceFor` decides how many strokes a
  player gets (`gross` none, `net` their full handicap, `lowman` the gap to the best player);
  `strokesOnHole` decides which holes they land on. Keep them apart — mixing them is how an
  allowance rule ends up quietly reimplemented per format.
- **Off the low man, the baseline is the players on a team in that segment**, not the whole
  roster. Somebody sitting out isn't in the game, and letting them set the mark would hand
  the entire field strokes nobody won. Nobody ever comes out below scratch.
- Handicap **percentage** allowance (the 85–90% many fourball competitions use) is still not
  implemented — full strokes only, in all three modes.
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
- **A suggested draft is not a draw, and every screen must say which it is looking at.**
  This got out once: `setupSteps` counted the non-empty teams in `teamRoster`, which is the
  *fallback draft*, so switching teams on ticked the setup step done — "2 teams" — with
  nothing written, and the leaderboard then correctly reported none drawn. Anything asking
  "are there teams?" wants `teamDrawSaved`/`teamDrawSavedFor`, never a count of the roster.
  `teamAcceptDraw` saves the draft on screen as-is, which is the one thing nothing did
  before: every other action wrote teams only as a side effect of *changing* them, so a
  draw you were already happy with could only be accepted by re-drawing it away and back.
