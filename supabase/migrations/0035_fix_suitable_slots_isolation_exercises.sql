-- Migration 0035: restrict suitable_slots for isolation/accessory exercises in the 1-25 range
--
-- Exercises 1-25 inherited the default suitable_slots=['primary','secondary','accessory'].
-- Compound movements (1-7, 9-18) legitimately belong as primary exercises; no change needed.
-- Isolation exercises (8, 19-24) should never be assigned as session primaries.
--
-- Fixes Known Gap G11 (logged 2026-06-30).

-- Exercise 8  (Seated Leg Curl): machine hamstring isolation
--   allowed_day_types=['hinge_lower'] -- can be hinge secondary (e.g. secondary after RDL primary)
-- Exercise 19 (Barbell Curl): bicep isolation
--   allowed_day_types=['pull_upper'] -- can be pull secondary (bicep work after row primary)
UPDATE public.exercises
SET suitable_slots = ARRAY['secondary', 'accessory']
WHERE exercise_id IN (8, 19);

-- Exercise 20 (Skull Crushers): tricep isolation, allowed_day_types=['push_upper']
-- Exercise 21 (Rope Pushdown): tricep isolation, allowed_day_types=['push_upper']
-- Exercise 22 (Dumbbell Lateral Raise): shoulder isolation, allowed_day_types=['push_upper']
-- Exercise 23 (Rear Delt Fly Machine): rear delt isolation, allowed_day_types=['pull_upper']
-- Exercise 24 (Standing Calf Raise): calf isolation, allowed_day_types=['hinge_lower','squat_lower']
UPDATE public.exercises
SET suitable_slots = ARRAY['accessory']
WHERE exercise_id IN (20, 21, 22, 23, 24);

-- Purge unperformed future sessions so they regenerate with the corrected suitable_slots.
-- ON DELETE CASCADE propagates to plan_exercises automatically.
DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND date > CURRENT_DATE
  AND session_blueprint_version = 2;
