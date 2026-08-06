-- Migration 0037
--
-- Fix INC-024: accessory-role exercises never accumulate progression history.
--
-- Root cause:
--   v2SetType() returns set_type = 'accessory' for every set of an
--   accessory-role exercise (top, middle, or last set alike -- accessories
--   use straight sets per PRD 2.2, no top/back-off distinction). But:
--     A) v_last_top_set_per_exercise (migrations 0032, 0036) filtered
--        set_type IN ('top', 'straight') -- 'accessory' was never included.
--        computeLoad() therefore always received prior = undefined for any
--        accessory exercise, producing rationale_code = 'seed_only' /
--        "new exercise" on every single session, forever, regardless of
--        how many times the user logged it.
--     B) The top_set_history insert filter in route.ts / [id]/route.ts
--        (`set_type === 'top' || (set_type === 'straight' && is_primary)`)
--        also never matched 'accessory' rows, so the "Recent:" progress
--        widget on ExerciseCard always showed nothing for accessory
--        exercises (recentTopSets.length === 0).
--   Accessory-role exercises fill 2-3 of every 5 session slots (PRD 2.3),
--   so this was the dominant cause of "exercises I've done before show as
--   new" and part of "history is incomplete" -- affecting the majority of
--   exercises in every session, not just bodyweight/warmup edge cases
--   (INC-023 fixed those; this fixes the accessory-role gap flagged as
--   known-but-out-of-scope in INC-023).
--
-- Fix:
--   A) Add 'accessory' to the view's set_type filter.
--   B) Add 'accessory' to the supporting partial index.
--   C) Backfill top_set_history for previously-untracked accessory sets:
--      one representative row per (session, exercise) -- the earliest
--      working (non-warmup) accessory set logged that session, since all
--      accessory sets in a session share the same load (straight sets).
--   D) Purge unperformed future sessions so they regenerate with correct
--      accessory progression data.
--
-- Note: application code (route.ts, [id]/route.ts) must also be updated
-- to capture accessory sets into top_set_history going forward -- this
-- migration alone only fixes the view (read path) and backfills history;
-- the write-path fix ships in the same commit.

-- ============================================================
-- A: Add 'accessory' to view's set_type filter
-- ============================================================

DROP VIEW IF EXISTS public.v_last_top_set_per_exercise;

CREATE VIEW public.v_last_top_set_per_exercise
  WITH (security_invoker = on)
AS
SELECT DISTINCT ON (sl.user_id, sl.exercise_id)
  sl.user_id,
  sl.exercise_id,
  sl.load          AS last_load,
  sl.reps          AS last_reps,
  sl.set_type,
  sl.performed_at
FROM public.set_logs sl
WHERE sl.is_warmup = false
  AND sl.set_type IN ('top', 'straight', 'accessory')
ORDER BY sl.user_id, sl.exercise_id, sl.performed_at DESC;

-- ============================================================
-- B: Update partial index to match new predicate
-- ============================================================

DROP INDEX IF EXISTS public.idx_set_logs_top_set;

CREATE INDEX idx_set_logs_top_set
  ON public.set_logs (user_id, exercise_id, performed_at DESC)
  WHERE is_warmup = false
    AND (set_type = 'top' OR set_type = 'straight' OR set_type = 'accessory');

-- ============================================================
-- C: Backfill top_set_history for untracked accessory sets
--    One row per (user_id, exercise_id, session_id): the earliest
--    working accessory set logged in that session.
-- ============================================================

WITH representative_accessory_sets AS (
  SELECT DISTINCT ON (sl.user_id, sl.exercise_id, sl.session_id)
    sl.id            AS set_log_id,
    sl.user_id,
    sl.exercise_id,
    sl.session_id,
    sl.load,
    sl.reps,
    sl.performed_at,
    ps.block_id,
    ps.week_in_block
  FROM public.set_logs sl
  LEFT JOIN public.plan_sessions ps ON ps.plan_session_id = sl.session_id
  WHERE sl.is_warmup = false
    AND sl.set_type = 'accessory'
    AND NOT EXISTS (
      SELECT 1 FROM public.top_set_history tsh
      WHERE tsh.source_set_log_id = sl.id
    )
  ORDER BY sl.user_id, sl.exercise_id, sl.session_id, sl.set_index ASC, sl.performed_at ASC
)
INSERT INTO public.top_set_history
  (user_id, performed_at, exercise_id, load, reps, estimated_1rm,
   block_id, week_in_block, bias_balance_at_time, source_set_log_id)
SELECT
  ras.user_id,
  ras.performed_at,
  ras.exercise_id,
  ras.load,
  ras.reps,
  ras.load * (1 + ras.reps / 30.0) AS estimated_1rm,
  ras.block_id,
  ras.week_in_block,
  coalesce(up.bias_balance, 0),
  ras.set_log_id
FROM representative_accessory_sets ras
LEFT JOIN public.user_profile up ON up.user_id = ras.user_id
ON CONFLICT (source_set_log_id) DO NOTHING;

-- ============================================================
-- D: Purge unperformed future sessions so they regenerate with
--    corrected accessory progression data
-- ============================================================

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND date >= CURRENT_DATE;
