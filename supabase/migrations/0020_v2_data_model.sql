-- 0020_v2_data_model.sql
-- v2.0 Phase 0: data model additions for the v2 scheduler.
-- Non-destructive. All existing rows preserved. Rollback = flag off.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. New session_type_enum values (v2 day-type names)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'push_upper';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'pull_upper';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'squat_lower';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'hinge_lower';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'full_body';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. New columns on exercises
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS seed_load_lb           numeric(6,2)   NULL,
  ADD COLUMN IF NOT EXISTS muscle_primary         text           NULL,
  ADD COLUMN IF NOT EXISTS muscle_secondary       text[]         NULL,
  ADD COLUMN IF NOT EXISTS allowed_day_types      text[]         NULL,
  ADD COLUMN IF NOT EXISTS forbidden_day_types    text[]         NULL,
  ADD COLUMN IF NOT EXISTS user_preference_score  int            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_variants     text[]         NULL,
  ADD COLUMN IF NOT EXISTS is_unilateral          boolean        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_bodyweight        boolean        NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. New columns on plan_exercises (per-exercise v2 prescription)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.plan_exercises
  ADD COLUMN IF NOT EXISTS top_set_target_load_lb   numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS top_set_target_reps      int           NULL,
  ADD COLUMN IF NOT EXISTS back_off_target_load_lb  numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS back_off_target_reps     int           NULL,
  ADD COLUMN IF NOT EXISTS per_side_reps            boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_variant        text          NULL,
  ADD COLUMN IF NOT EXISTS rationale_code           text          NULL,
  ADD COLUMN IF NOT EXISTS rationale_text           text          NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. New column on plan_sessions
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.plan_sessions
  ADD COLUMN IF NOT EXISTS session_blueprint_version int NOT NULL DEFAULT 1;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Backfill exercises -- equipment_type to new v2 taxonomy
-- ────────────────────────────────────────────────────────────────────────────
-- machine_plate_loaded
UPDATE public.exercises
  SET equipment_type = 'machine_plate_loaded'
  WHERE exercise_id IN (1, 4);

-- machine_selectorized
UPDATE public.exercises
  SET equipment_type = 'machine_selectorized'
  WHERE exercise_id IN (6, 8, 11, 14, 16, 18, 23, 24, 27, 32, 37, 39);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Backfill all 48 exercises with v2 metadata
-- ────────────────────────────────────────────────────────────────────────────

