ALTER TABLE plan_exercises
  ADD COLUMN IF NOT EXISTS next_target_load numeric NULL;
