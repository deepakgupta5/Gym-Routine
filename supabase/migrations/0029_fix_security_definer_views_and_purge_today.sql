-- Migration 0029
--
-- Part A: Fix SECURITY DEFINER on views v_weekly_muscle_volume and
--   v_last_top_set_per_exercise. PostgreSQL views run as the view owner
--   (SECURITY DEFINER) by default, bypassing RLS policies. Supabase flags
--   this as CRITICAL. Fix: recreate with security_invoker = on so the view
--   enforces the querying user's RLS policies, not the owner's.
--   Requires PostgreSQL 15+ (Supabase default).
--
-- Part B: Delete today's unperformed session (no logged sets) so it is
--   regenerated fresh with the updated scheduler code (recency penalty in
--   fallback scoring). Migration 0028 purged future sessions
--   (date > that day's CURRENT_DATE) but left today's session intact.
--   If today's session was generated before the no-repeat fix, it may
--   still contain repeated exercises. This purge forces one clean regen.

-- Part A: Recreate views with security_invoker = on

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
  AND e.muscle_primary IS NOT NULL
  AND e.muscle_primary <> 'conditioning'
GROUP BY sl.user_id, e.muscle_primary;

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
ORDER BY sl.user_id, sl.exercise_id, sl.performed_at DESC;

-- Part B: Purge today's unperformed session (if no logged sets).
-- Safe conditions: not performed, cardio not saved, no set_logs.
-- date = CURRENT_DATE targets only today's session -- the complement of
-- 0028's (date > CURRENT_DATE) which left today's session intact.

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND cardio_saved_at IS NULL
  AND date = CURRENT_DATE
  AND plan_session_id NOT IN (
    SELECT DISTINCT session_id
    FROM public.set_logs
    WHERE session_id IS NOT NULL
  );