-- 1: Hack Squat
UPDATE public.exercises SET
  seed_load_lb        = 180,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings'],
  allowed_day_types   = ARRAY['squat_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 1;

-- 2: Front Squat
UPDATE public.exercises SET
  seed_load_lb        = 65,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','core','back'],
  allowed_day_types   = ARRAY['squat_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 2;

-- 3: Bulgarian Split Squat
UPDATE public.exercises SET
  seed_load_lb        = 20,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings','core'],
  allowed_day_types   = ARRAY['squat_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower'],
  is_unilateral       = true,
  uses_bodyweight     = false
WHERE exercise_id = 3;

-- 4: Leg Press
UPDATE public.exercises SET
  seed_load_lb        = 180,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings'],
  allowed_day_types   = ARRAY['squat_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 4;

-- 5: Romanian Deadlift
UPDATE public.exercises SET
  seed_load_lb        = 95,
  muscle_primary      = 'hamstrings',
  muscle_secondary    = ARRAY['glutes','back','core'],
  allowed_day_types   = ARRAY['hinge_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 5;

-- 6: Glute Drive / Hip Thrust
UPDATE public.exercises SET
  seed_load_lb        = 90,
  muscle_primary      = 'glutes',
  muscle_secondary    = ARRAY['hamstrings','core'],
  allowed_day_types   = ARRAY['hinge_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 6;

-- 7: Barbell Deadlift
UPDATE public.exercises SET
  seed_load_lb        = 115,
  muscle_primary      = 'hamstrings',
  muscle_secondary    = ARRAY['glutes','quads','back','core'],
  allowed_day_types   = ARRAY['hinge_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 7;

-- 8: Seated Leg Curl
UPDATE public.exercises SET
  seed_load_lb        = 60,
  muscle_primary      = 'hamstrings',
  muscle_secondary    = ARRAY['calves'],
  allowed_day_types   = ARRAY['hinge_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 8;

-- 9: Flat Dumbbell Press
UPDATE public.exercises SET
  seed_load_lb        = 30,
  muscle_primary      = 'chest',
  muscle_secondary    = ARRAY['shoulders','triceps'],
  allowed_day_types   = ARRAY['push_upper','full_body'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 9;

-- 10: Incline Dumbbell Press
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'chest',
  muscle_secondary    = ARRAY['shoulders','triceps'],
  allowed_day_types   = ARRAY['push_upper','full_body'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 10;

-- 11: Chest Press Machine
UPDATE public.exercises SET
  seed_load_lb        = 100,
  muscle_primary      = 'chest',
  muscle_secondary    = ARRAY['shoulders','triceps'],
  allowed_day_types   = ARRAY['push_upper','full_body'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 11;

-- 12: Barbell Row
UPDATE public.exercises SET
  seed_load_lb        = 95,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','core'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 12;

-- 13: Seated Cable Row
UPDATE public.exercises SET
  seed_load_lb        = 70,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','shoulders'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  equipment_variants  = ARRAY['straight_bar','v_bar','d_handle'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 13;

-- 14: Chest-Supported Machine Row
UPDATE public.exercises SET
  seed_load_lb        = 70,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','shoulders'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 14;

-- 15: Dumbbell Shoulder Press
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY['triceps','back'],
  allowed_day_types   = ARRAY['push_upper','full_body'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 15;

-- 16: Machine Shoulder Press
UPDATE public.exercises SET
  seed_load_lb        = 60,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY['triceps'],
  allowed_day_types   = ARRAY['push_upper','full_body'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 16;

-- 17: Lat Pulldown
UPDATE public.exercises SET
  seed_load_lb        = 80,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  equipment_variants  = ARRAY['straight_bar','v_bar','close_grip_bar','single_handle'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 17;

-- 18: Assisted Pull-Up (seed=0 -- needs prompt; load_semantic = assistance)
UPDATE public.exercises SET
  seed_load_lb        = 0,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','core'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 18;

-- 19: Barbell Curl
UPDATE public.exercises SET
  seed_load_lb        = 45,
  muscle_primary      = 'biceps',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 19;

-- 20: Skull Crushers
UPDATE public.exercises SET
  seed_load_lb        = 40,
  muscle_primary      = 'triceps',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 20;

-- 21: Rope Pushdown
UPDATE public.exercises SET
  seed_load_lb        = 40,
  muscle_primary      = 'triceps',
  muscle_secondary    = ARRAY['shoulders'],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  equipment_variants  = ARRAY['rope','straight_bar'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 21;

-- 22: Dumbbell Lateral Raise
UPDATE public.exercises SET
  seed_load_lb        = 10,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 22;

-- 23: Rear Delt Fly Machine
UPDATE public.exercises SET
  seed_load_lb        = 40,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY['back'],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 23;

-- 24: Standing Calf Raise
UPDATE public.exercises SET
  seed_load_lb        = 80,
  muscle_primary      = 'calves',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['hinge_lower','squat_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 24;

-- 25: Cable Crunch
UPDATE public.exercises SET
  seed_load_lb        = 50,
  muscle_primary      = 'core',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['push_upper','pull_upper','squat_lower','hinge_lower'],
  forbidden_day_types = ARRAY[]::text[],
  equipment_variants  = ARRAY['rope'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 25;

-- 26: Back Squat
UPDATE public.exercises SET
  seed_load_lb        = 95,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings','core'],
  allowed_day_types   = ARRAY['squat_lower','full_body'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 26;

-- 27: 45 Degree Back Extension
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'glutes',
  muscle_secondary    = ARRAY['hamstrings','core'],
  allowed_day_types   = ARRAY['hinge_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 27;

-- 28: Pull-Up
UPDATE public.exercises SET
  seed_load_lb        = 0,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','core'],
  allowed_day_types   = ARRAY['pull_upper','full_body'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower'],
  is_unilateral       = false,
  uses_bodyweight     = true
WHERE exercise_id = 28;

-- 29: Reverse Lunge
UPDATE public.exercises SET
  seed_load_lb        = 20,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings','core'],
  allowed_day_types   = ARRAY['squat_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower','full_body'],
  is_unilateral       = true,
  uses_bodyweight     = false
WHERE exercise_id = 29;

-- 30: Step-Up
UPDATE public.exercises SET
  seed_load_lb        = 20,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','hamstrings'],
  allowed_day_types   = ARRAY['squat_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower','full_body'],
  is_unilateral       = true,
  uses_bodyweight     = false
WHERE exercise_id = 30;

-- 31: Cable Fly
UPDATE public.exercises SET
  seed_load_lb        = 20,
  muscle_primary      = 'chest',
  muscle_secondary    = ARRAY['shoulders'],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  equipment_variants  = ARRAY['d_handle'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 31;

-- 32: Pec Deck
UPDATE public.exercises SET
  seed_load_lb        = 60,
  muscle_primary      = 'chest',
  muscle_secondary    = ARRAY['shoulders'],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 32;

-- 33: Landmine Press
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY['chest','triceps','core'],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 33;

-- 34: One Arm Dumbbell Row
UPDATE public.exercises SET
  seed_load_lb        = 30,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['biceps','core'],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = true,
  uses_bodyweight     = false
WHERE exercise_id = 34;

-- 35: Face Pull
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'shoulders',
  muscle_secondary    = ARRAY['back','biceps'],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  equipment_variants  = ARRAY['rope'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 35;

-- 36: Straight Arm Pulldown
UPDATE public.exercises SET
  seed_load_lb        = 30,
  muscle_primary      = 'back',
  muscle_secondary    = ARRAY['triceps'],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  equipment_variants  = ARRAY['straight_bar','rope'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 36;

-- 37: Leg Extension
UPDATE public.exercises SET
  seed_load_lb        = 60,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY['squat_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 37;

-- 38: Heel Elevated Goblet Squat
UPDATE public.exercises SET
  seed_load_lb        = 25,
  muscle_primary      = 'quads',
  muscle_secondary    = ARRAY['glutes','core'],
  allowed_day_types   = ARRAY['squat_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 38;

-- 39: Lying Leg Curl
UPDATE public.exercises SET
  seed_load_lb        = 45,
  muscle_primary      = 'hamstrings',
  muscle_secondary    = ARRAY['calves'],
  allowed_day_types   = ARRAY['hinge_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 39;

-- 40: Cable Pull-Through
UPDATE public.exercises SET
  seed_load_lb        = 35,
  muscle_primary      = 'glutes',
  muscle_secondary    = ARRAY['hamstrings','core'],
  allowed_day_types   = ARRAY['hinge_lower'],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower','full_body'],
  equipment_variants  = ARRAY['rope'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 40;

-- 41: Hammer Curl
UPDATE public.exercises SET
  seed_load_lb        = 20,
  muscle_primary      = 'biceps',
  muscle_secondary    = ARRAY['forearms'],
  allowed_day_types   = ARRAY['pull_upper'],
  forbidden_day_types = ARRAY['push_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 41;

-- 42: Overhead Cable Triceps Extension
UPDATE public.exercises SET
  seed_load_lb        = 30,
  muscle_primary      = 'triceps',
  muscle_secondary    = ARRAY['core'],
  allowed_day_types   = ARRAY['push_upper'],
  forbidden_day_types = ARRAY['pull_upper','squat_lower','hinge_lower','full_body'],
  equipment_variants  = ARRAY['rope'],
  is_unilateral       = false,
  uses_bodyweight     = false
WHERE exercise_id = 42;

-- 43: Hanging Knee Raise
UPDATE public.exercises SET
  seed_load_lb        = 0,
  muscle_primary      = 'core',
  muscle_secondary    = ARRAY['back'],
  allowed_day_types   = ARRAY['push_upper','pull_upper','squat_lower','hinge_lower'],
  forbidden_day_types = ARRAY[]::text[],
  is_unilateral       = false,
  uses_bodyweight     = true
WHERE exercise_id = 43;

-- 44: Pallof Press
UPDATE public.exercises SET
  seed_load_lb        = 15,
  muscle_primary      = 'core',
  muscle_secondary    = ARRAY['shoulders'],
  allowed_day_types   = ARRAY['push_upper','pull_upper','squat_lower','hinge_lower'],
  forbidden_day_types = ARRAY[]::text[],
  equipment_variants  = ARRAY['d_handle'],
  is_unilateral       = true,
  uses_bodyweight     = false
WHERE exercise_id = 44;

-- 45-48: Cardio (excluded from gym day scheduling)
UPDATE public.exercises SET
  seed_load_lb        = 0,
  muscle_primary      = 'conditioning',
  muscle_secondary    = ARRAY[]::text[],
  allowed_day_types   = ARRAY[]::text[],
  forbidden_day_types = ARRAY['push_upper','pull_upper','squat_lower','hinge_lower','full_body'],
  is_unilateral       = false,
  uses_bodyweight     = true
WHERE exercise_id IN (45, 46, 47, 48);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Views
-- ────────────────────────────────────────────────────────────────────────────

-- Weekly set count per muscle group per user (rolling 7 days)
CREATE OR REPLACE VIEW public.v_weekly_muscle_volume AS
SELECT
  sl.user_id,
  e.muscle_primary,
  count(*)::int AS weekly_sets
FROM public.set_logs sl
JOIN public.exercises e ON e.exercise_id = sl.exercise_id
WHERE sl.performed_at >= now() - interval '7 days'
  AND e.muscle_primary IS NOT NULL
  AND e.muscle_primary <> 'conditioning'
GROUP BY sl.user_id, e.muscle_primary;

-- Most recent first set per exercise per user (used by v2 load computation)
CREATE OR REPLACE VIEW public.v_last_top_set_per_exercise AS
SELECT DISTINCT ON (sl.user_id, sl.exercise_id)
  sl.user_id,
  sl.exercise_id,
  sl.load          AS last_load,
  sl.reps          AS last_reps,
  sl.set_type,
  sl.performed_at
FROM public.set_logs sl
WHERE sl.set_index = 1
ORDER BY sl.user_id, sl.exercise_id, sl.performed_at DESC;
