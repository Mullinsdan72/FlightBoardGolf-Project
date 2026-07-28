-- Flight Board — Phase 1 schema: one round, one group of four, live scores.
-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query
-- -> paste this whole file -> Run.
--
-- Security note: RLS is enabled but the policies below allow anyone holding
-- the anon key to read and write everything. That is intentional for now —
-- there is no sign-in yet, so there is no identity to restrict by. Before
-- real players use this for real (Build Guide Phase 2), replace these
-- policies with ones scoped to auth.uid(), per CLAUDE.md's rule that a
-- player edits only their own score.

create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handicap int not null default 0
);

-- Idempotent: if this table already existed (created before the players
-- screen), it won't have picked up the default above.
alter table players alter column id set default gen_random_uuid();

-- A course record, cached permanently the first time it's looked up. The whole
-- point of caching: a lookup costs one of the 300 daily API calls, so a course
-- is fetched once ever and then works offline forever. `raw` keeps the original
-- payload so a later app version can read fields this one ignores without
-- re-fetching.
create table if not exists courses (
  id text primary key,                        -- 'gca:1234' from the API, or 'manual:<uuid>'
  source text not null default 'golfcourseapi', -- 'golfcourseapi' | 'manual'
  club_name text not null default '',
  course_name text not null,
  location text not null default '',
  raw jsonb,
  fetched_at timestamptz not null default now()
);

-- One row per tee set. `holes` is the scorecard for that tee:
-- [{"hole":1,"par":4,"yards":372,"handicap":9}, ...] — always read as a unit,
-- so it doesn't earn its own table.
create table if not exists course_tees (
  course_id text not null references courses(id) on delete cascade,
  tee_name text not null,
  gender text not null default 'male',        -- the API splits tees into male/female sets
  total_yards int,
  par_total int,
  course_rating numeric,
  slope_rating int,
  holes jsonb not null default '[]'::jsonb,
  primary key (course_id, tee_name, gender)
);

-- "Your courses" — starred per player. A favourited course is already in
-- `courses`, so opening it costs zero API calls.
create table if not exists favorite_courses (
  player_id uuid not null references players(id) on delete cascade,
  course_id text not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, course_id)
);

create table if not exists rounds (
  id uuid primary key,
  name text not null,
  course_name text not null,
  course_meta text not null default ''
);

-- Which course/tee the round is played on, and which holes count.
-- Added separately so databases created before the course screen pick them up.
alter table rounds add column if not exists course_id text references courses(id);
alter table rounds add column if not exists tee_name text;
alter table rounds add column if not exists tee_gender text default 'male';
alter table rounds add column if not exists holes_in_play text not null default 'all18';
-- 'all18' | 'front9' | 'back9'

-- The round's own copy of the card it is being played on. This deliberately
-- duplicates course_tees.holes, and that is not a "one number, one source"
-- violation: it's the event cache the design calls for ("saved to this event,
-- works with no signal at the tee"), and a course can be re-rated or renumbered
-- later while a round already played must keep the card it was played on.
create table if not exists round_holes (
  round_id uuid not null references rounds(id) on delete cascade,
  hole int not null,
  par int not null,
  yards int not null,
  handicap int not null,
  primary key (round_id, hole)
);

create table if not exists round_players (
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (round_id, player_id)
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  hole int not null,
  player_id uuid not null references players(id) on delete cascade,
  strokes int not null check (strokes between 1 and 15),
  posted_at timestamptz not null default now(),
  unique (round_id, hole, player_id)
);

-- Presence of a row = that player's card is signed and locked (CLAUDE.md
-- rule 8). Nothing else is stored here — gross/net/Stableford totals are
-- always recomputed from `scores`, never saved, so they can't drift.
create table if not exists signoffs (
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  signed_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

alter table players enable row level security;
alter table rounds enable row level security;
alter table round_holes enable row level security;
alter table round_players enable row level security;
alter table scores enable row level security;
alter table signoffs enable row level security;
alter table courses enable row level security;
alter table course_tees enable row level security;
alter table favorite_courses enable row level security;

drop policy if exists "anon full access" on players;
create policy "anon full access" on players for all using (true) with check (true);
drop policy if exists "anon full access" on rounds;
create policy "anon full access" on rounds for all using (true) with check (true);
drop policy if exists "anon full access" on round_holes;
create policy "anon full access" on round_holes for all using (true) with check (true);
drop policy if exists "anon full access" on round_players;
create policy "anon full access" on round_players for all using (true) with check (true);
drop policy if exists "anon full access" on scores;
create policy "anon full access" on scores for all using (true) with check (true);
drop policy if exists "anon full access" on signoffs;
create policy "anon full access" on signoffs for all using (true) with check (true);
drop policy if exists "anon full access" on courses;
create policy "anon full access" on courses for all using (true) with check (true);
drop policy if exists "anon full access" on course_tees;
create policy "anon full access" on course_tees for all using (true) with check (true);
drop policy if exists "anon full access" on favorite_courses;
create policy "anon full access" on favorite_courses for all using (true) with check (true);

-- Push changes to every subscribed phone: scores as they post, and the round's
-- card/course selection when the organizer picks a course.
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member, so
-- this checks first — the whole file is meant to be safe to re-run.
do $$
declare t text;
begin
  for t in select unnest(array['scores', 'round_holes', 'rounds']) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The round row itself must exist for anything to attach to, but it starts with
-- no course and no players. Sample data (the Gladstan card, four named golfers)
-- lives in seed.sql and is optional on purpose — it used to be in this file,
-- which meant re-running the schema silently resurrected players you had just
-- deleted.
insert into rounds (id, name, course_name, course_meta, holes_in_play) values
  ('11111111-1111-4111-8111-111111111111', 'Gladstan Grudge Match', '', '', 'all18')
on conflict (id) do nothing;
