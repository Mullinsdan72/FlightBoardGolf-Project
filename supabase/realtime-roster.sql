-- Flight Board — make the roster live.
--
-- Run this in the SQL editor. Safe to re-run, changes no data, touches no
-- policies. **Do not run schema.sql instead**: it carries the same change, but
-- re-running it also recreates the permissive `anon full access` policies and
-- silently undoes the whole RLS lockdown.
--
-- Why this was needed. Supabase only broadcasts changes for tables in the
-- `supabase_realtime` publication, and the original list covered scores, rounds,
-- the card and every side-game table — everything except the two tables that say
-- **who is playing**. So `round_players` and `players` changed in silence.
--
-- It went unnoticed for as long as the only way into a round was the organizer
-- typing you in, because the phone doing the typing refetched its own roster
-- immediately. The moment somebody could join from *their* phone, the organizer's
-- leaderboard stopped agreeing with the round: the guest saw the whole field, and
-- the organizer saw a field without the guest in it, and had no reason to believe
-- joining had worked at all. That is the same blindness that produced duplicate
-- players, arriving by a different door.
--
-- Two tables, because joining is two different writes:
--
--   * `round_players` — a seat that did not exist before (joining by code)
--   * `players`       — somebody claiming a seat that already existed (accepting
--                       an invitation), which changes no membership row at all
--
-- Watching only the first would miss every invitation ever accepted.

do $$
declare t text;
begin
  for t in select unnest(array['round_players', 'players']) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- What is live now. Expect round_players and players to both be listed.
select tablename as live_tables
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and schemaname = 'public'
   and tablename in ('round_players', 'players', 'scores')
 order by tablename;
