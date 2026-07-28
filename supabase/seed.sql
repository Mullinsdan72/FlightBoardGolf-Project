-- Optional sample data: the Gladstan Grudge Match with four named golfers.
-- Not needed for real use — run supabase/reset.sql to clear everything, then
-- add real players on the FIELD tab. This exists so a fresh database has
-- something to click through, and is kept out of schema.sql so re-running the
-- schema never resurrects players you deleted.

-- IDs match src/data/seed.ts exactly — do not change one without the other.
insert into players (id, name, handicap) values
  ('22222222-2222-4222-8222-222222222221', 'Tanner Wells', 8),
  ('22222222-2222-4222-8222-222222222222', 'Deke Farr', 2),
  ('22222222-2222-4222-8222-222222222223', 'Marcus Vela', 11),
  ('22222222-2222-4222-8222-222222222224', 'Ray Okafor', 16)
on conflict (id) do nothing;

-- Gladstan, seeded as a manual course record so the app has one starred course
-- before anyone touches the API. Searching for a new course adds a 'gca:' row
-- alongside this one.
insert into courses (id, source, club_name, course_name, location) values
  ('manual:gladstan', 'manual', 'Gladstan Golf Club', 'Gladstan Golf Club', 'Payson, UT')
on conflict (id) do nothing;

insert into course_tees (course_id, tee_name, gender, total_yards, par_total, course_rating, slope_rating, holes) values
  ('manual:gladstan', 'Blue', 'male', 6543, 72, 71.2, 131, '[
    {"hole":1,"par":4,"yards":372,"handicap":9},
    {"hole":2,"par":4,"yards":401,"handicap":3},
    {"hole":3,"par":3,"yards":168,"handicap":17},
    {"hole":4,"par":5,"yards":512,"handicap":7},
    {"hole":5,"par":4,"yards":355,"handicap":13},
    {"hole":6,"par":4,"yards":418,"handicap":1},
    {"hole":7,"par":3,"yards":196,"handicap":11},
    {"hole":8,"par":4,"yards":344,"handicap":15},
    {"hole":9,"par":5,"yards":498,"handicap":5},
    {"hole":10,"par":4,"yards":389,"handicap":8},
    {"hole":11,"par":3,"yards":152,"handicap":18},
    {"hole":12,"par":4,"yards":427,"handicap":2},
    {"hole":13,"par":5,"yards":531,"handicap":6},
    {"hole":14,"par":4,"yards":361,"handicap":12},
    {"hole":15,"par":4,"yards":402,"handicap":4},
    {"hole":16,"par":3,"yards":174,"handicap":16},
    {"hole":17,"par":4,"yards":338,"handicap":14},
    {"hole":18,"par":5,"yards":505,"handicap":10}
  ]'::jsonb)
on conflict (course_id, tee_name, gender) do nothing;

insert into rounds (id, name, course_name, course_meta, course_id, tee_name, tee_gender, holes_in_play) values
  ('11111111-1111-4111-8111-111111111111', 'Gladstan Grudge Match', 'Gladstan Golf Club',
   'Payson UT · Blue · par 72', 'manual:gladstan', 'Blue', 'male', 'all18')
on conflict (id) do nothing;

-- Existing databases: link the round to the seeded course if it predates these columns.
update rounds
   set course_id = 'manual:gladstan', tee_name = coalesce(tee_name, 'Blue'),
       tee_gender = coalesce(tee_gender, 'male')
 where id = '11111111-1111-4111-8111-111111111111' and course_id is null;

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
