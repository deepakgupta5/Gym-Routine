-- Enable RLS on public tables exposed via PostgREST
alter table public.blocks enable row level security;
alter table public.body_stats_daily enable row level security;

-- Restrict broad table privileges for client API roles
revoke all on table public.blocks from anon, authenticated;
revoke all on table public.body_stats_daily from anon, authenticated;

-- blocks policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'blocks'
      AND policyname = 'blocks_select_own'
  ) THEN
    CREATE POLICY blocks_select_own
      ON public.blocks
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'blocks'
      AND policyname = 'blocks_insert_own'
  ) THEN
    CREATE POLICY blocks_insert_own
      ON public.blocks
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'blocks'
      AND policyname = 'blocks_update_own'
  ) THEN
    CREATE POLICY blocks_update_own
      ON public.blocks
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'blocks'
      AND policyname = 'blocks_delete_own'
  ) THEN
    CREATE POLICY blocks_delete_own
      ON public.blocks
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

-- body_stats_daily policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'body_stats_daily'
      AND policyname = 'body_stats_daily_select_own'
  ) THEN
    CREATE POLICY body_stats_daily_select_own
      ON public.body_stats_daily
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'body_stats_daily'
      AND policyname = 'body_stats_daily_insert_own'
  ) THEN
    CREATE POLICY body_stats_daily_insert_own
      ON public.body_stats_daily
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'body_stats_daily'
      AND policyname = 'body_stats_daily_update_own'
  ) THEN
    CREATE POLICY body_stats_daily_update_own
      ON public.body_stats_daily
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'body_stats_daily'
      AND policyname = 'body_stats_daily_delete_own'
  ) THEN
    CREATE POLICY body_stats_daily_delete_own
      ON public.body_stats_daily
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;
