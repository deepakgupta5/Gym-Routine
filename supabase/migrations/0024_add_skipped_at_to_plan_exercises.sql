-- Migration 0024: add skipped_at to plan_exercises
-- Migration 0018 contained this DDL but it did not land in production.
-- Using IF NOT EXISTS so this is safe to re-run.

ALTER TABLE plan_exercises
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz NULL;
