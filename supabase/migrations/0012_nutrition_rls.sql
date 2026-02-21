-- ============================================================
-- 0012_nutrition_rls.sql
-- Enables RLS and creates per-operation policies for all
-- nutrition tables. Pattern mirrors 0004/0005 for gym tables.
-- ============================================================

-- Enable RLS
ALTER TABLE public.nutrition_profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_goals_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_nutrition_rollups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_insights       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plan_meals     ENABLE ROW LEVEL SECURITY;

-- Revoke broad privileges
REVOKE ALL ON TABLE public.nutrition_profile       FROM anon, authenticated;
REVOKE ALL ON TABLE public.nutrition_goals_daily   FROM anon, authenticated;
REVOKE ALL ON TABLE public.meal_logs               FROM anon, authenticated;
REVOKE ALL ON TABLE public.meal_items              FROM anon, authenticated;
REVOKE ALL ON TABLE public.daily_nutrition_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.nutrition_insights      FROM anon, authenticated;
REVOKE ALL ON TABLE public.nutrition_plans         FROM anon, authenticated;
REVOKE ALL ON TABLE public.nutrition_plan_meals    FROM anon, authenticated;

-- ---- nutrition_profile ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_profile' AND policyname='np_select_own') THEN
    CREATE POLICY np_select_own ON public.nutrition_profile FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_profile' AND policyname='np_insert_own') THEN
    CREATE POLICY np_insert_own ON public.nutrition_profile FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_profile' AND policyname='np_update_own') THEN
    CREATE POLICY np_update_own ON public.nutrition_profile FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_profile' AND policyname='np_delete_own') THEN
    CREATE POLICY np_delete_own ON public.nutrition_profile FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- nutrition_goals_daily ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_goals_daily' AND policyname='ngd_select_own') THEN
    CREATE POLICY ngd_select_own ON public.nutrition_goals_daily FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_goals_daily' AND policyname='ngd_insert_own') THEN
    CREATE POLICY ngd_insert_own ON public.nutrition_goals_daily FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_goals_daily' AND policyname='ngd_update_own') THEN
    CREATE POLICY ngd_update_own ON public.nutrition_goals_daily FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_goals_daily' AND policyname='ngd_delete_own') THEN
    CREATE POLICY ngd_delete_own ON public.nutrition_goals_daily FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- meal_logs ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_logs' AND policyname='ml_select_own') THEN
    CREATE POLICY ml_select_own ON public.meal_logs FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_logs' AND policyname='ml_insert_own') THEN
    CREATE POLICY ml_insert_own ON public.meal_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_logs' AND policyname='ml_update_own') THEN
    CREATE POLICY ml_update_own ON public.meal_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_logs' AND policyname='ml_delete_own') THEN
    CREATE POLICY ml_delete_own ON public.meal_logs FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- meal_items (access via parent meal_log owned by same user) ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_items' AND policyname='mi_select_own') THEN
    CREATE POLICY mi_select_own ON public.meal_items FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM meal_logs ml WHERE ml.meal_log_id = meal_items.meal_log_id AND ml.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_items' AND policyname='mi_insert_own') THEN
    CREATE POLICY mi_insert_own ON public.meal_items FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM meal_logs ml WHERE ml.meal_log_id = meal_items.meal_log_id AND ml.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_items' AND policyname='mi_update_own') THEN
    CREATE POLICY mi_update_own ON public.meal_items FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM meal_logs ml WHERE ml.meal_log_id = meal_items.meal_log_id AND ml.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meal_items' AND policyname='mi_delete_own') THEN
    CREATE POLICY mi_delete_own ON public.meal_items FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM meal_logs ml WHERE ml.meal_log_id = meal_items.meal_log_id AND ml.user_id = auth.uid())); END IF;
END $$;

-- ---- daily_nutrition_rollups ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_nutrition_rollups' AND policyname='dnr_select_own') THEN
    CREATE POLICY dnr_select_own ON public.daily_nutrition_rollups FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_nutrition_rollups' AND policyname='dnr_insert_own') THEN
    CREATE POLICY dnr_insert_own ON public.daily_nutrition_rollups FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_nutrition_rollups' AND policyname='dnr_update_own') THEN
    CREATE POLICY dnr_update_own ON public.daily_nutrition_rollups FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='daily_nutrition_rollups' AND policyname='dnr_delete_own') THEN
    CREATE POLICY dnr_delete_own ON public.daily_nutrition_rollups FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- nutrition_insights ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_insights' AND policyname='ni_select_own') THEN
    CREATE POLICY ni_select_own ON public.nutrition_insights FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_insights' AND policyname='ni_insert_own') THEN
    CREATE POLICY ni_insert_own ON public.nutrition_insights FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_insights' AND policyname='ni_update_own') THEN
    CREATE POLICY ni_update_own ON public.nutrition_insights FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_insights' AND policyname='ni_delete_own') THEN
    CREATE POLICY ni_delete_own ON public.nutrition_insights FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- nutrition_plans ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plans' AND policyname='npl_select_own') THEN
    CREATE POLICY npl_select_own ON public.nutrition_plans FOR SELECT TO authenticated USING (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plans' AND policyname='npl_insert_own') THEN
    CREATE POLICY npl_insert_own ON public.nutrition_plans FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plans' AND policyname='npl_update_own') THEN
    CREATE POLICY npl_update_own ON public.nutrition_plans FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid()); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plans' AND policyname='npl_delete_own') THEN
    CREATE POLICY npl_delete_own ON public.nutrition_plans FOR DELETE TO authenticated USING (user_id = auth.uid()); END IF;
END $$;

-- ---- nutrition_plan_meals (access via parent nutrition_plans owned by same user) ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plan_meals' AND policyname='npm_select_own') THEN
    CREATE POLICY npm_select_own ON public.nutrition_plan_meals FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM nutrition_plans np WHERE np.plan_id = nutrition_plan_meals.plan_id AND np.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plan_meals' AND policyname='npm_insert_own') THEN
    CREATE POLICY npm_insert_own ON public.nutrition_plan_meals FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM nutrition_plans np WHERE np.plan_id = nutrition_plan_meals.plan_id AND np.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plan_meals' AND policyname='npm_update_own') THEN
    CREATE POLICY npm_update_own ON public.nutrition_plan_meals FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM nutrition_plans np WHERE np.plan_id = nutrition_plan_meals.plan_id AND np.user_id = auth.uid())); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_plan_meals' AND policyname='npm_delete_own') THEN
    CREATE POLICY npm_delete_own ON public.nutrition_plan_meals FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM nutrition_plans np WHERE np.plan_id = nutrition_plan_meals.plan_id AND np.user_id = auth.uid())); END IF;
END $$;
