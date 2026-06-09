-- Migration 0030
--
-- Root cause of persisting exercise repeat (INC-011):
--
--   The no-repeat window was 7 days. The 5-day rotation means the previous
--   push_upper session is 5 days ago -- inside the 7-day window. So ALL
--   push_upper accessories (core + day-type-specific) are in recentIds on
--   every push_upper session. The internal fallback in candidatesForSlot
--   keeps the full pool when the filter empties it. With all candidates
--   penalised by -200, core exercises (user_preference_score=2 -> +40)
--   still outscore non-core (+0 or +10) by 40 points -- same exercises
--   win every session.
--
-- Fix applied in code (commit TBD):
--   index.ts: loadRecentPrimaryExerciseIds window changed from
--   interval '7 days' to interval '2 days'. Only yesterday + day-before
--   are excluded; day-type-specific accessories from the previous same-type
--   session (5 days ago) are fresh candidates. Fallback rarely fires.
--
-- This migration purges today's and all future unperformed sessions so they
-- regenerate with the corrected 2-day window code on next app load.
-- Safe condition: no logged sets, session not performed, cardio not saved.

DELETE FROM public.plan_sessions
WHERE performed_at IS NULL
  AND cardio_saved_at IS NULL
  AND date >= CURRENT_DATE
  AND plan_session_id NOT IN (
    SELECT DISTINCT session_id
    FROM public.set_logs
    WHERE session_id IS NOT NULL
  );
