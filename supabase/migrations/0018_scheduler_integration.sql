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

ALTER TABLE public.plan_exercises
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.completed_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profile(user_id) ON DELETE CASCADE,
  session_id uuid NOT NULL UNIQUE REFERENCES public.plan_sessions(plan_session_id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  emphasis text NOT NULL CHECK (emphasis IN ('push', 'pull', 'squat', 'hinge', 'mixed')),
  leg_dominant boolean NOT NULL DEFAULT false,
  completed_exercise_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped_exercise_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cardio_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_completed_workouts_user_completed_at
  ON public.completed_workouts(user_id, completed_at DESC);
