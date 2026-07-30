-- Flight Board — Phase 1 schema: one round, one group of four, live scores.
-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query
-- -> paste this whole file -> Run.
--
-- ⚠️  RE-RUNNING THIS FILE RESTORES THE PERMISSIVE POLICIES.
--
-- Every statement here is idempotent and safe to re-run — nothing is dropped,
-- nothing is seeded, no data can be lost. But the policy block at the bottom
-- recreates "anon full access" on every table, so once supabase/rls.sql has
-- been run, re-running this file silently undoes the lockdown.
--
-- The rule from then on: run schema.sql, then run rls.sql straight afterwards.
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

-- Rounds are created in the app now, so ids are generated server-side and each
-- round carries when it was made and the date it's played. Existing rows keep
-- working: created_at backfills to now(), played_on stays null.
alter table rounds alter column id set default gen_random_uuid();
alter table rounds alter column course_name set default '';
alter table rounds add column if not exists created_at timestamptz not null default now();
alter table rounds add column if not exists played_on date;

-- Which course/tee the round is played on, and which holes count.
-- Added separately so databases created before the course screen pick them up.
alter table rounds add column if not exists course_id text references courses(id);
alter table rounds add column if not exists tee_name text;
alter table rounds add column if not exists tee_gender text default 'male';
alter table rounds add column if not exists holes_in_play text not null default 'all18';
-- 'all18' | 'front9' | 'back9'

-- Who runs the round. Currently the only thing the role gates is reopening a
-- signed card (CLAUDE.md rule 8) — a player signs only their own card, but
-- unlocking one is the organizer's call.
--
-- Honest limitation: with no sign-in, anyone can claim this. It encodes intent
-- and stops an accidental unlock; it is not yet a permission. Enforce it in RLS
-- once there are real accounts.
alter table rounds add column if not exists organizer_player_id uuid references players(id) on delete set null;

-- Gross, net, or off the low man — for the WHOLE round, not just a team game.
--
-- This used to live only on team_games.handicap_mode, where it decided team
-- standings and nothing else: your own card was always full handicap. So "net"
-- meant two different numbers depending on which screen you were reading, which
-- is exactly the sort of thing a group argues about after a bet.
--
-- team_games.handicap_mode is left in place for rounds that predate this and is
-- no longer read. One number, one source (rule 3).
alter table rounds add column if not exists scoring_mode text not null default 'net';
alter table rounds drop constraint if exists round_scoring_mode_is_known;
alter table rounds add constraint round_scoring_mode_is_known
  check (scoring_mode in ('gross', 'net', 'lowman'));

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

-- Wolf: one row per round holding the wager terms and the rotation.
-- No money is stored anywhere. Every figure — what a hole paid, who owes whom,
-- the running totals — is recomputed from these terms plus the recorded
-- decisions plus the posted scores (src/lib/wolf.ts). Storing a total would let
-- it drift from the scores it came from.
create table if not exists wolf_games (
  round_id uuid primary key references rounds(id) on delete cascade,
  enabled boolean not null default false,
  stake numeric not null default 5,          -- dollars per hole
  lone_multiplier int not null default 3,    -- 2, 3 or 4
  player_order uuid[] not null default '{}', -- rotation, by player id
  reshuffle_each_round boolean not null default true
);

-- One row per hole once the wolf has committed: who had it, and who they took.
-- partner_player_id null means they went alone.
--
-- The wolf is recorded rather than derived from the rotation, deliberately: a
-- reshuffle must never rewrite a hole that has already been played. Upcoming
-- holes still come from the rotation, so shuffling before the round works as
-- designed while shuffling mid-round can't rewrite history.
create table if not exists wolf_holes (
  round_id uuid not null references rounds(id) on delete cascade,
  hole int not null,
  wolf_player_id uuid not null references players(id) on delete cascade,
  partner_player_id uuid references players(id) on delete cascade,
  decided_at timestamptz not null default now(),
  primary key (round_id, hole),
  constraint wolf_partner_is_not_the_wolf check (partner_player_id is null or partner_player_id <> wolf_player_id)
);

-- Teams: one row per round holding the terms. Nothing derived is stored — a
-- team's strokes, its to-par and who leads are all recomputed from the
-- assignments plus posted scores (src/lib/teams.ts), so a team total can never
-- drift from the cards it came from.
--
-- Formats are limited to the two that keep per-player score entry. Scramble,
-- alternate shot and shamble need one number for the group instead of one per
-- player, which is a change to how scoring works rather than a change to teams.
create table if not exists team_games (
  round_id uuid primary key references rounds(id) on delete cascade,
  enabled boolean not null default false,
  format text not null default 'bestball',
  handicap_mode text not null default 'net',
  team_size int not null default 2,
  team_count int not null default 2,
  redraw_at_turn boolean not null default false,
  constraint team_format_is_known check (format in ('bestball', 'total')),
  constraint team_handicap_mode_is_known check (handicap_mode in ('gross', 'net', 'lowman')),
  constraint team_size_is_sane check (team_size between 1 and 4),
  constraint team_count_is_sane check (team_count between 1 and 26)
);

