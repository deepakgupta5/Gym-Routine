-- Migration 0023: clean up v1 Render-generated sessions and add unique constraint
--
-- The old Render v1 scheduler pre-generated sessions all the way to June 2026.
-- When GYM_V2_ENABLED was turned on, the crash-retry loop created duplicates.
-- This migration:
--   1. Removes duplicates (keeping performed > most exercises > earliest created_at)
--   2. Removes all unperformed future sessions in the active block so v2 regenerates them
--   3. Adds a unique constraint to prevent future duplicates

-- Step 1: Remove duplicate sessions per (user_id, block_id, date)
-- Keep the one that is performed, has the most exercises, or was created earliest.
DO $$
DECLARE
  rec RECORD;
  discard_ids uuid[];
BEGIN
  FOR rec IN
    SELECT user_id, block_id, date::date as d
    FROM plan_sessions
    GROUP BY user_id, block_id, date::date
    HAVING count(*) > 1
  LOOP
    SELECT array_agg(plan_session_id ORDER BY
      (performed_at IS NOT NULL) DESC,
      (SELECT count(*) FROM plan_exercises pe WHERE pe.plan_session_id = ps.plan_session_id) DESC,
      created_at ASC
    ) INTO discard_ids
    FROM plan_sessions ps
    WHERE user_id = rec.user_id AND block_id = rec.block_id AND date::date = rec.d;

    -- Remove the first element (keeper), delete the rest
    discard_ids := discard_ids[2:];
    IF array_length(discard_ids, 1) > 0 THEN
      DELETE FROM plan_exercises WHERE plan_session_id = ANY(discard_ids);
      DELETE FROM plan_sessions WHERE plan_session_id = ANY(discard_ids);
    END IF;
  END LOOP;
END $$;

-- Step 2: Remove all unperformed sessions on or after the migration date
-- so the v2 scheduler regenerates them fresh with v2 exercise prescriptions.
-- (Performed sessions are historical and must not be touched.)
DELETE FROM plan_exercises
WHERE plan_session_id IN (
  SELECT plan_session_id FROM plan_sessions
  WHERE performed_at IS NULL
    AND date >= '2026-04-20'
);
DELETE FROM plan_sessions
WHERE performed_at IS NULL
  AND date >= '2026-04-20';

-- Step 3: Enforce one session per (user, block, date) going forward
ALTER TABLE plan_sessions
  ADD CONSTRAINT plan_sessions_user_block_date_key
  UNIQUE (user_id, block_id, date);
