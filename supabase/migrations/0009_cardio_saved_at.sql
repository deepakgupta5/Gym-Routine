alter table public.plan_sessions
  add column if not exists cardio_saved_at timestamptz;
