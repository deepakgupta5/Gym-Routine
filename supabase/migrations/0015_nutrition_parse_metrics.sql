-- ============================================================
-- 0015_nutrition_parse_metrics.sql
-- Stores parse-duration telemetry for rolling 7-day p95 SLO checks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nutrition_parse_metrics (
  metric_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.user_profile(user_id) ON DELETE CASCADE,
  endpoint          text NOT NULL CHECK (endpoint IN ('log', 'log_preview', 'log_photo')),
  parse_duration_ms int NOT NULL CHECK (parse_duration_ms >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_parse_metrics_user_created
  ON public.nutrition_parse_metrics(user_id, created_at DESC);

ALTER TABLE public.nutrition_parse_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_parse_metrics' AND policyname='npmt_select_own') THEN
    CREATE POLICY npmt_select_own ON public.nutrition_parse_metrics FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_parse_metrics' AND policyname='npmt_insert_own') THEN
    CREATE POLICY npmt_insert_own ON public.nutrition_parse_metrics FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_parse_metrics' AND policyname='npmt_update_own') THEN
    CREATE POLICY npmt_update_own ON public.nutrition_parse_metrics FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nutrition_parse_metrics' AND policyname='npmt_delete_own') THEN
    CREATE POLICY npmt_delete_own ON public.nutrition_parse_metrics FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
