-- 0021_fix_missing_session_type_enum_values.sql
-- Adds the v1 rolling-scheduler session_type values that were defined in
-- 0018_scheduler_integration.sql but never applied to production.
-- Without these, plan_sessions INSERTs with session_type in
-- {push,pull,squat,hinge,mixed} fail silently, preventing new session generation.

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'push';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'pull';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'squat';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'hinge';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE session_type_enum ADD VALUE 'mixed';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
