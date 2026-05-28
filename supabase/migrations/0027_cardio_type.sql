-- 0027_cardio_type.sql
-- Add cardio_type to plan_sessions so users can log Zone 2 vs HIIT.
-- zone2  = steady-state moderate intensity (incline walk, cycling, rowing)
-- hiit   = 30s on / 90s off intervals
-- Defaults to 'zone2' for all existing rows.

ALTER TABLE public.plan_sessions
  ADD COLUMN IF NOT EXISTS cardio_type text NOT NULL DEFAULT 'zone2'
    CONSTRAINT plan_sessions_cardio_type_check
      CHECK (cardio_type IN ('zone2', 'hiit'));
