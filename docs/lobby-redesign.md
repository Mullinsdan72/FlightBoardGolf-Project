# The lobby: restructuring how a round gets started

Brief from Dan, 30 July 2026, refined over several rounds of screenshots from
another golf app. Reference points are borrowed for **shape**, not for features
or dark styling.

**Status: agreed. Partly built.**

## Built already

- `rounds.scoring_mode` — gross / net / low man belongs to the round, and the
  leaderboard *ranks* by it rather than mentioning it.
- `/start` — one screen: course header, favourites, search, six tiles, START ROUND.
- `Sheet` and `Tile` components; no Save anywhere, the tile is the state.
- Stars on the chosen course, on cached matches and on online results.
- COURSE and PLAYERS off the tab bar; the round name on SCORE opens `/start`.

## The target shape

**Six tabs, one bar** (not the two-bar lobby idea from the first draft):

| Tab | Holds |
| --- | --- |
| SCORE | hole-by-hole entry |
| BOARD | live leaderboard |
| ACTIVITY | past rounds, one card each |
| ROUND | the setup screen — course, tiles, START ROUND |
| ME | your name, handicap, phone, who this device is |
| GAMES | only while a game is running |

`/start` becomes the **ROUND** tab.

### Tiles on ROUND

TEE BOX · HOLES · SCORING · PLAYERS · TEAMS · GAMES

### The players screen

Four ways to add somebody, in the order they should appear:

1. **From contacts** — preferred, because it captures name *and* number, so an
   invite can be sent.
2. **By phone number** — typed. Also invitable.
3. **By name only** — last resort. Added, never invited, because there is
   nowhere to send an invite to.

## Decisions taken by default (Dan didn't pick; all cheap to flip)

- **Six tabs with single-word labels, sub-labels dropped.** At four tabs the
  screenshot already showed `LEADERBO…`. Six needs the width.
- **Invites warn once before sending** while `flightboard://` resolves to
  nothing. The text still goes; the link starts working the day there's a build.
- **Picking a contact adds the player; INVITE is a separate tap** on their row.
  A mis-tapped contact must not text a stranger, and there is no undo on a sent
  message. It also lets you add four people and invite them together.

## Problems found, and what to do about them

### 1. "Start Round" is the wrong name for a tab

Mid-round, tapping a tab called START ROUND implies abandoning the round you are
in. It is really *the round's settings*, which is also where a new round starts.
**Call the tab ROUND.** The new-round action lives inside it as a button, and on
ACTIVITY as `+ NEW ROUND`.

### 2. Starting a new round while one is unfinished

Nothing currently stops a half-played round being replaced by a new one. Scores
aren't lost — rounds are separate rows — but it looks like loss.
**Confirm when the current round has posted scores and no signed cards**: "You
have a round in progress at Gladstan. Start a new one anyway?"

### 3. ACTIVITY and CARD both show past rounds

CARD grew a past-rounds switcher because CARD was the only door left after FIELD
was hidden. ACTIVITY makes that redundant.
**CARD becomes current-round only; the switcher moves to ACTIVITY.**

### 4. `/rounds` stops having a job

It lists rounds (ACTIVITY does that) and creates them (ROUND and ACTIVITY do
that). **Delete it once both are built** — not before, because it is still the
only way to delete a round.

### 5. A manually-added player cannot be invited

Correct by design, but a dead INVITE button is worse than none.
**Say why on the row**: "no number — added by hand".

### 6. The same person added twice

Contacts, then typed by hand, gives two rows and two scorecards.
**Match on phone number** using `samePhone` from `src/lib/phone.ts`, which
already normalises the five spellings; keep the existing duplicate-name warning
for people with no number.

### 7. "Course not listed?" must not show search

The manual card form currently lives inside the Course tab, which also has
search — the redundancy Dan flagged.
**Give the form its own route** with no search on it: title, tee, then par,
yardage and stroke index per hole, and one **SAVE AND USE CARD** which sets it as
the round's course and returns to ROUND.

### 8. ME needs a player before it can show anything

Identity is per-device (`myId`), and a fresh phone has none.
**ME absorbs the player picker** — it is the natural home for "who is this phone",
and it retires "NOT YOU?" from the bottom of SCORE.

### 9. Empty tabs before a round exists

SCORE, BOARD and CARD are meaningless with no course and no players.
**Keep the existing redirect**: with no round, land on ROUND. With a round but no
card, the tiles show what is missing — which is what they are for.

### 10. TEAMS is reachable twice

A TEAMS tile on ROUND, and a TEAMS row inside the players screen.
**Drop the row**; the tile is the door.

## Still not possible

Connecting a USGA/GHIN handicap. GHIN data is licensed through the USGA and the
allied golf associations, and Arccos is an official partner — there is no public
API. Storing a GHIN number as a display-only reference is fine; fetching an index
by it is not.

## Still open

- Handicaps stay a typed integer (decided). Revisiting means a real Handicap
  Index, and **tees could then no longer be collapsed by name** — men's and
  women's Gold share a yardage but not a rating.
