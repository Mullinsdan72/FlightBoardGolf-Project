-- Flight Board — joining a round with a code.
--
-- Run AFTER supabase/rls.sql and supabase/rls-creates.sql. Safe to re-run.
--
-- Why this exists, in one paragraph. Joining was a *push*: the organizer typed
-- your mobile number, and your phone matched it against the number you signed
-- in with. Every link in that chain is invisible to both parties — the guest
-- cannot do anything but wait for a screen to appear, the organizer cannot see
-- whether it did, and when it doesn't there is no second path. Nine people
-- spent a morning on it. A code turns joining into something a person can *do*,
-- and it is the same mechanism a tournament sign-up sheet or a QR poster needs
-- (see design/tournament-web.md), so none of it is throwaway.
--
-- Everything below is `security definer` for the reason `my_invitations()` is:
-- under RLS a guest cannot read a round they are not yet in, and that is every
-- round they might want to join. **The code is the credential.** So these
-- functions are the only opening, and each one checks the code itself.

alter table rounds add column if not exists join_code text;

-- Unique among the rounds that have one. A partial index rather than a unique
-- constraint, because every existing round has a null here and nulls must not
-- collide with each other.
create unique index if not exists rounds_join_code_key
  on rounds (join_code) where join_code is not null;

-- ------------------------------------------------------------------ the code
--
-- Crockford's base32: no I, L, O or U. The first three are what people confuse
-- with 1 and 0; U is left out so five random characters cannot spell something
-- unfortunate. Deliberately the same alphabet as `src/lib/joinCode.ts` — the
-- database mints these and the app validates them, so a character allowed in one
-- and not the other is a code that exists and can never be typed in.
create or replace function new_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i int;
begin
  -- Ten attempts is far more than enough at 33.5 million codes and a field of
  -- tens; it exists so a collision can never spin.
  for attempt in 1..10 loop
    candidate := '';
    for i in 1..5 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from rounds r where r.join_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Could not generate a unique join code.';
end;
$$;

/**
 * The round's code, minted on first ask.
 *
 * The organizer's, because handing out the way into a round is running it. Kept
 * rather than regenerated, so a code read out to a group stays the code.
 */
create or replace function ensure_join_code(p_round_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if not is_round_organizer(p_round_id) then
    raise exception 'Only whoever is running this round can give out its code.';
  end if;
  select r.join_code into code from rounds r where r.id = p_round_id;
  if code is not null then
    return code;
  end if;
  code := new_join_code();
  update rounds set join_code = code where id = p_round_id;
  return code;
end;
$$;

-- --------------------------------------------------------------- the lookup
--
-- Deliberately `authenticated` only, not `anon`.
--
-- Showing somebody the round before asking for their phone number is the
-- friendlier funnel and it is what the app should eventually do — but an
-- unauthenticated lookup is an enumeration surface with no rate limiting in
-- front of it, and what it returns is a list of real people's names. Worth
-- doing properly later, behind a limiter, rather than casually now.

/**
 * "Is this the right round?" — enough to confirm before joining, no more.
 *
 * No phone numbers. The code buys you sight of the event, not of the field's
 * contact details.
 */
create or replace function round_by_code(p_code text)
returns table (
  round_id uuid,
  round_name text,
  course_name text,
  played_on date,
  field_size int,
  organizer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    coalesce(r.name, ''),
    coalesce(r.course_name, ''),
    r.played_on,
    (select count(*)::int from round_players rp where rp.round_id = r.id),
    (select p.name from players p where p.id = r.organizer_player_id)
  from rounds r
  where auth.uid() is not null
    and r.join_code is not null
    and upper(p_code) = r.join_code;
$$;

/**
 * The seats in that round, so a guest can find their own name.
 *
 * `taken` rather than hiding claimed rows: a field of nine that shows four names
 * looks broken, and the organizer "fixes" it by adding a duplicate — the exact
 * mess this whole change exists to end. Shown and refused, never hidden.
 *
 * `mine` marks a seat this account already holds, which is how the app knows to
 * say "you are already in" instead of offering it as a seat to take.
 */
create or replace function seats_by_code(p_code text)
returns table (
  player_id uuid,
  player_name text,
  handicap int,
  taken boolean,
  mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.handicap,
    p.user_id is not null,
    p.user_id is not null and p.user_id = auth.uid()
  from rounds r
  join round_players rp on rp.round_id = r.id
  join players p on p.id = rp.player_id
  where auth.uid() is not null
    and r.join_code is not null
    and upper(p_code) = r.join_code
  order by p.user_id is not null, p.name;
$$;

-- ---------------------------------------------------------------- the taking
--
/**
 * Take a seat in the round this code opens.
 *
 * Two ways in, and the difference matters:
 *
 *   - `p_player_id` — the seat the organizer already made for you. Claimed, not
 *     created, so the handicap and the name they typed are kept and no duplicate
 *     appears. Refused if somebody else already holds it: a claimed row is
 *     never takeable, at any layer, because taking one hands you their
 *     scorecard.
 *   - `p_name` — nobody made you a seat, or none of the names is you. Creates a
 *     player already claimed by you, so there is no window in which it sits
 *     unowned for somebody else to take.
 *
 * Idempotent on purpose: if this account already holds a seat in the round, that
 * seat comes back. Tapping JOIN twice is not an error and must never make a
 * second you.
 */
create or replace function join_round_by_code(
  p_code text,
  p_player_id uuid default null,
  p_name text default null,
  p_handicap int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round uuid;
  existing uuid;
  seat players;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a round.';
  end if;

  select r.id into target_round
    from rounds r
   where r.join_code is not null
     and upper(p_code) = r.join_code;
  if target_round is null then
    raise exception 'That code does not match a round.';
  end if;

  -- Already in. Hand back the seat rather than making a second one.
  select p.id into existing
    from round_players rp
    join players p on p.id = rp.player_id
   where rp.round_id = target_round
     and p.user_id = auth.uid()
   limit 1;
  if existing is not null then
    return existing;
  end if;

  if p_player_id is not null then
    select p.* into seat
      from round_players rp
      join players p on p.id = rp.player_id
     where rp.round_id = target_round
       and p.id = p_player_id;
    if seat.id is null then
      raise exception 'That seat is not in this round.';
    end if;
    if seat.user_id is not null then
      raise exception 'Somebody has already taken that seat.';
    end if;
    update players set user_id = auth.uid() where id = seat.id;
    return seat.id;
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Pick your name, or type one in.';
  end if;
  insert into players (name, handicap, user_id)
       values (btrim(p_name), greatest(0, least(54, coalesce(p_handicap, 0))), auth.uid())
    returning * into seat;
  insert into round_players (round_id, player_id) values (target_round, seat.id)
    on conflict do nothing;
  return seat.id;
end;
$$;

grant execute on function ensure_join_code(uuid) to authenticated;
grant execute on function round_by_code(text) to authenticated;
grant execute on function seats_by_code(text) to authenticated;
grant execute on function join_round_by_code(text, uuid, text, int) to authenticated;

select 'join codes installed' as done;
