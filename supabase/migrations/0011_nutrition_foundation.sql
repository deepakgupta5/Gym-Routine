-- ============================================================
-- 0011_nutrition_foundation.sql
-- Creates all nutrition tables with constraints and indexes.
-- No image/photo/blob/base64 columns anywhere by design.
-- User IDs are FK references only; no hardcoded UUIDs.
-- ============================================================

-- ---------- nutrition_profile (one row per user) ----------
CREATE TABLE IF NOT EXISTS nutrition_profile (
  user_id          uuid PRIMARY KEY REFERENCES user_profile(user_id) ON DELETE CASCADE,
  age              int  NOT NULL CHECK (age > 0 AND age < 130),
  height_cm        numeric NOT NULL CHECK (height_cm > 0),
  sex              text NOT NULL CHECK (sex IN ('male','female','other')),
  nutrition_goal   text NOT NULL DEFAULT 'cut' CHECK (nutrition_goal IN ('cut','maintain','bulk')),
  allowed_proteins jsonb NOT NULL DEFAULT '["chicken","shrimp","eggs","dairy","plant"]'::jsonb,
  allergies        jsonb NOT NULL DEFAULT '[]'::jsonb,
  meal_pattern     jsonb NOT NULL DEFAULT '["breakfast","lunch","dinner","snack"]'::jsonb,
  tdee_calculated  numeric NULL CHECK (tdee_calculated IS NULL OR tdee_calculated > 0),
  tdee_override    numeric NULL CHECK (tdee_override   IS NULL OR tdee_override > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

-- ---------- nutrition_goals_daily (daily targets, versioned by date) ----------
-- Change control: when user updates targets, only FUTURE rows are regenerated.
-- Past rows are frozen so historical trend charts remain accurate.
CREATE TABLE IF NOT EXISTS nutrition_goals_daily (
  user_id              uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  goal_date            date NOT NULL,
  is_training_day      boolean NOT NULL DEFAULT false,
  target_calories      numeric NOT NULL DEFAULT 2050 CHECK (target_calories >= 0),
  target_protein_g     numeric NOT NULL DEFAULT 160  CHECK (target_protein_g >= 0),
  target_carbs_g       numeric NOT NULL DEFAULT 0    CHECK (target_carbs_g >= 0),
  target_fat_g         numeric NOT NULL DEFAULT 70   CHECK (target_fat_g >= 0),
  target_fiber_g       numeric NOT NULL DEFAULT 30   CHECK (target_fiber_g >= 0),
  target_sugar_g_max   numeric NOT NULL DEFAULT 45   CHECK (target_sugar_g_max >= 0),
  target_sodium_mg_max numeric NOT NULL DEFAULT 2300 CHECK (target_sodium_mg_max >= 0),
  target_iron_mg       numeric NOT NULL DEFAULT 8    CHECK (target_iron_mg >= 0),
  target_vitamin_d_mcg numeric NOT NULL DEFAULT 15   CHECK (target_vitamin_d_mcg >= 0),
  target_water_ml      numeric NOT NULL DEFAULT 3000 CHECK (target_water_ml >= 0),
  PRIMARY KEY (user_id, goal_date)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_goals_daily_user_date
  ON nutrition_goals_daily(user_id, goal_date DESC);

-- ---------- meal_logs (one row per meal event) ----------
CREATE TABLE IF NOT EXISTS meal_logs (
  meal_log_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  meal_date    date NOT NULL,
  meal_type    text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  raw_input    text NULL,           -- what user typed; NULL for photo-only or manual
  input_mode   text NOT NULL CHECK (input_mode IN ('text','photo','text_photo','manual')),
  ai_model     text NULL,           -- NULL for manual entries
  ai_confidence numeric NULL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  notes        text NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date
  ON meal_logs(user_id, meal_date DESC);

-- ---------- meal_items (parsed food items per meal) ----------
CREATE TABLE IF NOT EXISTS meal_items (
  meal_item_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_log_id    uuid NOT NULL REFERENCES meal_logs(meal_log_id) ON DELETE CASCADE,
  item_name      text NOT NULL,
  quantity       numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit           text NOT NULL DEFAULT 'serving',
  -- macros
  calories       numeric NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein_g      numeric NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g        numeric NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g          numeric NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  fiber_g        numeric NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  -- micronutrients
  sugar_g        numeric NOT NULL DEFAULT 0 CHECK (sugar_g >= 0),
  sodium_mg      numeric NOT NULL DEFAULT 0 CHECK (sodium_mg >= 0),
  iron_mg        numeric NOT NULL DEFAULT 0 CHECK (iron_mg >= 0),
  calcium_mg     numeric NOT NULL DEFAULT 0 CHECK (calcium_mg >= 0),
  vitamin_d_mcg  numeric NOT NULL DEFAULT 0 CHECK (vitamin_d_mcg >= 0),
  vitamin_c_mg   numeric NOT NULL DEFAULT 0 CHECK (vitamin_c_mg >= 0),
  potassium_mg   numeric NOT NULL DEFAULT 0 CHECK (potassium_mg >= 0),
  -- provenance (mandatory)
  source         text NOT NULL CHECK (source IN ('ai','manual')),
  confidence     numeric NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  is_user_edited boolean NOT NULL DEFAULT false,
  sort_order     int NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_log
  ON meal_items(meal_log_id, sort_order);

-- ---------- daily_nutrition_rollups (materialized daily totals) ----------
CREATE TABLE IF NOT EXISTS daily_nutrition_rollups (
  user_id             uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  rollup_date         date NOT NULL,
  total_calories      numeric NOT NULL DEFAULT 0 CHECK (total_calories >= 0),
  total_protein_g     numeric NOT NULL DEFAULT 0 CHECK (total_protein_g >= 0),
  total_carbs_g       numeric NOT NULL DEFAULT 0 CHECK (total_carbs_g >= 0),
  total_fat_g         numeric NOT NULL DEFAULT 0 CHECK (total_fat_g >= 0),
  total_fiber_g       numeric NOT NULL DEFAULT 0 CHECK (total_fiber_g >= 0),
  total_sugar_g       numeric NOT NULL DEFAULT 0 CHECK (total_sugar_g >= 0),
  total_sodium_mg     numeric NOT NULL DEFAULT 0 CHECK (total_sodium_mg >= 0),
  total_iron_mg       numeric NOT NULL DEFAULT 0 CHECK (total_iron_mg >= 0),
  total_calcium_mg    numeric NOT NULL DEFAULT 0 CHECK (total_calcium_mg >= 0),
  total_vitamin_d_mcg numeric NOT NULL DEFAULT 0 CHECK (total_vitamin_d_mcg >= 0),
  total_vitamin_c_mg  numeric NOT NULL DEFAULT 0 CHECK (total_vitamin_c_mg >= 0),
  total_potassium_mg  numeric NOT NULL DEFAULT 0 CHECK (total_potassium_mg >= 0),
  water_ml            numeric NOT NULL DEFAULT 0 CHECK (water_ml >= 0),
  meal_count          int NOT NULL DEFAULT 0 CHECK (meal_count >= 0),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rollup_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_nutrition_rollups_user_date
  ON daily_nutrition_rollups(user_id, rollup_date DESC);

-- ---------- nutrition_insights ----------
CREATE TABLE IF NOT EXISTS nutrition_insights (
  insight_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  insight_type        text NOT NULL CHECK (insight_type IN ('deficiency_alert','coaching','supplement')),
  generated_at        timestamptz NOT NULL DEFAULT now(),
  context_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation_text text NOT NULL,
  is_dismissed        boolean NOT NULL DEFAULT false,
  dismissed_at        timestamptz NULL
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

CREATE INDEX IF NOT EXISTS idx_nutrition_insights_user_date
  ON nutrition_insights(user_id, generated_at DESC, is_dismissed);

-- ---------- nutrition_plans ----------
CREATE TABLE IF NOT EXISTS nutrition_plans (
  plan_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  plan_date        date NOT NULL,
  target_calories  numeric NOT NULL CHECK (target_calories >= 0),
  target_protein_g numeric NOT NULL CHECK (target_protein_g >= 0),
  constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  ai_model         text NOT NULL
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_date
  ON nutrition_plans(user_id, plan_date DESC);

-- ---------- nutrition_plan_meals ----------
CREATE TABLE IF NOT EXISTS nutrition_plan_meals (
  plan_meal_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES nutrition_plans(plan_id) ON DELETE CASCADE,
  meal_type        text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  description      text NOT NULL,
  items_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_calories   numeric NOT NULL DEFAULT 0 CHECK (total_calories >= 0),
  total_protein_g  numeric NOT NULL DEFAULT 0 CHECK (total_protein_g >= 0),
  total_carbs_g    numeric NOT NULL DEFAULT 0 CHECK (total_carbs_g >= 0),
  total_fat_g      numeric NOT NULL DEFAULT 0 CHECK (total_fat_g >= 0)
  -- HARD BAN: no photo_url, photo_blob, image_base64, or any image column here or below
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_meals_plan
  ON nutrition_plan_meals(plan_id, meal_type);

-- ---------- unique index for insights upsert deduplication (Sprint 4) ----------
-- Required by GET /api/nutrition/insights ON CONFLICT clause.
-- Use immutable UTC-date helper because timestamptz::date is not immutable.
CREATE OR REPLACE FUNCTION public.utc_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ts AT TIME ZONE 'UTC')::date
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_user_type_day
  ON nutrition_insights(user_id, insight_type, (public.utc_date(generated_at)));
