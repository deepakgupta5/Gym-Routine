-- Migration 0028: fix suitable_slots for exercises 26-44 + purge stale future sessions
--
-- Problem A: exercises 26-44 were added in migration 0020 without explicit
--   suitable_slots, so they all inherited the DEFAULT ['primary','secondary','accessory'].
--   This causes compound movements (Back Squat) to appear as accessories and
--   isolation movements (Leg Extension) to appear as primaries.
--
-- Problem B: plan_sessions already in the DB were generated before the no-repeat
--   fix (migration logic update). Those sessions must be deleted so they are
--   regenerated fresh when the user visits those dates.
--
-- Part A: correct suitable_slots for exercises 26-44
-- (exercises 43, 44 were already fixed in migration 0026)

-- Compound movements: primary/secondary only (no accessory)
UPDATE public.exercises
SET suitable_slots = ARRAY['primary','secondary']
WHERE exercise_id IN (
  26, -- Back Squat
  28  -- Pull-Up
);

-- Secondary-capable movements: secondary/accessory (not primary)
UPDATE public.exercises
SET suitable_slots = ARRAY['secondary','accessory']
WHERE exercise_id IN (
  27, -- 45 Degree Back Extension
  29, -- Reverse Lunge
  30, -- Step-Up
  31, -- Cable Fly
  32, -- Pec Deck
  33, -- Landmine Press
  34, -- One Arm Dumbbell Row
  38, -- Heel Elevated Goblet Squat
  40  -- Cable Pull-Through
);

-- Isolation accessories only (never primary or secondary)
UPDATE public.exercises
SET suitable_slots = ARRAY['accessory']
WHERE exercise_id IN (
  35, -- Face Pull
  36, -- Straight Arm Pulldown
  37, -- Leg Extension
  39, -- Lying Leg Curl
  41, -- Hammer Curl
  42  -- Overhead Cable Triceps Extension
);

-- Part B: delete unperformed future sessions with no logged sets so they
-- get regenerated with the corrected exercise selection logic.
-- Safe conditions: performed_at IS NULL (never completed), cardio not saved,
-- date is strictly in the future, and no set_logs exist for the session.
DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND cardio_saved_at IS NULL
  AND date > CURRENT_DATE
  AND plan_session_id NOT IN (
    SELECT DISTINCT session_id
    FROM public.set_logs
    WHERE session_id IS NOT NULL
  );