-- Who is on which team, per segment. Segment 0 is the whole round, or the first
-- half when teams are re-drawn at the turn.
--
-- The primary key is (round, segment, player): a player is on at most one team
-- per segment. Two teams for one player would make a best ball count their score
-- twice, so the database refuses it rather than trusting every screen to.
-- Added after team_games shipped, so existing rounds pick it up on a re-run.
-- The constraint is dropped and recreated rather than added only when missing:
-- an earlier version of this file allowed ('gross', 'net') alone, and a database
-- that ran that one would reject 'lowman' forever otherwise.
alter table team_games add column if not exists handicap_mode text not null default 'net';
alter table team_games drop constraint if exists team_handicap_mode_is_known;
alter table team_games add constraint team_handicap_mode_is_known
  check (handicap_mode in ('gross', 'net', 'lowman'));
-- The default was 'gross', which made the fair setting the one you had to go
-- and find every round. Only the default moves — rounds already set to gross
-- stay gross, because a bet's terms are not ours to change after the fact.
alter table team_games alter column handicap_mode set default 'net';

create table if not exists team_members (
  round_id uuid not null references rounds(id) on delete cascade,
  segment int not null default 0,
  team_index int not null,
  player_id uuid not null references players(id) on delete cascade,
  primary key (round_id, segment, player_id),
  constraint team_index_is_sane check (team_index between 0 and 25)
);

-- Team challenge: match play between the round's teams, settling three wagers
-- at once. Terms only — who won which hole, which nine and the match are all
-- recomputed from the teams plus posted scores (src/lib/teamChallenge.ts).
create table if not exists team_challenge (
  round_id uuid primary key references rounds(id) on delete cascade,
  enabled boolean not null default false,
  per_hole_cents int not null default 500,
  per_nine_cents int not null default 2000,
  overall_cents int not null default 5000,
  constraint challenge_rates_are_not_negative
    check (per_hole_cents >= 0 and per_nine_cents >= 0 and overall_cents >= 0)
);

-- Hole games: closest to the pin, longest drive. One row per game, covering
-- however many holes it runs on — closest to the pin on every par 3 is one game
-- with four payouts, not four games.
--
-- No money is stored. The wager is the terms; who won which hole is the result;
-- every position and payment is recomputed from those (src/lib/sideGames.ts).
create table if not exists hole_games (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  type text not null,
  holes int[] not null default '{}',
  wager_cents int not null default 500,
  created_at timestamptz not null default now(),
  constraint hole_game_type_is_known check (type in ('ctp', 'ld')),
  constraint hole_game_wager_is_not_negative check (wager_cents >= 0)
);

-- One row per hole once somebody has won it. No row means the hole hasn't
-- settled — nobody on the green means nobody won it, and the antes stay in
-- everyone's pocket rather than paying the least-bad miss.
create table if not exists hole_game_winners (
  game_id uuid not null references hole_games(id) on delete cascade,
  hole int not null,
  player_id uuid not null references players(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  primary key (game_id, hole)
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
alter table wolf_games enable row level security;
alter table wolf_holes enable row level security;
alter table team_games enable row level security;
alter table team_members enable row level security;
alter table team_challenge enable row level security;
alter table hole_games enable row level security;
alter table hole_game_winners enable row level security;

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
drop policy if exists "anon full access" on wolf_games;
create policy "anon full access" on wolf_games for all using (true) with check (true);
drop policy if exists "anon full access" on wolf_holes;
create policy "anon full access" on wolf_holes for all using (true) with check (true);
drop policy if exists "anon full access" on team_games;
create policy "anon full access" on team_games for all using (true) with check (true);
drop policy if exists "anon full access" on team_members;
create policy "anon full access" on team_members for all using (true) with check (true);
drop policy if exists "anon full access" on team_challenge;
create policy "anon full access" on team_challenge for all using (true) with check (true);
drop policy if exists "anon full access" on hole_games;
create policy "anon full access" on hole_games for all using (true) with check (true);
drop policy if exists "anon full access" on hole_game_winners;
create policy "anon full access" on hole_game_winners for all using (true) with check (true);

-- Push changes to every subscribed phone: scores as they post, and the round's
-- card/course selection when the organizer picks a course.
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member, so
-- this checks first — the whole file is meant to be safe to re-run.
do $$
declare t text;
begin
  for t in select unnest(array[
    'scores', 'round_holes', 'rounds',
    -- Side-game tables subscribe via postgres_changes too: the wolf picks a
    -- partner on their own phone and the rest of the group has to see it, and
    -- the organizer's team draw has to reach everyone playing in it.
    'wolf_games', 'wolf_holes', 'team_games', 'team_members',
    'hole_games', 'hole_game_winners', 'team_challenge'
  ]) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Nothing is inserted here. Rounds are created in the app now, and creating one
-- makes you its organizer and puts you in the field — so a seeded round would be
-- a round nobody made, which is exactly the gap that forced a "claim the
-- organizer role" button to exist in the first place.
--
-- Sample data (the Gladstan card, four named golfers, one round) lives in
-- seed.sql if you want something to click through.
