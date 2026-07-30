-- Flight Board — phone sign-in, step one: give a player row an owner.
--
-- Run this in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- This file deliberately does NOT change any RLS policy. Turning on strict
-- policies before everyone has signed in and claimed themselves would make
-- every existing round invisible to its own players, which is a worse outage
-- than the permissive policies it replaces. The order has to be:
--
--   1. this file, plus phone sign-in in the app   <- you are here
--   2. everyone signs in once and claims their player
--   3. supabase/rls.sql, which is the actual lockdown
--
-- Step 3 is the one that can't be undone by tapping something in the app, so it
-- goes last and on purpose.

-- Who owns this player row. Null means unclaimed: an organizer typed the name
-- in and that person hasn't signed in yet. Unclaimed is the normal state for
-- most of a round's field, not an error — someone has to be able to add Steve
-- to the field before Steve has ever opened the app.
alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;

-- The number the invite went to, in E.164. Also how a signing-in player finds
-- the row somebody already created for them.
alter table players add column if not exists phone text;

create index if not exists players_user_id_idx on players(user_id);
create index if not exists players_phone_idx on players(phone) where phone is not null;

-- Deliberately NOT unique. The same person legitimately ends up with more than
-- one player row — two organizers each typing "Steve" into their own round have
-- made two rows, and neither is wrong. Claiming links them to one account
-- rather than pretending the duplication never happened.

/**
 * Take ownership of a player row.
 *
 * security definer because the caller cannot be allowed to write user_id
 * directly — that would be "claim anybody", including the organizer, which is
 * the one row that decides who can reopen a signed card.
 *
 * Claiming a row somebody else already owns fails loudly. Re-claiming your own
 * succeeds, so a retry after a dropped connection isn't an error.
 */
create or replace function claim_player(p_player_id uuid)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed players;
begin
  if auth.uid() is null then
    raise exception 'Sign in before claiming a player.';
  end if;

  update players
     set user_id = auth.uid()
   where id = p_player_id
     and (user_id is null or user_id = auth.uid())
  returning * into claimed;

  if claimed.id is null then
    raise exception 'That player already belongs to somebody else.';
  end if;

  return claimed;
end;
$$;

/**
 * The player rows this account owns, plus any unclaimed row carrying its phone
 * number — which is how somebody who was invited by text finds the seat that was
 * made for them instead of creating a second one beside it.
 */
create or replace function my_players()
returns setof players
language sql
stable
security definer
set search_path = public
as $$
  select *
    from players
   where auth.uid() is not null
     and (
       user_id = auth.uid()
       or (
         user_id is null
         and phone is not null
         -- Supabase stores auth.users.phone WITHOUT the leading '+', while the
         -- app writes proper E.164 with it. Comparing them raw silently never
         -- matches, and the failure looks exactly like "nobody invited you".
         and ltrim(players.phone, '+') = (select u.phone from auth.users u where u.id = auth.uid())
       )
     );
$$;

grant execute on function claim_player(uuid) to authenticated;
grant execute on function my_players() to authenticated;
