-- Migration 0033: add target_sessions_per_week to user_profile
-- PRD Section 6.5: frequency override (default 4, range 3-6).
-- Existing rows receive the default value (4) automatically.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS target_sessions_per_week SMALLINT NOT NULL DEFAULT 4
    CONSTRAINT chk_target_sessions_range CHECK (target_sessions_per_week BETWEEN 3 AND 6);
