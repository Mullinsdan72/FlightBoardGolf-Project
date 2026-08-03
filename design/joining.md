# Getting people into a round

Written after the first weekend with nine real people, where adding players and
getting everyone onto the same round was the thing that broke.

This note is the diagnosis first, then options, because the options only make
sense once it is clear which part failed.

## What is meant to happen today

1. The organizer types a name and mobile number on PLAYERS. That calls
   `add_player_to_round`, which makes an **unclaimed** player row carrying the
   number and seats it in the round.
2. The guest installs the app and signs in with that number.
3. On a cold start, `usePendingInvites` calls `my_invitations()`, which matches
   `players.phone` against `auth.users.phone`.
4. If there is a match, `(tabs)/_layout` redirects to `/invited`, and JOIN calls
   `claim_player`, seats the phone as that player, and switches to the round.

Every piece of that exists and works in isolation. The failure is in when step 4
gets to run.

## The diagnosis

### The invitation check happens once per launch, before anyone has signed in

`(tabs)/_layout` decides where to open exactly once — `moved.current` — and
that is deliberate and right (it must not haul you off SCORE mid-round). But it
also means the invitation check is a **single shot fired at app launch**.

A brand new guest is signed *out* at launch. That is not a race; it is the
guaranteed state of a first install. So:

- `userId` is null, so `my_invitations()` is never called and `invites` is `[]`
- the layout concludes there is nothing waiting, sets `moved.current = true`
- with no player and no round it sends them to `/welcome`
- they tap through to `/signin`, get the code, and on success `signin.tsx` does
  `router.replace('/')`

That last line lands them on SCORE **inside the already-mounted tabs layout**.
`moved.current` is still true. Nothing re-checks. The invitation they now
genuinely have is never looked for.

> **Signing in is the moment a phone first becomes able to see its invitations,
> and it is the one moment the app does not look.**

### Closing and reopening doesn't reliably fix it either

On the next cold start the session is restored, so the invitation *should*
appear. But the layout has this, evaluated on every render:

```tsx
if (activeRoundId === null && !myId && !hasInvites) return <Redirect href="/welcome" />;
```

A guest who has not claimed anything still has no `myId` and no round. If that
render happens before `my_invitations()` comes back — a network call, against a
local session check that is much faster — `hasInvites` is false and they are
thrown to `/welcome` again. Once there, nothing pulls them back.

This is why "force close it and open it again" worked for some people and not
others, on the same morning, with the same build. It is a race, and a
non-deterministic bug across ten phones looks exactly like an app that doesn't
work.

### There is no manual way in

`/invited` is reachable only by that one automatic redirect. If it doesn't
fire, there is no button anywhere that means "I was invited, let me in".
`/join?round=` needs a working deep link *and* is refused by RLS anyway — a
guest cannot read a round they are not yet in. So when the automatic path
missed, there was no second path.

That is the single biggest structural problem. Everything else here is a bug;
this is a missing door.

### Nobody can see whether it worked

The organizer's PLAYERS list shows the field, but not **who has actually taken
their seat**. So when someone said "I don't see anything", the only available
response was to add them again — which is how one morning produced four Korys,
three of them orphans. The duplicates were not carelessness; they were the only
feedback loop available.

### What was *not* the problem

Phone normalisation. Typed numbers and contact-picked numbers both go through
`toE164` (`src/lib/phone.ts`), stored as `+1XXXXXXXXXX`, and `my_invitations()`
strips the `+` before comparing to `auth.users.phone`. That path is correct and
was worth checking, because it is the failure that leaves no trace.

## The deeper problem with the model

Even fully repaired, the current design has the guest **passive** and the
organizer **blind**:

- The guest cannot do anything to get in. They wait for a screen to appear.
- Whether it appears depends on the organizer having typed their number
  correctly, weeks of carrier formatting notwithstanding.
- Neither party can see the state of the other.

That is survivable for a foursome and it is not going to hold for forty. The
instinct in `design/tournament-web.md` — that joining is the bottleneck at
scale, not scoring — is the same problem seen from the other end.

## Four options

### Option 1 — Repair the current path

- Re-run the invitation check when **auth state changes**, not once per launch.
  Signing in is exactly the event that makes invitations visible.
- Never let `/welcome` win against an invitation list that has not loaded. Hold
  the welcome redirect until `invitesReady`, or better, until auth has settled.
- Send a successful sign-in back through the opening decision instead of
  hard-coding `router.replace('/')`.

**Cost:** small — three files, no schema, no new screens.
**Gets you:** the deterministic failures go away.
**Doesn't get you:** the guest is still passive, the organizer still blind, and
it still depends entirely on a typed phone number.

### Option 2 — A round code, and joining becomes something you *do*

