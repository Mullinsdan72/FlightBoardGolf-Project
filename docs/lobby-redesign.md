# The lobby: restructuring how a round gets started

Brief from Dan, 30 July 2026, after using the app to set a round up and finding
it clunky. Reference points are Arccos screenshots, which he likes for the shape
of the setup screen rather than for its features or its dark styling.

**Status: agreed, not built.** Written down so it survives the conversation.

## The idea underneath it

**Two tab bars, not one.**

Before a round exists you are in a *lobby*. Once you are in a round, the scoring
tabs take over. Flight Board today only has the second one, which is why creating
a round feels like something you do inside an app that already expects you to be
scoring — and why `/rounds`, `/welcome` and `/setup` all sit awkwardly outside
the tabs.

## The lobby — three tabs, shown only when no round is started or joined

| Tab | Holds |
| --- | --- |
| **Start Round** | the whole setup, one screen. Opens here by default. |
| **Activity** | past rounds (absorbs `/rounds`) |
| **Player** | your name, handicap, phone, sign out, legal |

## Start Round — one screen, top to bottom

1. **Course header** — name, location, hole count, ♥ favourite. The current pick,
   large.
2. **Search** — box directly underneath, for anything not already saved.
3. **Six tiles**, two rows of three. Each shows its current value; tapping opens
   a bottom sheet.
4. **A big START ROUND button.**

| Tile | Reads | Sheet offers |
| --- | --- | --- |
| WHEN | Today | Today / Tomorrow / pick a date |
| TEE BOX | Blue · 6433 | every tee, name + yardage |
| HOLES | All 18 | Front 9 / Back 9 / All 18 |
| PLAYERS | 4 added | the roster |
| TEAMS | Net · 2 teams *or* Not playing | the draw |
| GAMES | Wolf · CTP *or* None | side games |

**No start hole.** Discussed and dropped — the HOLES tile covers what this group
actually does, and a real starting hole would change what "thru 6" means and
which segment a back-nine re-draw applies to. Not free, not wanted.

## The sheet pattern

Copied from Arccos as *behaviour*, not styling — Flight Board stays light,
square-cornered, Archivo.

- Rises from the bottom; the page stays visible behind it.
- Titled, so it says what it is for ("Select Tee").
- One big thumb-sized row per option.
- An "Other" escape only where an uncommon case genuinely exists.
- Cancel gapped away from the choices so it cannot be mis-tapped.
- **No Save.** Tap a value, the sheet closes, the tile shows it. The tile *is*
  the state — which is exactly the trap that made USE THESE TEAMS necessary.

## What this replaces

`/setup`'s five-step run-through. It was built to Dan's earlier brief for "a
logical step by step order and flow", and having used it he has changed his mind:
one screen you can scan beats five you have to walk. The tile grid keeps the
guidance — a tile with nothing set is visibly empty — without the marching.

`SETUP_ORDER`, `STEP_ROUTE`, `stepAfter`/`stepBefore` and `SetupBar` all go, or
shrink to whatever the tiles need.

## Activity

A card per round, absorbing `/rounds`:

```
Gladstan GC                            30 Jul 2026
Saturday round

84   +12    18 holes    net 72

1  Mike      78   +6
2  Dan       84  +12   <- you
3  Steve     91  +19
4  Rob       94  +22

Wolf, closest to the pin        you won $12

[ CARD ]  [ BOARD ]  [ MONEY ]  [ ... ]
```

Your score big at the top, the full finishing order under it, and what the round
settled at. Arccos shows FWY/GIR/UP&DN/PUTTS there; we have no shot tracking and
should not pretend otherwise — the money is our equivalent and is more
interesting.

## Open questions

- **Should gross / net / off-the-low-man become a round-level tile** governing
  the leaderboard, rather than living inside TEAMS where it only affects team
  standings? More honest than "net" meaning two different things. Bigger change
  than it looks, and it touches money.
- **Handicap Index instead of a typed integer.** We already store slope and
  rating per tee, so `Index x (Slope / 113) + (Rating - Par)` would give a real
  course handicap per tee. More correct, more work.
  - **If we do this, tees can no longer be collapsed by name.** Gladstan's men's
    and women's Gold share a yardage but not a rating, so merging them would
    quietly hand somebody the wrong stroke count. They would need distinguishing
    by rating (`5295 yds · 70.1 / 124`) rather than by gender symbol — which is
    both more useful and closer to what Dan asked for.
  - Without it, collapsing same-named tees is safe, because nothing we compute
    reads rating or slope.

## Not possible: connecting a USGA/GHIN handicap

Arccos has a "Connect USGA HDCP ID" flow. GHIN data is licensed through the USGA
and the allied golf associations, and Arccos is an official partner — there is no
public API to call. This is a partnership, not an integration, and should be
planned around rather than attempted. Storing a GHIN number as a display-only
reference is fine; fetching an index by it is not.
