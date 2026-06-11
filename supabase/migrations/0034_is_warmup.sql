-- Migration 0034: warm-up set flag (PRD Section 11.6)
-- is_warmup=TRUE sets are excluded from volume totals and progression calculation.
-- Existing rows default to FALSE (they are all working sets).

ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT FALSE;

-- Rebuild v_weekly_muscle_volume to exclude warm-up sets.
-- Previous definition was in migration 0029.
DROP VIEW IF EXISTS public.v_weekly_muscle_volume;
CREATE VIEW public.v_weekly_muscle_volume
  WITH (security_invoker = on)
AS
SELECT
  sl.user_id,
  e.muscle_primary,
  count(*)::int AS weekly_sets
FROM public.set_logs sl
JOIN public.exercises e ON e.exercise_id = sl.exercise_id
WHERE sl.performed_at >= now() - interval '7 days'
  AND sl.is_warmup = FALSE
  AND e.muscle_primary IS NOT NULL
  AND e.muscle_primary <> 'conditioning'
GROUP BY sl.user_id, e.muscle_primary;
