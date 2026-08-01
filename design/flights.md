# Flights: what has to change to run a tournament

Written after the first real outing, from the instruction that settles the app's
purpose: *multiple flights, same rules for everyone, Wolf inside each flight
separately but seen by all.*

`CLAUDE.md`'s "What this is for" states the shape. This note is the survey work
— what is actually in the way, in the order it will hurt.

## The blocker, and it is a hard one

Three of the four game tables use `round_id` as their **primary key**:

```sql
wolf_games      round_id uuid primary key
team_games      round_id uuid primary key
team_challenge  round_id uuid primary key
wolf_holes      primary key (round_id, hole)
```

One Wolf game per round. Not "awkward with two flights" — impossible. Two flights
playing hole 10 both want the row `(round_id, 10)` in `wolf_holes`, and the
second one overwrites the first's wolf and partner. That is why tomorrow's two
Wolf flights had to be set up as two separate rounds, and why they landed on two
separate leaderboards, which is precisely the thing Dan does not want.

`hole_games` is the exception — `id` primary key, `round_id` a plain column — so
closest-to-the-pin and longest drive are already many-per-round. They may well
want to stay round-wide anyway; longest drive across a whole field is a real bet.

## The shape

```
round   the event: one morning, one course, one tee, one set of holes,
        one scoring mode. Same rules for everyone.
  └ flight   a group inside it: who plays with whom, and whose money is whose.
      └ player   owns their score, their card, their signature. Unchanged.
```

**Every round has at least one flight**, created with it, holding the whole
field. No `flight_id is null` meaning "the whole round" — that is a special case
every query would then have to remember, and the one it forgets is the one that
pays the wrong man. A foursome is a round with one flight, and every code path
stays the same as the forty-player version.

### What belongs where

| Round | Flight |
| --- | --- |
| Course, tee, holes in play | Wolf: the rotation and the per-hole decisions |
| Scoring mode (gross/net/lowman) | Team membership and results |
| **A game's terms** — the stake, the multiplier, the wager | Settle-up — who owes whom |
| The field, and who organises it | Who plays with whom |
| Start and finish | |
| The leaderboard everyone reads | |

The dividing line is money. If two players could end the morning owing each
other something, they are in the same flight. If they are only compared, they
are in the same round.

### Terms are the round's, play is the flight's

This is the cut that matters, and it is finer than "games move to flights".

Each flight plays its own game of Wolf — its own rotation, its own wolf on each
hole, its own ledger. But it plays it **on the round's terms**. $5 a hole and a
triple for going alone is the tournament's rule, set once, the same for
everybody. So:

- `wolf_games` keeps `round_id` as its key for `enabled`, `stake`,
  `lone_multiplier` and `reshuffle_each_round`. One setup for the whole morning.
- `player_order` moves out to the flight — a rotation is an ordering of the
  people in *your* group, and there is no round-wide rotation across forty.
- `wolf_holes` re-keys from `(round_id, hole)` to `(flight_id, hole)`. That is
  the collision, and it is the only structural break Wolf needs.
- `team_games` and `team_challenge` split the same way: terms on the round,
  `team_members` gains a `flight_id` and `team_index` becomes per flight.

Setting the stake ten times would be its own kind of unusable, and worse, it
would let two flights end the morning playing different bets by accident —
which is exactly the argument the app exists to prevent.

Per-flight overrides are deliberately not built. If somebody genuinely wants the
low flight playing for less, that is a real request and a small one to add later;
guessing at it now costs a settings screen per flight forever.

## Migration

Cheaper than it looks, because every existing round becomes a one-flight round
and nothing needs re-entering.

```sql
create table flights (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  name text not null default '',          -- 'Flight 1', or 'The back nine crew'
  captain_player_id uuid references players(id) on delete set null,
  sort_order int not null default 0
);

alter table round_players add column flight_id uuid references flights(id) on delete set null;
```

Then the *play* tables re-key to the flight while the *terms* stay on the round,
per the split above: `wolf_holes` and `team_members` gain `flight_id`,
`wolf_games.player_order` moves to `flights`. Backfill gives each existing round
one flight, puts its whole field in it, and repoints its per-hole rows at it.
Nothing played is lost and nothing is re-keyed by hand.

The order matters: **`design/round-lifecycle.md` first.** Assigning flights is
setup, and setup needs a draft state to happen in. Building flights before
`started_at` means drawing the groups inside a round that is already counting.

## What it changes above the database

**Scoring permission.** `may_score_for` today says: your own rows, or anything
unclaimed if you organise the round. At forty players the organizer scoring for
the whole field is not a permission, it is a chore. The flight captain is the
natural holder — they are standing there. So it becomes: your own rows, or an
unclaimed row in a flight you captain, or (still) anything unclaimed if you
organise the round. `src/lib/claim.ts` and `supabase/rls.sql` have to be changed
together, as they already are.

**The leaderboard.** Whole field by default, groupable by flight, with each
flight's own standing and each flight's money reachable in a tap. "Seen by all"
is the appeal; it also follows the existing rule that read access is wider than
write.

**Joining.** This is the quiet one. The organizer typing forty mobile numbers is
worse than the scoring chore. A round-level join code — you enter it, you land in
the round, you pick or are assigned a flight — is what makes a field of dozens
possible at all. Invitations by number stay right for a foursome and stop
scaling somewhere around a dozen.

**Setup.** The organizer draws the flights the way teams are drawn now. Auto-draw
by handicap into flights of four is the obvious default, and the thing a
tournament organizer actually expects.

## Two things that get easier

**Scramble.** Still unbuilt because it needs one score per group instead of one
per player. Once flights exist, "per group" has a name and a row: a scramble card
belongs to the flight. The change to score entry is the same either way, but it
stops being a fifth concept.

**"One live round at a time."** The lifecycle note argues for the narrower rule
*a player may be in at most one live round* only because two flights are two
rounds today. With flights inside a round, the broad rule is just true, and the
overlap check becomes a sentence nobody ever sees.

## What this note does not decide

- Whether CTP and longest drive are round-wide or per flight. Probably a per-game
  choice, defaulting to round-wide.
- Cross-flight bets — a skins pot over the whole field. Deliberately out of scope;
  the money rule above is worth keeping simple until somebody asks.
- Flight-level handicap allowances. Same rules for everyone says no, for now.
