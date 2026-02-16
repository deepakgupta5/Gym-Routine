-- Extensions
create extension if not exists pgcrypto;

-- Enums
DO $$ BEGIN
  CREATE TYPE session_type_enum AS ENUM ('Mon','Tue','Wed','Thu','Fri','Sat','Sun');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_role_enum AS ENUM ('primary','secondary','accessory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE set_type_enum AS ENUM ('top','backoff','straight','accessory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE load_semantic_enum AS ENUM ('normal','assistance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USER PROFILE
CREATE TABLE IF NOT EXISTS user_profile (
  user_id uuid PRIMARY KEY,
  start_date date NOT NULL,
  block_id uuid NOT NULL,
  current_block_week int NOT NULL CHECK (current_block_week BETWEEN 1 AND 8),
  bias_balance int NOT NULL DEFAULT 0 CHECK (bias_balance BETWEEN -4 AND 4),
  adaptive_enabled boolean NOT NULL DEFAULT false,
  primary_lift_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  secondary_lift_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  progression_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  rest_inserted_by_week jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BLOCKS
CREATE TABLE IF NOT EXISTS blocks (
  block_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  generation_rules_hash text NOT NULL,
  pending_bias_balance int NULL CHECK (pending_bias_balance BETWEEN -4 AND 4),
  pending_cardio_rule jsonb NULL,
  pending_reason text NULL,
  pending_computed_at timestamptz NULL,
  pending_applied boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_blocks_user_created ON blocks(user_id, created_at DESC);

-- EXERCISES
CREATE TABLE IF NOT EXISTS exercises (
  exercise_id int PRIMARY KEY,
  name text NOT NULL,
  movement_pattern text NOT NULL,
  default_targeted_primary_muscle text NOT NULL,
  default_targeted_secondary_muscle text NULL,
  equipment_type text NOT NULL,
  load_increment text NOT NULL,
  load_increment_lb numeric NOT NULL,
  load_semantic load_semantic_enum NOT NULL DEFAULT 'normal',
  alt_1_exercise_id int NULL REFERENCES exercises(exercise_id),
  alt_2_exercise_id int NULL REFERENCES exercises(exercise_id)
);

-- PLAN SESSIONS
CREATE TABLE IF NOT EXISTS plan_sessions (
  plan_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES blocks(block_id) ON DELETE CASCADE,
  week_in_block int NOT NULL CHECK (week_in_block BETWEEN 1 AND 8),
  date date NOT NULL,
  session_type session_type_enum NOT NULL,
  is_required boolean NOT NULL,
  is_deload boolean NOT NULL,
  cardio_minutes int NOT NULL DEFAULT 0 CHECK (cardio_minutes >= 0),
  conditioning_minutes int NOT NULL DEFAULT 0 CHECK (conditioning_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_sessions_identity
  ON plan_sessions(user_id, block_id, session_type, date);

CREATE INDEX IF NOT EXISTS idx_plan_sessions_user_date
  ON plan_sessions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_plan_sessions_user_block_week
  ON plan_sessions(user_id, block_id, week_in_block);

-- PLAN EXERCISES
CREATE TABLE IF NOT EXISTS plan_exercises (
  plan_exercise_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid NOT NULL REFERENCES plan_sessions(plan_session_id) ON DELETE CASCADE,
  exercise_id int NOT NULL REFERENCES exercises(exercise_id),
  targeted_primary_muscle text NOT NULL,
  targeted_secondary_muscle text NULL,
  role plan_role_enum NOT NULL,
  prescribed_sets int NOT NULL CHECK (prescribed_sets BETWEEN 1 AND 10),
  prescribed_reps_min int NOT NULL CHECK (prescribed_reps_min >= 1),
  prescribed_reps_max int NOT NULL CHECK (prescribed_reps_max >= prescribed_reps_min),
  prescribed_load numeric NOT NULL CHECK (prescribed_load >= 0),
  backoff_percent numeric NULL CHECK (backoff_percent IS NULL OR (backoff_percent > 0 AND backoff_percent < 1)),
  rest_seconds int NOT NULL CHECK (rest_seconds >= 0),
  tempo text NOT NULL,
  previous_performance_id uuid NULL,
  prev_load numeric NULL,
  prev_reps int NULL,
  prev_performed_at timestamptz NULL,
  prev_estimated_1rm numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_exercises_identity
  ON plan_exercises(plan_session_id, exercise_id);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_session
  ON plan_exercises(plan_session_id);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise
  ON plan_exercises(exercise_id);

-- SET LOGS
CREATE TABLE IF NOT EXISTS set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  performed_at timestamptz NOT NULL,
  session_id uuid NULL REFERENCES plan_sessions(plan_session_id) ON DELETE SET NULL,
  exercise_id int NOT NULL REFERENCES exercises(exercise_id),
  movement_pattern text NOT NULL,
  targeted_primary_muscle text NOT NULL,
  targeted_secondary_muscle text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_secondary boolean NOT NULL DEFAULT false,
  set_type set_type_enum NOT NULL,
  set_index int NOT NULL CHECK (set_index >= 1),
  load numeric NOT NULL CHECK (load >= 0),
  reps int NOT NULL CHECK (reps >= 0),
  rpe numeric NULL CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  notes text NULL
);

CREATE INDEX IF NOT EXISTS idx_set_logs_user_performed
  ON set_logs(user_id, performed_at);

CREATE INDEX IF NOT EXISTS idx_set_logs_user_exercise_performed
  ON set_logs(user_id, exercise_id, performed_at);

-- TOP SET HISTORY
CREATE TABLE IF NOT EXISTS top_set_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  performed_at timestamptz NOT NULL,
  exercise_id int NOT NULL REFERENCES exercises(exercise_id),
  load numeric NOT NULL CHECK (load >= 0),
  reps int NOT NULL CHECK (reps >= 0),
  estimated_1rm numeric NOT NULL CHECK (estimated_1rm >= 0),
  block_id uuid NULL,
  week_in_block int NULL CHECK (week_in_block IS NULL OR (week_in_block BETWEEN 1 AND 8)),
  bias_balance_at_time int NOT NULL CHECK (bias_balance_at_time BETWEEN -4 AND 4),
  source_set_log_id uuid UNIQUE NULL REFERENCES set_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_top_set_user_exercise_performed
  ON top_set_history(user_id, exercise_id, performed_at);

-- WEEKLY ROLLUPS
CREATE TABLE IF NOT EXISTS weekly_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  total_sets int NOT NULL DEFAULT 0,
  total_reps int NOT NULL DEFAULT 0,
  total_tonnage numeric NOT NULL DEFAULT 0,
  sets_by_muscle jsonb NOT NULL DEFAULT '{}'::jsonb,
  tonnage_by_muscle jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_sets_by_muscle jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_sets_count int NOT NULL DEFAULT 0,
  conditioning_minutes int NOT NULL DEFAULT 0,
  cardio_minutes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date)
);

-- BODY STATS DAILY
CREATE TABLE IF NOT EXISTS body_stats_daily (
  user_id uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  date date NOT NULL,
  weight_lb numeric NOT NULL CHECK (weight_lb > 0),
  bodyfat_pct numeric NULL CHECK (bodyfat_pct IS NULL OR (bodyfat_pct >= 0 AND bodyfat_pct <= 100)),
  upper_pct numeric NULL CHECK (upper_pct IS NULL OR (upper_pct >= 0 AND upper_pct <= 100)),
  lower_pct numeric NULL CHECK (lower_pct IS NULL OR (lower_pct >= 0 AND lower_pct <= 100)),
  source_upload_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_body_stats_user_date
  ON body_stats_daily(user_id, date);
