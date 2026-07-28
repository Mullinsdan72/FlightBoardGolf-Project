-- Wipe every round's data and start clean.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- DELETES: all scores, all sign-offs, every player, the round's card, and all
-- cached courses and favourites. Keeps the tables themselves and the (now
-- empty) round row, so the app works immediately afterwards — it will simply
-- have nothing in it, and the FIELD tab is where you add real players.
--
-- Not reversible. There is no undo and no backup on the free tier.
--
-- Afterwards the app asks who you are and has no names to offer until you add
-- some — that's expected, not a bug.

begin;

delete from scores;
delete from signoffs;
delete from round_players;
delete from round_holes;
delete from favorite_courses;
delete from course_tees;
delete from courses;
delete from players;

-- Keep the round, but detach it from any course so the Course tab starts fresh.
update rounds
   set course_id = null,
       course_name = '',
       course_meta = '',
       tee_name = null,
       tee_gender = 'male',
       holes_in_play = 'all18';

commit;

-- Sanity check: every count below should be 0.
select
  (select count(*) from players)          as players,
  (select count(*) from scores)           as scores,
  (select count(*) from signoffs)         as signoffs,
  (select count(*) from round_holes)      as round_holes,
  (select count(*) from courses)          as courses,
  (select count(*) from favorite_courses) as favorites;
