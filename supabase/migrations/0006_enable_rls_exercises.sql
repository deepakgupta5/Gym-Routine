-- Enable RLS on catalog table exposed via PostgREST
alter table public.exercises enable row level security;

-- Lock down API access: no anon access, authenticated read-only
revoke all on table public.exercises from anon;
revoke all on table public.exercises from authenticated;
grant select on table public.exercises to authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exercises'
      AND policyname = 'exercises_select_authenticated'
  ) THEN
    CREATE POLICY exercises_select_authenticated
      ON public.exercises
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END
$$;
