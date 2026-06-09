-- Migration 0031
--
-- Root cause of hinge_lower-forever bug (diagnosed 2026-06-09):
--
-- loadRecentV2DayTypes used ORDER BY date ASC LIMIT 10, which returns the
-- 10 OLDEST v2 sessions. selectDayType(recentV2DayTypes) reads the last
-- element (recentV2DayTypes[length-1]) to determine the next day type.
-- With ASC ordering, "last" = the 10th-oldest session, NOT the most recent.
--
-- Once more than 10 v2 sessions existed in the DB, the query permanently
-- froze on sessions 1-10 (from April). The 10th session from April was
-- pull_upper (index 2 in V2_ROTATION), so selectDayType kept returning
-- hinge_lower (index 3) on every subsequent call -- forever.
--
-- Code fix (src/lib/scheduler/v2/index.ts): changed to ORDER BY date DESC
-- LIMIT 1 so the query always returns the true most-recent v2 session.
--
-- This migration (Part B) deletes all unperformed sessions so the next
-- session generated uses the code fix and starts the rotation fresh from
-- the last PERFORMED session type.
--
-- Part A: enum additions are safe no-ops (all 5 values already exist in
-- production, confirmed by diagnostic query 2026-06-09).

-- Part A: Add missing enum values (safe to re-run, no-ops if already present)

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
-- This resets the rotation so the (now-fixed) scheduler generates a correct
-- push_upper -> squat_lower -> pull_upper -> hinge_lower -> full_body cycle
-- from the user's last actually-performed session.

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND cardio_saved_at IS NULL
  AND plan_session_id NOT IN (
    SELECT DISTINCT session_id
    FROM public.set_logs
    WHERE session_id IS NOT NULL
  );
