-- Flight Board — undo the lockdown.
--
-- Paste and run this if rls.sql locked you out of your own rounds. It restores
-- the permissive policies the app shipped with: anyone holding the anon key can
-- read and write everything.
--
-- That is genuinely insecure, and it is still the right thing to run when the
-- alternative is a group standing on a first tee unable to see their round.
-- Recover first, work out what went wrong second.
--
-- Nothing here touches your data. Policies decide who may read rows; they never
-- delete them. A round that "vanished" under strict policies is still there and
-- comes straight back.

do $$
declare t text;
begin
  foreach t in array array[
    'players','rounds','round_holes','round_players','scores','signoffs',
    'courses','course_tees','favorite_courses','wolf_games','wolf_holes',
    'team_games','team_members','team_challenge','hole_games','hole_game_winners'
  ]
  loop
    -- Drop every policy on the table, whatever it is called. Naming them
    -- individually would leave behind any policy added after this file was
    -- written, and a single surviving restrictive policy is enough to keep you
    -- locked out — which is the exact failure this file exists to undo.
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on %I;', polname, t), ' '), '')
        from pg_policy
       where polrelid = t::regclass
    );
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "anon full access" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- The helper functions are harmless on their own — they only report what
-- auth.uid() owns — so they are left in place. Re-running rls.sql is then a
-- single paste away once whatever went wrong is understood.

select c.relname as table_name,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
 group by c.relname, c.relrowsecurity
 order by c.relname;
