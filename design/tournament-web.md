# The desktop side: running the tournament

From the instruction that a large event should be *seamless and easy to manage
outside the app* — CSV upload, QR sign-up, invitations the day before, and a
live leaderboard anyone can watch.

This is a second surface, not a second product. One database, one set of rules,
one leaderboard. What differs is the job.

## Where the seam goes

> **The app is for playing. The web is for running.**

| Web (desktop, organizer) | App (phone, player) |
| --- | --- |
| Build the field: CSV, QR sign-up, manual add | Score, and score for your group |
| Draw the flights, name them, set tee times | Play your flight's Wolf |
| Set the round's terms once | Watch every flight |
| Send the invitations the day before | Sign your own card |
| Print starter sheets and cards | Settle up within your flight |
| The big-screen leaderboard in the clubhouse | The leaderboard in your pocket |

Everything on the left is done sitting down, days ahead, with a keyboard and a
spreadsheet already open. Everything on the right is done standing on a tee box
in the sun. That is the whole reason for two surfaces, and it is a better test
for "which side does this go on?" than any feature list.

**The app still has to work alone.** A foursome on a Saturday never opens the
website. Nothing the web adds may become a step the app requires.

## The part that is already done

Every number this app produces — what a Wolf hole paid, who owes whom, a team's
standing, closest-to-the-pin payouts, handicap allowances — lives in pure
modules with no React and no Supabase in them: `src/lib/wolf.ts`, `teams.ts`,
`teamChallenge.ts`, `sideGames.ts`, `roundMath.ts`.

That discipline was for testability. It pays here: the web leaderboard imports
the same functions and cannot disagree with the phone about who is winning. A
second implementation of the money would be a second truth (rule 3), and it
would be discovered in a clubhouse, in front of everyone.

So the web app is a new front end over existing logic, not a rewrite.

## Getting a field in: three doors, one destination

All three end at the same place — an **unclaimed player row in `round_players`**,
exactly what the organizer creates today by typing a mobile number. Nothing new
downstream: claiming, invitations and scoring all already work against that row.

**1. CSV upload.** Name, mobile, handicap, and optionally flight and email. The
mobile number is the join key, because that is what the app signs in with. It
needs to be forgiving about formats and firm about duplicates — matching against
players who already exist rather than making a second Kory. (We made four of him
in one morning; at forty players that is not a tidy-up, it is a ruined event.)

**2. QR sign-up.** A poster or an email with a code. It opens a public form —
name, mobile, handicap — and adds the same unclaimed row. No account, no app,
nothing to install; that is the point, and it is what makes a field of dozens
possible for an organizer who is not going to type forty numbers.

**3. Manual add.** As now. Someone always turns up.

### What this needs from the database

```sql
alter table rounds add column join_code text unique;   -- short, human, in the QR
```

And **one `security definer` function for anonymous registration**. Not table
access — the whole point of the lockdown was that `anon` reads and writes
nothing. A single narrow function that takes a join code plus a name and number,
and creates the unclaimed row, is the only opening, and it can rate-limit,
validate, and refuse a code that belongs to a round already started.

The same pattern the invitation path already uses, for the same reason.

## Sending the invitations — the known wall

The day-before "you're playing tomorrow, here's the app" message is the step
that makes the whole thing land, and it is the one with a real obstacle.

Twilio rejected the Sole Proprietor A2P campaign, and the workaround was moving
sign-in to **Twilio Verify** — which carries one-time passcodes *only*. It will
not carry a tournament invitation. Forty notification SMS is a bigger A2P
problem than OTP was, not a smaller one.

So the honest sequence is:

1. **Email first.** Collected at sign-up, no carrier registration, no rejection.
   Good enough to carry an install link and a round name.
2. **Push notifications** for anyone who already has the app — free, instant,
   and the right channel for "your tee time moved".
3. **SMS last**, and only behind a proper A2P campaign under a real business
   entity. Worth doing when the tournament side is real; not worth blocking on.

Recording this because it will otherwise get planned as a two-day job three
times.

## The clubhouse leaderboard

A public URL, no sign-in, updating live — the spectator view the original
prototype already drew.

It must not be a hole in the lockdown. The shape that works: a **read-only
function or view keyed by a public slug**, returning names, scores and flight
standings and nothing else. No phone numbers, no user ids, no other rounds. A
tournament leaderboard is public by nature — the numbers are pinned to a wall —
but a phone number is not, and the two live in the same tables.

Realtime already broadcasts scores to phones; the same subscription drives a
projector.

## Two decisions worth taking deliberately

**Money.** Rule 6 says the app never moves money — it tracks who owes whom.
Tournament entry fees are a different thing from side bets, and the moment the
web takes a sign-up it will be asked to take $80 with it. That is a genuine
product step (Stripe, refunds, chargebacks, an entity to bank it) and it should
be a decision, not a drift. The clean line: **entry fees may one day be collected
by a payment processor the web hands off to; side-bet money is still never moved
by us.** Rule 6 survives intact.

**Order.** The web app's entire job is populating flights. Building it before
flights exist means building it against the interim shape and then rewriting it.
So: round lifecycle → flights → web. Nothing here is urgent enough to jump that
queue, and the app being genuinely good for one group of nine is what earns the
right to sell the tournament version.
