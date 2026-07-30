-- Flight Board — the lockdown. Step three of three.
--
--   1. supabase/auth.sql          — players.user_id, claim_player()
--   2. everyone signs in and claims their player row
--   3. THIS FILE
--
-- Run supabase/rls-preflight.sql first and make sure "ROUNDS THAT WOULD VANISH"
-- reads 0. A round with no claimed member is invisible to everyone the moment
-- these policies are live — not deleted, but unreachable from inside the app,
-- which looks identical from a phone.
--
-- supabase/rls-rollback.sql puts the permissive policies back in one paste.
-- Have it open in another tab.
--
-- Safe to re-run: every policy is dropped before it is created.

-- ---------------------------------------------------------------- helpers
--
-- All security definer, and that is load-bearing rather than convenient. A
-- policy on `rounds` that queries `round_players` would have `round_players`'
-- own policy evaluated inside it, which queries `rounds`, and Postgres refuses
-- the recursion. Running these as the owner breaks the loop.
--
-- `stable` lets the planner call them once per statement instead of per row,
-- which is the difference between a leaderboard that loads and one that doesn't.

/** The player rows this account owns. Empty when signed out. */
create or replace function auth_player_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from players where user_id = auth.uid() and auth.uid() is not null;
$$;

/** Whether you are in this round — the basis of every read. */
create or replace function is_round_member(rid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from round_players rp
      join players p on p.id = rp.player_id
     where rp.round_id = rid
       and p.user_id = auth.uid()
       and auth.uid() is not null
  );
$$;

/** Whether you run this round — the basis of every term-setting write. */
create or replace function is_round_organizer(rid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from rounds r
      join players p on p.id = r.organizer_player_id
     where r.id = rid
       and p.user_id = auth.uid()
       and auth.uid() is not null
  );
$$;

/**
 * Whether you may keep this player's card.
 *
 * Your own, always. Otherwise only an *unclaimed* row in a round you organize —
 * because somebody has to enter scores for the friend who never installed the
 * app, and with no owner there is nobody else to do it. The moment that person
 * claims their row, this stops being true and their scores become theirs alone.
 *
 * This is the strict reading of rule 2. Widening it to any member of the round
 * is a one-line change if keeping a mate's card turns out to matter more than
 * the guarantee.
 */
create or replace function may_score_for(rid uuid, pid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    pid in (select auth_player_ids())
    or (
      is_round_organizer(rid)
      and exists (select 1 from players p where p.id = pid and p.user_id is null)
    );
$$;

grant execute on function auth_player_ids() to authenticated;
grant execute on function is_round_member(uuid) to authenticated;
grant execute on function is_round_organizer(uuid) to authenticated;
grant execute on function may_score_for(uuid, uuid) to authenticated;

-- Everything below is for signed-in users only. Dropping the old policies is
-- what actually closes the door — they granted `for all using (true)` to anon.
do $$
declare t text;
begin
  foreach t in array array[
    'players','rounds','round_holes','round_players','scores','signoffs',
    'courses','course_tees','favorite_courses','wolf_games','wolf_holes',
    'team_games','team_members','team_challenge','hole_games','hole_game_winners'
  ]
  loop
    execute format('drop policy if exists "anon full access" on %I', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- players
--
-- You can see a player if you share a round with them. Not "every signed-in
-- user can list every player" — that would hand the whole membership of the app
-- to anyone who registered.
drop policy if exists "players readable to people in the same round" on players;
create policy "players readable to people in the same round" on players
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from round_players rp
       where rp.player_id = players.id
         and is_round_member(rp.round_id)
    )
  );

-- Adding a player is how a round gets a field, and how you appear in your own.
drop policy if exists "signed in users may add players" on players;
create policy "signed in users may add players" on players
  for insert to authenticated with check (true);

-- Editing a name or handicap: your own, or an unclaimed row in a round you run.
-- `user_id` itself is NOT writable here — claiming goes through claim_player(),
-- because a writable owner column is "claim anybody", including the organizer.
drop policy if exists "edit your own player or an unclaimed one you organize" on players;
create policy "edit your own player or an unclaimed one you organize" on players
  for update to authenticated
  using (
    user_id = auth.uid()
    or (
      user_id is null
      and exists (
        select 1 from round_players rp
         where rp.player_id = players.id
           and is_round_organizer(rp.round_id)
      )
    )
  )
  with check (
    user_id = auth.uid()
    or user_id is null
  );

-- ----------------------------------------------------------------- rounds
drop policy if exists "read rounds you are in" on rounds;
create policy "read rounds you are in" on rounds
  for select to authenticated using (is_round_member(id));

-- Creating a round names you as its organizer. Naming somebody else would let
-- you hand out a round you then cannot administer.
drop policy if exists "create a round you organize" on rounds;
create policy "create a round you organize" on rounds
  for insert to authenticated
  with check (organizer_player_id in (select auth_player_ids()));

drop policy if exists "the organizer runs the round" on rounds;
create policy "the organizer runs the round" on rounds
  for update to authenticated using (is_round_organizer(id)) with check (true);

drop policy if exists "the organizer may delete the round" on rounds;
create policy "the organizer may delete the round" on rounds
  for delete to authenticated using (is_round_organizer(id));

-- ------------------------------------------------------------ round_holes
drop policy if exists "read the card of a round you are in" on round_holes;
create policy "read the card of a round you are in" on round_holes
  for select to authenticated using (is_round_member(round_id));

drop policy if exists "the organizer sets the card" on round_holes;
create policy "the organizer sets the card" on round_holes
  for all to authenticated
  using (is_round_organizer(round_id)) with check (is_round_organizer(round_id));

