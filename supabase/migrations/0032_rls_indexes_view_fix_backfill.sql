-- Migration 0032
--
-- A: Enable RLS on completed_workouts, planned_workouts, muscle_exposures
--    (tables created in 0018/0019 but never got RLS or policies).
--
-- B: Fix v_last_top_set_per_exercise to exclude accessory/backoff set types.
--    Adds AND sl.set_type IN ('top', 'straight') as belt-and-suspenders
--    alongside the existing set_index = 1 filter.
--
-- C: Add partial covering index for set_logs top-set lookups.
--    Scheduler and progression code repeatedly query the most recent
--    top set per (user_id, exercise_id). A partial index on set_index = 1
--    avoids a full scan across all set types.
--
-- D: Add covering index for plan_sessions (user_id, date, session_type).
--    Scheduler and dashboard both filter by user+date and also read
--    session_type. A covering index eliminates heap fetches for those queries.
--
-- E: Backfill backoff_percent rows that were written with 0.1 (10%) due to
--    the (1 - 0.9) typo fixed in the application code. Corrects to 0.9 (90%).
--
-- F: Drop the now-orphaned uq_plan_sessions_identity index.
--    Migration 0023 replaced it with a UNIQUE CONSTRAINT on plan_sessions,
--    making this index redundant. Keeping both wastes writes and space.

-- ============================================================
-- A: RLS on completed_workouts
-- ============================================================

ALTER TABLE public.completed_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own completed_workouts"
  ON public.completed_workouts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- A: RLS on planned_workouts
-- ============================================================

ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own planned_workouts"
  ON public.planned_workouts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- A: RLS on muscle_exposures
-- ============================================================

ALTER TABLE public.muscle_exposures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own muscle_exposures"
  ON public.muscle_exposures
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- B: Fix v_last_top_set_per_exercise to filter by set_type
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
WHERE sl.set_index = 1
  AND sl.set_type IN ('top', 'straight')
ORDER BY sl.user_id, sl.exercise_id, sl.performed_at DESC;

-- ============================================================
-- C: Partial index for top-set lookups (set_index = 1)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_set_logs_top_set
  ON public.set_logs (user_id, exercise_id, performed_at DESC)
  WHERE set_index = 1;

-- ============================================================
-- D: Covering index for plan_sessions (user_id, date, session_type)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_plan_sessions_user_date_type
  ON public.plan_sessions (user_id, date, session_type);

-- ============================================================
-- E: Backfill backoff_percent typo (0.1 -> 0.9)
-- ============================================================

UPDATE public.plan_exercises
SET backoff_percent = 0.9
WHERE backoff_percent = 0.1;

-- ============================================================
-- F: Drop orphaned uq_plan_sessions_identity index
-- ============================================================

DROP INDEX IF EXISTS public.uq_plan_sessions_identity;
