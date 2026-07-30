-- Flight Board — read this BEFORE running rls.sql.
--
-- Strict policies make everything you don't own invisible. That is the point,
-- and it is also how a round full of unclaimed players disappears from every
-- phone at once. This file changes nothing; it tells you what the lockdown
-- would do to the data you actually have.
--
-- Run it in the SQL editor and read the four results.

-- 1. Accounts. Zero here means nobody has signed in, and running rls.sql would
--    hide every round from everybody, including you.
select 'accounts signed up' as what, count(*)::text as value from auth.users

union all

-- 2. Claimed vs unclaimed player rows. Unclaimed is normal — an organizer types
--    a name in long before that person opens the app — but an unclaimed row can
--    no longer post its own scores once the lockdown is on. Somebody has to keep
--    that card, and after rls.sql that somebody is the round's organizer.
select 'player rows claimed', count(*) filter (where user_id is not null)::text from players

union all

select 'player rows unclaimed', count(*) filter (where user_id is null)::text from players

union all

-- 3. THE ONE THAT MATTERS. A round with no claimed member becomes invisible to
--    everyone the moment policies go live: not deleted, not recoverable from
--    inside the app, just gone from every screen until somebody claims a seat
--    in it. This must read 0 before you run rls.sql.
select 'ROUNDS THAT WOULD VANISH', count(*)::text
  from rounds r
 where not exists (
   select 1
     from round_players rp
     join players p on p.id = rp.player_id
    where rp.round_id = r.id
      and p.user_id is not null
 );

-- 4. Name the rounds at risk, so you can go and claim a seat in each one rather
--    than guessing which is which.
select r.name,
       r.played_on,
       count(rp.player_id) as players_in_round,
       count(p.user_id) as claimed_players
  from rounds r
  left join round_players rp on rp.round_id = r.id
  left join players p on p.id = rp.player_id and p.user_id is not null
 group by r.id, r.name, r.played_on
 order by claimed_players asc, r.played_on desc nulls last;
