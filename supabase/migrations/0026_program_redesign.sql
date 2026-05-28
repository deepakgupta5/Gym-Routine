-- 0026_program_redesign.sql
-- Program redesign based on 3-month training data analysis:
--   1. Add Barbell Overhead Press (missing entirely from catalog)
--   2. Disable Chest Press Machine (redundant with Flat + Incline DB Press)
--   3. Boost vertical pull preference (Pull-Up, Lat Pulldown under-represented vs chest)
--   4. Fix core exercises to accessory-only suitable_slots
--   5. Boost core preference so they appear consistently

-- 1. Add Barbell Overhead Press
INSERT INTO public.exercises (
  exercise_id,
  name,
  movement_pattern,
  default_targeted_primary_muscle,
  default_targeted_secondary_muscle,
  equipment_type,
  load_increment,
  load_increment_lb,
  load_semantic,
  fatigue_score,
  complexity_score,
  leg_dominant,
  suitable_slots,
  emphasis_tags,
  is_enabled,
  is_unilateral,
  uses_bodyweight,
  seed_load_lb,
  muscle_primary,
  muscle_secondary,
  allowed_day_types,
  forbidden_day_types,
  user_preference_score,
  display_id,
  category
)
SELECT
  49,
  'Barbell Overhead Press',
  'vertical_push',
  'shoulders',
  'triceps',
  'barbell',
  '2.5',
  2.5,
  'normal',
  4,
  4,
  false,
  ARRAY['primary','secondary'],
  ARRAY['push'],
  true,
  false,
  false,
  45.0,
  'shoulders',
  ARRAY['triceps','core'],
  ARRAY['push_upper','full_body'],
  ARRAY['pull_upper','squat_lower','hinge_lower'],
  2,
  'VP01',
  'vertical_push'
WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE exercise_id = 49);

-- 2. Disable Chest Press Machine (redundant: Flat DB + Incline DB already cover chest)
UPDATE public.exercises
SET is_enabled = false
WHERE exercise_id = 11;

-- 3. Boost vertical pull preference
--    Pull-Up (#28) and Lat Pulldown (#17) were severely under-represented
--    vs chest volume (6 vertical pull sets vs 86 chest sets over 3 months).
UPDATE public.exercises
SET user_preference_score = 2
WHERE exercise_id IN (17, 28);

-- 4. Fix core exercises: accessory-only suitable_slots
--    Default was ['primary','secondary','accessory'] which allows them as
--    primary lifts -- incorrect for core isolation exercises.
UPDATE public.exercises
SET suitable_slots = ARRAY['accessory']
WHERE exercise_id IN (25, 43, 44);

-- 5. Boost core exercise preference so they appear every session
UPDATE public.exercises
SET user_preference_score = 2
WHERE exercise_id IN (25, 43, 44);
