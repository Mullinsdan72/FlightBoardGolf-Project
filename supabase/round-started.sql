-- Flight Board — a round knows when it started.
--
-- Run in the SQL editor. Safe to re-run, deletes nothing, touches no policies.
-- **Do not run schema.sql instead** — it carries the column too, but re-running
-- it also recreates the permissive `anon full access` policies and undoes the
-- whole RLS lockdown.
--
-- Until now a round had no state of its own. Whether it counted as being played
-- was *derived* — from whether anybody had posted a score — and which round you
-- were looking at lived in AsyncStorage on one phone. Both are wrong for a
-- group:
--
--   * **Derived is too late.** A round set up the night before is indistinguish-
--     able from one nobody has teed off in yet, because they are the same thing.
--     START ROUND navigated to the Score tab and marked nothing.
--   * **Per-device is not shared.** The organizer opening a round on their phone
--     did nothing for the other ten, so which round everyone was on got settled
--     by text message across a car park.
--
-- One column fixes both. Finished stays derived from signatures, because signing
-- *is* the end of a round and a second flag would be a second truth (rule 3).

alter table rounds add column if not exists started_at timestamptz;

-- Anything with a posted score was already being played, whatever the app knew.
-- `created_at` rather than now(), so a round from last week does not claim to
-- have started this morning and jump to the top of everybody's list.
--
-- `coalesce` so re-running never moves a start time that is already recorded.
update rounds r
   set started_at = coalesce(r.started_at, r.created_at)
 where r.started_at is null
   and exists (select 1 from scores s where s.round_id = r.id);

-- Anything never teed off stays null, which is what it always was: a draft.

select
  count(*) filter (where started_at is not null) as started,
  count(*) filter (where started_at is null)     as drafts,
  count(*)                                        as all_rounds
from rounds;
