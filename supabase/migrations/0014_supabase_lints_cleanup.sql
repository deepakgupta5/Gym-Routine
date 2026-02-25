-- ============================================================
-- 0014_supabase_lints_cleanup.sql
-- Resolves Supabase lints:
--  - auth_rls_initplan (wrap auth.uid() in SELECT in RLS predicates)
--  - unindexed_foreign_keys (add covering FK indexes)
--  - unused_index (drop currently unused indexes flagged by advisor)
-- ============================================================

-- ---------- FK covering indexes ----------
CREATE INDEX IF NOT EXISTS idx_exercises_alt_1_exercise_id
  ON public.exercises(alt_1_exercise_id);

CREATE INDEX IF NOT EXISTS idx_exercises_alt_2_exercise_id
  ON public.exercises(alt_2_exercise_id);

CREATE INDEX IF NOT EXISTS idx_plan_sessions_block_id
  ON public.plan_sessions(block_id);

CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_id
  ON public.set_logs(exercise_id);

CREATE INDEX IF NOT EXISTS idx_top_set_history_exercise_id
  ON public.top_set_history(exercise_id);

-- ---------- RLS init-plan optimization ----------
DO $$
DECLARE
  rec RECORD;
  pol TEXT;
BEGIN
  -- Tables with direct user_id ownership predicates
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('blocks', 'blocks'),
        ('body_stats_daily', 'body_stats_daily'),
        ('user_profile', 'user_profile'),
        ('plan_sessions', 'plan_sessions'),
        ('weekly_rollups', 'weekly_rollups'),
        ('set_logs', 'set_logs'),
        ('top_set_history', 'top_set_history'),
        ('nutrition_profile', 'np'),
        ('nutrition_goals_daily', 'ngd'),
        ('meal_logs', 'ml'),
        ('daily_nutrition_rollups', 'dnr'),
        ('nutrition_insights', 'ni'),
        ('nutrition_plans', 'npl')
    ) AS t(tablename, policy_prefix)
  LOOP
    pol := rec.policy_prefix || '_select_own';
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tablename AND policyname = pol
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (user_id = (select auth.uid()))',
        pol,
        rec.tablename
      );
    END IF;

    pol := rec.policy_prefix || '_insert_own';
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tablename AND policyname = pol
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (user_id = (select auth.uid()))',
        pol,
        rec.tablename
      );
    END IF;

    pol := rec.policy_prefix || '_update_own';
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tablename AND policyname = pol
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))',
        pol,
        rec.tablename
      );
    END IF;

    pol := rec.policy_prefix || '_delete_own';
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tablename AND policyname = pol
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (user_id = (select auth.uid()))',
        pol,
        rec.tablename
      );
    END IF;
  END LOOP;

  -- plan_exercises policies (ownership through parent plan_sessions)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_exercises' AND policyname='plan_exercises_select_own') THEN
    ALTER POLICY plan_exercises_select_own ON public.plan_exercises
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_exercises' AND policyname='plan_exercises_insert_own') THEN
    ALTER POLICY plan_exercises_insert_own ON public.plan_exercises
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_exercises' AND policyname='plan_exercises_update_own') THEN
    ALTER POLICY plan_exercises_update_own ON public.plan_exercises
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = (select auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_exercises' AND policyname='plan_exercises_delete_own') THEN
    ALTER POLICY plan_exercises_delete_own ON public.plan_exercises
      USING (
        EXISTS (
          SELECT 1
          FROM public.plan_sessions ps
          WHERE ps.plan_session_id = plan_exercises.plan_session_id
            AND ps.user_id = (select auth.uid())
        )
      );
  END IF;

  -- meal_items policies (ownership through parent meal_logs)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meal_items' AND policyname='mi_select_own') THEN
    ALTER POLICY mi_select_own ON public.meal_items
      USING (
        EXISTS (
          SELECT 1
          FROM public.meal_logs ml
          WHERE ml.meal_log_id = meal_items.meal_log_id
            AND ml.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meal_items' AND policyname='mi_insert_own') THEN
    ALTER POLICY mi_insert_own ON public.meal_items
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.meal_logs ml
          WHERE ml.meal_log_id = meal_items.meal_log_id
            AND ml.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meal_items' AND policyname='mi_update_own') THEN
    ALTER POLICY mi_update_own ON public.meal_items
      USING (
        EXISTS (
          SELECT 1
          FROM public.meal_logs ml
          WHERE ml.meal_log_id = meal_items.meal_log_id
            AND ml.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='meal_items' AND policyname='mi_delete_own') THEN
    ALTER POLICY mi_delete_own ON public.meal_items
      USING (
        EXISTS (
          SELECT 1
          FROM public.meal_logs ml
          WHERE ml.meal_log_id = meal_items.meal_log_id
            AND ml.user_id = (select auth.uid())
        )
      );
  END IF;

  -- nutrition_plan_meals policies (ownership through parent nutrition_plans)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nutrition_plan_meals' AND policyname='npm_select_own') THEN
    ALTER POLICY npm_select_own ON public.nutrition_plan_meals
      USING (
        EXISTS (
          SELECT 1
          FROM public.nutrition_plans np
          WHERE np.plan_id = nutrition_plan_meals.plan_id
            AND np.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nutrition_plan_meals' AND policyname='npm_insert_own') THEN
    ALTER POLICY npm_insert_own ON public.nutrition_plan_meals
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.nutrition_plans np
          WHERE np.plan_id = nutrition_plan_meals.plan_id
            AND np.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nutrition_plan_meals' AND policyname='npm_update_own') THEN
    ALTER POLICY npm_update_own ON public.nutrition_plan_meals
      USING (
        EXISTS (
          SELECT 1
          FROM public.nutrition_plans np
          WHERE np.plan_id = nutrition_plan_meals.plan_id
            AND np.user_id = (select auth.uid())
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nutrition_plan_meals' AND policyname='npm_delete_own') THEN
    ALTER POLICY npm_delete_own ON public.nutrition_plan_meals
      USING (
        EXISTS (
          SELECT 1
          FROM public.nutrition_plans np
          WHERE np.plan_id = nutrition_plan_meals.plan_id
            AND np.user_id = (select auth.uid())
        )
      );
  END IF;
END
$$;

-- ---------- Drop currently unused indexes flagged by advisor ----------
DROP INDEX IF EXISTS public.idx_nutrition_insights_user_date;
DROP INDEX IF EXISTS public.idx_nutrition_plans_user_date;
DROP INDEX IF EXISTS public.idx_system_jobs_last_run_at;
DROP INDEX IF EXISTS public.idx_nutrition_plan_meals_plan;
