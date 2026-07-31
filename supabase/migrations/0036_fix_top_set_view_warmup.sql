-- Migration 0036
--
-- Fix v_last_top_set_per_exercise for sessions that log a warmup set first.
--
-- Root cause (INC-023):
--   The view filtered WHERE set_index = 1 AND set_type IN ('top','straight').
--   When the user logs a warmup before the working set, the warmup occupies
--   set_index = 1 (is_warmup = true, set_type = 'straight'). The view matched
--   the warmup row and returned its (low) load as "last top set," causing:
--     A) Scheduler for next session uses warmup load as prior -> wrong low target
--     B) Bodyweight exercises (load = 0 lb added weight): the parallel app-layer
--        fix (load < 0 replaces load <= 0) unblocks logging; view now needs to
--        find these rows regardless of which set_index they land on.
--
-- Fix: replace set_index = 1 with is_warmup = false. The view now returns the
-- most recent non-warmup top/straight set per (user_id, exercise_id), regardless
-- of its raw position in the set sequence.
--
-- Supporting index updated to match new predicate so the DB can use it.
--
-- Unperformed sessions purged: prior sessions may have been generated using
-- warmup load as "prior", producing incorrect low targets. Purging forces
-- regeneration with corrected view data.

-- ============================================================
-- A: Recreate view without set_index filter
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
  AND sl.set_type IN ('top', 'straight')
ORDER BY sl.user_id, sl.exercise_id, sl.performed_at DESC;

-- ============================================================
-- B: Replace partial index to match new view predicate
-- ============================================================

DROP INDEX IF EXISTS public.idx_set_logs_top_set;

CREATE INDEX idx_set_logs_top_set
  ON public.set_logs (user_id, exercise_id, performed_at DESC)
  WHERE is_warmup = false AND (set_type = 'top' OR set_type = 'straight');

-- ============================================================
-- C: Purge unperformed future sessions (today + forward)
--    so they regenerate with the corrected view
-- ============================================================

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND date >= CURRENT_DATE;
