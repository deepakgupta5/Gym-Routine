-- Migration 0022: add is_unilateral and uses_bodyweight to exercises
-- These were in 0020 but did not land in production (partial migration apply).
-- Using IF NOT EXISTS so this is safe to re-run.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS is_unilateral   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_bodyweight boolean NOT NULL DEFAULT false;

-- Backfill known unilateral exercises (single-limb movements)
UPDATE exercises SET is_unilateral = true
WHERE name IN (
  'Bulgarian Split Squat (Quad Bias)',
  'Bulgarian Split Squat (Glute Bias)',
  'Single-Leg Press',
  'Single-Leg Romanian Deadlift',
  'Walking Lunges',
  'Dumbbell Lunges',
  'Single-Leg Curl',
  'Dumbbell Curl',
  'Hammer Curl',
  'Single-Arm Cable Row',
  'Single-Arm Dumbbell Row',
  'Single-Arm Lateral Raise',
  'Single-Arm Overhead Press'
);

-- Backfill bodyweight exercises
UPDATE exercises SET uses_bodyweight = true
WHERE name IN (
  'Pull-Up',
  'Chin-Up',
  'Dip',
  'Push-Up',
  'Body Weight Squat',
  'Glute Bridge',
  'Plank',
  'Dead Bug',
  'Ab Wheel Rollout',
  'Hanging Leg Raise'
);
