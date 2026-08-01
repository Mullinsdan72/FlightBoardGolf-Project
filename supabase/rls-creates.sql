-- Flight Board — the fix for "new row violates row-level security policy"
-- on things you have only just created. Run after supabase/rls.sql.
--
-- Postgres requires a row inserted with RETURNING to pass the table's SELECT
-- policy as well as its WITH CHECK. Every create in this app is
-- `.insert(...).select('id').single()`, and the rows it creates are invisible
-- to their own creator at the instant they are made:
--
--   * a new player has no owner and belongs to no round
--   * a new round has no members yet
--
-- So both come back as a policy violation, which reads as "you are not allowed
-- to do this" when what actually happened is "you are not allowed to look at
-- the thing you just did". Two different problems with one message.
--
-- Safe to re-run.

-- ------------------------------------------------------------------ rounds
--
-- The organizer can read their own round. This is right on its own terms —
-- you are running it — and it is also what makes creating one work, since the
-- organizer is named in the same statement that inserts it.
drop policy if exists "read rounds you are in" on rounds;
create policy "read rounds you are in" on rounds
  for select to authenticated
  using (is_round_member(id) or organizer_player_id in (select auth_player_ids()));

-- ----------------------------------------------------------------- players
--
-- Creating a player cannot be fixed with a policy: at the moment of insert
-- there is nothing about the row that ties it to you. Both paths therefore go
-- through `security definer` functions, which is the same reason `claim_player`
-- is one — the row's relationship to you is established *by* the call, so the
-- call has to be the thing that is trusted.

/**
 * Make your own player row, already claimed.
 *
 * The first-run path. You are creating yourself, so there is no window in which
 * the row exists unowned and could be taken by somebody else.
 */
create or replace function create_my_player(p_name text, p_handicap int default 0)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  made players;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a player.';
  end if;
  insert into players (name, handicap, user_id)
       values (p_name, greatest(0, least(54, coalesce(p_handicap, 0))), auth.uid())
    returning * into made;
  return made;
end;
$$;

/**
 * Put somebody else in a round you organize.
 *
 * Unclaimed on purpose — this is the organizer typing Steve in before Steve has
 * ever opened the app, which is the normal way a field gets built. Steve claims
 * it later, or the organizer keeps his card under rule 2.
 *
 * Seats them in the round in the same call, which is also what makes the row
 * readable afterwards: once they are in the round, everyone in it can see them.
 */
create or replace function add_player_to_round(
  p_round_id uuid,
  p_name text,
  p_handicap int default 0,
  p_phone text default null
)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  made players;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding players.';
  end if;
  if not is_round_organizer(p_round_id) then
    raise exception 'Only whoever is running this round can add players to it.';
  end if;
  insert into players (name, handicap, phone)
       values (p_name, greatest(0, least(54, coalesce(p_handicap, 0))), p_phone)
    returning * into made;
  insert into round_players (round_id, player_id) values (p_round_id, made.id)
    on conflict do nothing;
  return made;
end;
$$;

grant execute on function create_my_player(text, int) to authenticated;
grant execute on function add_player_to_round(uuid, text, int, text) to authenticated;

select 'rounds policy and create functions installed' as done;
