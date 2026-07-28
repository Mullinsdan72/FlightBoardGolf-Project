-- Wipe every round's data and start clean.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- DELETES: every round (and with it every score, sign-off, card and wolf
-- record), every player, and all cached courses and favourites. Keeps the tables
-- themselves, so the app works immediately afterwards — it will simply be empty
-- and ask you to create a round.
--
-- Not reversible. There is no undo and no backup on the free tier.
--
-- Afterwards the app opens on Rounds with nothing in it. Create a round, add
-- players on the FIELD tab, pick a course — that's the expected empty state.

begin;

delete from wolf_holes;
delete from wolf_games;
delete from scores;
delete from signoffs;
delete from round_players;
delete from round_holes;

-- Rounds go too now that they're created in the app — scores, cards, sign-offs
-- and wolf rows all cascade from them. Detach from courses first: rounds.course_id
-- is a foreign key with no ON DELETE clause, so deleting a course a round still
-- points at would abort the whole transaction.
update rounds set organizer_player_id = null, course_id = null;

delete from rounds;
delete from favorite_courses;
delete from course_tees;
delete from courses;
delete from players;

commit;

-- Sanity check: every count below should be 0.
select
  (select count(*) from players)          as players,
  (select count(*) from rounds)           as rounds,
  (select count(*) from scores)           as scores,
  (select count(*) from signoffs)         as signoffs,
  (select count(*) from courses)          as courses,
  (select count(*) from favorite_courses) as favorites;