The round carries a short code. The organizer reads it out, texts it, or shows
it on screen. The guest opens the app, taps **JOIN A ROUND**, types the code,
sees the round and its field, and takes their seat — either by tapping the name
already waiting for them, or by adding themselves if there isn't one.

```sql
alter table rounds add column join_code text unique;
```

Plus two `security definer` functions, for the same reason `my_invitations()` is
one — a guest cannot read a round they are not in, so the code has to be the
credential:

- `round_by_code(code)` → the round and its roster, enough to confirm it is the
  right one before joining
- `join_round_by_code(code, player_id | name)` → claim the seat, or make one

**Cost:** medium — one column, two functions, one screen, one button.
**Gets you:**
- It works when the organizer typed the wrong number, or no number.
- It works for the man who turns up unannounced on the first tee.
- It is *active* — the guest can fix their own problem instead of waiting.
- It scales. Reading one code to twenty people is the same effort as to four.
- It is the same mechanism the tournament website will need for QR sign-up, so
  it is not throwaway work.

**Costs you:** anyone with the code can join. At a golf course that is the same
trust model as telling people the tee time, and the organizer can see and remove
anyone — but it should be a deliberate decision, not a surprise.

### Option 3 — Show the organizer who is actually in

PLAYERS gains one piece of state per row: **JOINED** or **WAITING**, read off
`players.user_id`. Plus a RESEND on a waiting row, and the round code at the top
of the screen to read out.

**Cost:** small — the data is already loaded, it just isn't shown.
**Gets you:** the feedback loop whose absence created the duplicates. This is
the cheapest genuinely valuable change on the list.

### Option 4 — Stop building the field by hand

Nobody is typed in. The organizer creates the round and shares the code;
everyone joins and enters their own name and handicap. The organizer's job
becomes drawing flights, not data entry.

Typed-in rows stay for the man who will never install the app — rule 2's
designated scorer exists precisely for him — but they stop being the *normal*
path.

**Cost:** none beyond Option 2, of which it is really a consequence.
**Gets you:** the organizer stops typing forty names, and each person's own
handicap is entered by the one person who knows it.

## What I would do

**3, then 1, then 2 — and 4 falls out of 2.**

- **Option 3 first**, because it is nearly free and it stops the failure mode
  that actually corrupted data. Even with everything else broken, an organizer
  who can see WAITING beside a name does not add that person twice.
- **Option 1 next**, because the current path should not lie. Signing in must
  re-check invitations, and `/welcome` must not beat an unloaded invite list.
  Small, and it makes the existing design behave the way it was always meant to.
- **Option 2 as the real answer.** Invitations by number stay, but demoted from
  *the mechanism* to *a convenience*. The code is the thing that always works,
  and it is the piece the tournament side needs anyway.

Worth stating plainly: **Option 1 alone is not enough.** It fixes the bugs and
leaves the design that produced them — a passive guest, a blind organizer, and
one fragile path with no alternative. The reason to do it is that it is cheap
and it stops the current build lying to people, not because it settles the
question.

### One sequencing idea worth taking

Ask for the code **before** the phone number. Typing a code shows the guest a
real round with real names on it, and *then* asks them to sign in to take their
seat. Asking for a mobile number first, from someone who has just installed an
app a friend sent them, is the highest-friction possible opening move, and at
that point the app has shown them nothing.

## ACTIVITY

The impression that ACTIVITY only shows completed rounds is worth correcting,
because what is actually happening points somewhere else.

`(tabs)/activity.tsx` lists **every** round in `rounds`, whatever its state, and
labels each NOT STARTED / IN PROGRESS / CLOSED. Two things make it read as a
history screen:

- **It looks like one.** Each card leads with a big finished-looking gross score
  and a finishing order. A draft round you set up last night renders as a card
  with a dash and "nothing posted" — visually the same object as a round from
  March, just emptier.
- **Under RLS you only see rounds you are in.** The policy is `is_round_member(id)
  or organizer_player_id in auth_player_ids()`. A round somebody else set up and
  put you in — *unclaimed* — is not visible to you at all. So the list fills up
  with your own past rounds and shows nothing of what is coming.

Both point at the same fix, which is already drafted in
`design/round-lifecycle.md`: three sections, ordered by what you care about.

```
BEING PLAYED NOW      → OPEN
NOT STARTED           → SET UP · START · DELETE
PLAYED                → VIEW
```

And ACTIVITY is the natural home for **JOIN A ROUND** — it is the screen that
answers "what am I doing today", which is exactly the question someone standing
in a car park is asking.

That makes the running order: Option 3, Option 1, `started_at` and the three
sections, then Option 2. Flights come after, and the web after that.
