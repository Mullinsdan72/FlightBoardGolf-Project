# A round's life: draft, live, finished

Written the night before the app's first real outing, after setting up three
rounds for one morning and finding no way to say which was the one being played.

## The problem, precisely

Today a round has no state of its own. Whether it counts as "in progress" is
*derived* — `roundStatus` in `src/lib/opening.ts` reads it off posted scores and
signatures — and which round you are looking at is `activeRoundId`, which lives
in AsyncStorage on **one phone**.

Both of those are wrong for a group.

- **Derived is too late.** A round set up the night before is indistinguishable
  from a round nobody has teed off in yet, because they are the same thing. The
  app cannot tell "we are playing this one now" from "this is a draft I made".
- **Per-device is not shared.** The organizer opening a round on their phone does
  nothing for the other ten. Tomorrow there are three rounds and three people
  with the app, and nothing makes them agree.

START ROUND currently just navigates to the Score tab. It marks nothing, tells
nobody, and changes no state.

## Where I disagree with "one live round at a time"

The instinct is right — the app should know which round is being played — but
enforced globally it breaks the very case that prompted it. Tomorrow morning has
**two Wolf flights running at the same time**, five players and four, on separate
rounds. Both are genuinely live.

The rule that holds is one step narrower:

> **A player may be in at most one live round at a time.**

Nobody plays two rounds at once. The app can carry as many live rounds as there
are groups, so long as their fields do not overlap. That gives the group what it
needs — everyone lands on the right round — without forbidding a shotgun start,
two flights, or a society day.

## The three states

| State | What it means | Stored as |
| --- | --- | --- |
| **Draft** | Created and being set up. Nothing counts yet. | `started_at is null` |
| **Live** | Being played. Scores post here. | `started_at` set, not every card signed |
| **Finished** | Every card in the field is signed. | derived, as now |

Draft and live is one new column, `rounds.started_at timestamptz`. Finished stays
derived from signatures, because signing *is* the end of a round and a second
flag would be a second truth (rule 3).

## What each state allows

**Draft**
- Editable freely: course, tee, holes, field, format, games
- Deletable without ceremony
- Never appears on SCORE, BOARD or CARD — there is nothing to score
- Shows on ACTIVITY under *Not started*, with **START ROUND**

**Live**
- Scores post; the leaderboard runs; games pay
- Setup is still reachable (a fourth player turning up mid-round is the reason
  ROUND exists) but the round cannot be deleted without confirming
- Shows on ACTIVITY under *Being played now*

**Finished**
- Read-only. RE-OPEN is the organizer's, as today
- Shows on ACTIVITY under *Played*

## Starting a round

`started_at` is set by the **organizer**, once, from the ROUND tab's START ROUND
button — which finally does what its name says. It is refused when:

- the checklist is incomplete (already enforced)
- any player in the field is already in another live round

The second is the interesting one, and it wants a plain sentence rather than an
error: *"Kory is still playing Wolf — flight 1. Finish or reopen that round
first."*

## What it fixes on everyone else's phone

This is the part that matters most, and it falls out for free.

The opening decision (`src/lib/opening.ts`) becomes:

1. Am I in a **live** round? → open it on SCORE.
2. Otherwise → ROUND, to set one up.

So the organizer taps START and every phone in that field lands on that round
next time it opens. No switching, no instructions, no "which round are you on?"
across a car park. Today that co-ordination is done by text message.

`activeRoundId` stays per-device — it is still legitimate to *look* at an old
round — but it is a view, not the source of truth about what is being played.

## ACTIVITY, restructured

Three sections, in the order you care about them:

```
BEING PLAYED NOW
  Gladstan · Wolf — flight 1        [OPEN]
  Gladstan · Wolf — flight 2        [OPEN]

NOT STARTED
  Gladstan · Saturday scramble      [SET UP]  [START]  [DELETE]

PLAYED
  Hobble Creek · Test round 2       [VIEW]
```

- **SET UP** switches to that round and opens the ROUND tab. This is your
  "activate it before you can alter it" — made explicit rather than implied by
  whichever round the phone happens to have open.
- **START** is here as well as on the ROUND tab, because ACTIVITY is where you
  are standing when you decide the morning has begun.
- A draft can be deleted with one tap. A live round asks first.

## Migration

Existing rounds have no `started_at`. Backfill anything with a posted score:

```sql
alter table rounds add column if not exists started_at timestamptz;

update rounds r
   set started_at = coalesce(r.started_at, r.created_at)
 where exists (select 1 from scores s where s.round_id = r.id);
```

Everything already played stays live-or-finished as it should; anything never
teed off becomes a draft, which is what it always was.

## What this does not solve

- **Scramble.** Still needs one score per group, which is a change to score
  entry, not to a round's state.
- **Flights as a first-class thing.** Two Wolf flights are still two rounds you
  set up twice. Making them one round with two groups is the design's Phase 5
  field tooling and a much bigger piece.

## Order to build it

1. `started_at`, the migration, and RLS unchanged (the organizer already owns
   round updates)
2. START ROUND writes it; the checklist gate stays
3. The overlap check, with the sentence that names the clash
4. The opening decision reads live-round membership
5. ACTIVITY's three sections

Steps 1–4 are the useful half and are worth shipping alone. Step 5 is presentation
and can follow.
