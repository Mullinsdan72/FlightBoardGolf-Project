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
  id uuid primary key,
  name text not null,
  handicap int not null default 0
);

create table if not exists rounds (
  id uuid primary key,
  name text not null,
  course_name text not null,
  course_meta text not null default ''
);

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

alter table players enable row level security;
alter table rounds enable row level security;
alter table round_holes enable row level security;
alter table round_players enable row level security;
alter table scores enable row level security;

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

-- Push every score change to every subscribed phone.
alter publication supabase_realtime add table scores;

-- Seed: the Gladstan Grudge Match, four players, group of one.
-- IDs match src/data/seed.ts exactly — do not change one without the other.
insert into players (id, name, handicap) values
  ('22222222-2222-4222-8222-222222222221', 'Tanner Wells', 8),
  ('22222222-2222-4222-8222-222222222222', 'Deke Farr', 2),
  ('22222222-2222-4222-8222-222222222223', 'Marcus Vela', 11),
  ('22222222-2222-4222-8222-222222222224', 'Ray Okafor', 16)
on conflict (id) do nothing;

insert into rounds (id, name, course_name, course_meta) values
  ('11111111-1111-4111-8111-111111111111', 'Gladstan Grudge Match', 'Gladstan Golf Club', 'Payson UT · Blue · par 72')
on conflict (id) do nothing;

insert into round_players (round_id, player_id)
  select '11111111-1111-4111-8111-111111111111', id from players
on conflict do nothing;

insert into round_holes (round_id, hole, par, yards, handicap) values
  ('11111111-1111-4111-8111-111111111111', 1, 4, 372, 9),
  ('11111111-1111-4111-8111-111111111111', 2, 4, 401, 3),
  ('11111111-1111-4111-8111-111111111111', 3, 3, 168, 17),
  ('11111111-1111-4111-8111-111111111111', 4, 5, 512, 7),
  ('11111111-1111-4111-8111-111111111111', 5, 4, 355, 13),
  ('11111111-1111-4111-8111-111111111111', 6, 4, 418, 1),
  ('11111111-1111-4111-8111-111111111111', 7, 3, 196, 11),
  ('11111111-1111-4111-8111-111111111111', 8, 4, 344, 15),
  ('11111111-1111-4111-8111-111111111111', 9, 5, 498, 5),
  ('11111111-1111-4111-8111-111111111111', 10, 4, 389, 8),
  ('11111111-1111-4111-8111-111111111111', 11, 3, 152, 18),
  ('11111111-1111-4111-8111-111111111111', 12, 4, 427, 2),
  ('11111111-1111-4111-8111-111111111111', 13, 5, 531, 6),
  ('11111111-1111-4111-8111-111111111111', 14, 4, 361, 12),
  ('11111111-1111-4111-8111-111111111111', 15, 4, 402, 4),
  ('11111111-1111-4111-8111-111111111111', 16, 3, 174, 16),
  ('11111111-1111-4111-8111-111111111111', 17, 4, 338, 14),
  ('11111111-1111-4111-8111-111111111111', 18, 5, 505, 10)
on conflict (round_id, hole) do nothing;
