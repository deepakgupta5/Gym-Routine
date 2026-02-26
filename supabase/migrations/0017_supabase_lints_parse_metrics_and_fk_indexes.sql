-- ============================================================
-- 0017_supabase_lints_parse_metrics_and_fk_indexes.sql
-- Fixes Supabase DB lints:
-- 1) auth_rls_initplan on nutrition_parse_metrics policies
-- 2) unindexed FK hints for nutrition_plans.user_id and
--    nutrition_plan_meals.plan_id
-- ============================================================

-- Keep/ensure RLS enabled.
ALTER TABLE public.nutrition_parse_metrics ENABLE ROW LEVEL SECURITY;

-- Recreate policies using SELECT-wrapped auth.uid() to avoid per-row re-evaluation warnings.
DROP POLICY IF EXISTS npmt_select_own ON public.nutrition_parse_metrics;
CREATE POLICY npmt_select_own
  ON public.nutrition_parse_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS npmt_insert_own ON public.nutrition_parse_metrics;
CREATE POLICY npmt_insert_own
  ON public.nutrition_parse_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS npmt_update_own ON public.nutrition_parse_metrics;
CREATE POLICY npmt_update_own
  ON public.nutrition_parse_metrics
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS npmt_delete_own ON public.nutrition_parse_metrics;
CREATE POLICY npmt_delete_own
  ON public.nutrition_parse_metrics
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Add explicit single-column indexes for FK columns flagged by Supabase linter.
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_id
  ON public.nutrition_plans(user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_meals_plan_id
  ON public.nutrition_plan_meals(plan_id);
