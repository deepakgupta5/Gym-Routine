-- Migration 0025: composite index on set_logs(session_id, exercise_id)
-- Used in loadSessionExerciseCounts and skip-exercise log check.
-- The existing idx_set_logs_session covers session_id alone; this composite
-- index avoids the heap fetch for exercise_id filtering.
CREATE INDEX IF NOT EXISTS idx_set_logs_session_exercise
  ON set_logs(session_id, exercise_id);
