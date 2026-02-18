-- Remaining public tables flagged by Supabase Security Advisor
alter table public.user_profile enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.system_jobs enable row level security;
alter table public.top_set_history enable row level security;
alter table public.weekly_rollups enable row level security;

-- Lock down direct API table grants (server-side app uses direct PG connection)
revoke all on table public.user_profile from anon, authenticated;
revoke all on table public.plan_sessions from anon, authenticated;
revoke all on table public.plan_exercises from anon, authenticated;
revoke all on table public.set_logs from anon, authenticated;
revoke all on table public.system_jobs from anon, authenticated;
revoke all on table public.top_set_history from anon, authenticated;
revoke all on table public.weekly_rollups from anon, authenticated;

-- user_profile policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'user_profile_select_own'
  ) THEN
    CREATE POLICY user_profile_select_own
      ON public.user_profile
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'user_profile_insert_own'
  ) THEN
    CREATE POLICY user_profile_insert_own
      ON public.user_profile
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'user_profile_update_own'
  ) THEN
    CREATE POLICY user_profile_update_own
      ON public.user_profile
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'user_profile_delete_own'
  ) THEN
    CREATE POLICY user_profile_delete_own
      ON public.user_profile
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- plan_sessions policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_sessions' AND policyname = 'plan_sessions_select_own'
  ) THEN
    CREATE POLICY plan_sessions_select_own
      ON public.plan_sessions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_sessions' AND policyname = 'plan_sessions_insert_own'
  ) THEN
    CREATE POLICY plan_sessions_insert_own
      ON public.plan_sessions
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_sessions' AND policyname = 'plan_sessions_update_own'
  ) THEN
    CREATE POLICY plan_sessions_update_own
      ON public.plan_sessions
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_sessions' AND policyname = 'plan_sessions_delete_own'
  ) THEN
    CREATE POLICY plan_sessions_delete_own
      ON public.plan_sessions
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- plan_exercises policies via owning plan_session
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_exercises' AND policyname = 'plan_exercises_select_own'
  ) THEN
    CREATE POLICY plan_exercises_select_own
      ON public.plan_exercises
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_exercises' AND policyname = 'plan_exercises_insert_own'
  ) THEN
    CREATE POLICY plan_exercises_insert_own
      ON public.plan_exercises
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_exercises' AND policyname = 'plan_exercises_update_own'
  ) THEN
    CREATE POLICY plan_exercises_update_own
      ON public.plan_exercises
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_exercises' AND policyname = 'plan_exercises_delete_own'
  ) THEN
    CREATE POLICY plan_exercises_delete_own
      ON public.plan_exercises
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- set_logs policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs' AND policyname = 'set_logs_select_own'
  ) THEN
    CREATE POLICY set_logs_select_own
      ON public.set_logs
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs' AND policyname = 'set_logs_insert_own'
  ) THEN
    CREATE POLICY set_logs_insert_own
      ON public.set_logs
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs' AND policyname = 'set_logs_update_own'
  ) THEN
    CREATE POLICY set_logs_update_own
      ON public.set_logs
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs' AND policyname = 'set_logs_delete_own'
  ) THEN
    CREATE POLICY set_logs_delete_own
      ON public.set_logs
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- top_set_history policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'top_set_history' AND policyname = 'top_set_history_select_own'
  ) THEN
    CREATE POLICY top_set_history_select_own
      ON public.top_set_history
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'top_set_history' AND policyname = 'top_set_history_insert_own'
  ) THEN
    CREATE POLICY top_set_history_insert_own
      ON public.top_set_history
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'top_set_history' AND policyname = 'top_set_history_update_own'
  ) THEN
    CREATE POLICY top_set_history_update_own
      ON public.top_set_history
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'top_set_history' AND policyname = 'top_set_history_delete_own'
  ) THEN
    CREATE POLICY top_set_history_delete_own
      ON public.top_set_history
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- weekly_rollups policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_rollups' AND policyname = 'weekly_rollups_select_own'
  ) THEN
    CREATE POLICY weekly_rollups_select_own
      ON public.weekly_rollups
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_rollups' AND policyname = 'weekly_rollups_insert_own'
  ) THEN
    CREATE POLICY weekly_rollups_insert_own
      ON public.weekly_rollups
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_rollups' AND policyname = 'weekly_rollups_update_own'
  ) THEN
    CREATE POLICY weekly_rollups_update_own
      ON public.weekly_rollups
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_rollups' AND policyname = 'weekly_rollups_delete_own'
  ) THEN
    CREATE POLICY weekly_rollups_delete_own
      ON public.weekly_rollups
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- system_jobs intentionally has no client policies (deny by default under RLS)