-- ---------------------------------------------------------- round_players
drop policy if exists "read the field of a round you are in" on round_players;
create policy "read the field of a round you are in" on round_players
  for select to authenticated using (is_round_member(round_id));

-- Two ways in: the organizer adds you, or you join yourself from an invite link.
drop policy if exists "the organizer seats people, or you seat yourself" on round_players;
create policy "the organizer seats people, or you seat yourself" on round_players
  for insert to authenticated
  with check (is_round_organizer(round_id) or player_id in (select auth_player_ids()));

drop policy if exists "the organizer removes people, or you leave" on round_players;
create policy "the organizer removes people, or you leave" on round_players
  for delete to authenticated
  using (is_round_organizer(round_id) or player_id in (select auth_player_ids()));

-- ----------------------------------------------------------------- scores
--
-- Read wide, write narrow. Everyone in a round sees every score in it — that is
-- the entire point of a live leaderboard — but you post only your own.
drop policy if exists "read every score in a round you are in" on scores;
create policy "read every score in a round you are in" on scores
  for select to authenticated using (is_round_member(round_id));

drop policy if exists "post your own score" on scores;
create policy "post your own score" on scores
  for insert to authenticated with check (may_score_for(round_id, player_id));

drop policy if exists "correct your own score" on scores;
create policy "correct your own score" on scores
  for update to authenticated
  using (may_score_for(round_id, player_id)) with check (may_score_for(round_id, player_id));

drop policy if exists "delete your own score" on scores;
create policy "delete your own score" on scores
  for delete to authenticated using (may_score_for(round_id, player_id));

-- --------------------------------------------------------------- signoffs
--
-- Rule 8, exactly as written: a player signs only their own card, and the
-- organizer can reopen ANY card. So insert is yours alone; delete is yours or
-- the organizer's.
drop policy if exists "see who has signed" on signoffs;
create policy "see who has signed" on signoffs
  for select to authenticated using (is_round_member(round_id));

drop policy if exists "sign only your own card" on signoffs;
create policy "sign only your own card" on signoffs
  for insert to authenticated
  with check (player_id in (select auth_player_ids()));

drop policy if exists "reopen your own card, or any as organizer" on signoffs;
create policy "reopen your own card, or any as organizer" on signoffs
  for delete to authenticated
  using (player_id in (select auth_player_ids()) or is_round_organizer(round_id));

-- ------------------------------------------------- courses and course_tees
--
-- Deliberately shared. A cached course is not anybody's private data, and it is
-- the whole reason a lookup costs one of 300 a day rather than one per round.
drop policy if exists "any signed in user may read courses" on courses;
create policy "any signed in user may read courses" on courses
  for select to authenticated using (true);

drop policy if exists "any signed in user may cache a course" on courses;
create policy "any signed in user may cache a course" on courses
  for insert to authenticated with check (true);

drop policy if exists "any signed in user may refresh a course" on courses;
create policy "any signed in user may refresh a course" on courses
  for update to authenticated using (true) with check (true);

drop policy if exists "any signed in user may read tees" on course_tees;
create policy "any signed in user may read tees" on course_tees
  for select to authenticated using (true);

drop policy if exists "any signed in user may cache tees" on course_tees;
create policy "any signed in user may cache tees" on course_tees
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------- favorite_courses
-- Yours alone, in both directions.
drop policy if exists "your favourites are yours" on favorite_courses;
create policy "your favourites are yours" on favorite_courses
  for all to authenticated
  using (player_id in (select auth_player_ids()))
  with check (player_id in (select auth_player_ids()));

-- ------------------------------------------------------------- side games
--
-- The three-tier model, in policy form. Terms are the organizer's; recording
-- what happened on a hole is any player's.
--
-- One honest limit: "the wolf's own, per hole" is not enforced here. Checking
-- that the writer holds the wolf on that hole means resolving the rotation in
-- SQL, and the rotation is deliberately app-side so a reshuffle can't rewrite
-- played holes. The app gates it; the database gates it to the round.
do $$
declare t text;
begin
  -- Terms: read by anyone in the round (you are owed sight of a stake you are
  -- playing for), written only by the organizer.
  foreach t in array array['wolf_games','team_games','team_challenge','hole_games']
  loop
    execute format('drop policy if exists "read the terms" on %I', t);
    execute format(
      'create policy "read the terms" on %I for select to authenticated using (is_round_member(round_id))', t);
    execute format('drop policy if exists "the organizer sets the terms" on %I', t);
    execute format(
      'create policy "the organizer sets the terms" on %I for all to authenticated '
      'using (is_round_organizer(round_id)) with check (is_round_organizer(round_id))', t);
  end loop;

  -- What happened: any player in the round may record it, same as posting a score.
  foreach t in array array['wolf_holes','hole_game_winners']
  loop
    execute format('drop policy if exists "read what happened" on %I', t);
    execute format(
      'create policy "read what happened" on %I for select to authenticated using (is_round_member(round_id))', t);
    execute format('drop policy if exists "any player records what happened" on %I', t);
    execute format(
      'create policy "any player records what happened" on %I for all to authenticated '
      'using (is_round_member(round_id)) with check (is_round_member(round_id))', t);
  end loop;
end $$;

-- Teams are drawn by the organizer; everyone in the round sees the draw.
drop policy if exists "read the draw" on team_members;
create policy "read the draw" on team_members
  for select to authenticated using (is_round_member(round_id));

drop policy if exists "the organizer draws the teams" on team_members;
create policy "the organizer draws the teams" on team_members
  for all to authenticated
  using (is_round_organizer(round_id)) with check (is_round_organizer(round_id));

-- ------------------------------------------------------------------ check
-- Every table should now report rowsecurity = true and at least one policy.
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
 group by c.relname, c.relrowsecurity
 order by c.relname;
