-- Migration 0031
--
-- Root cause: session_type_enum was missing push_upper, squat_lower,
-- pull_upper, and full_body. Migration 0020 added them with a safe
-- DO ... EXCEPTION block, but they did not land in production --
-- likely because 0020 was not fully applied when it was first run.
-- Only hinge_lower is present in the enum, so every INSERT for any
-- other v2 day type throws a 22P02 enum violation, the transaction
-- rolls back, and no session is created. On retry, selectDayType
-- sees hinge_lower (from the one session that DID land) and keeps
-- returning the next value -- but that next value also fails,
-- eventually wrapping back to hinge_lower permanently.
--
-- Fix part A: ensure all 5 v2 enum values exist (idempotent).
-- Fix part B: delete all unperformed sessions with no logged sets
--   so the scheduler regenerates a correct rotation from scratch.
--   We keep performed sessions (performed_at IS NOT NULL) and
--   sessions with logged sets (safety: don't erase real workout data).

-- Part A: Add missing enum values (safe to re-run)

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

-- Part B: Delete ALL unperformed sessions that have no logged sets.
-- This resets the rotation so the scheduler can build a correct
-- push_upper -> squat_lower -> pull_upper -> hinge_lower -> full_body
-- cycle from the user's last actually-performed session.

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND cardio_saved_at IS NULL
  AND plan_session_id NOT IN (
    SELECT DISTINCT session_id
    FROM public.set_logs
    WHERE session_id IS NOT NULL
  );
