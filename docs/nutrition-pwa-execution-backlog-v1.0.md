# Nutrition + Training PWA — Final Execution-Ready Backlog

**Version:** 1.0 | **Date:** February 21, 2026 | **Type:** Single Integrated PWA
**Repo root:** `/Users/deepakgupta/Documents/AI Projects/Gym Routine`

---

## Table of Contents

1. [Locked Product Constraints](#1-locked-product-constraints)
2. [Repo Baseline State](#2-repo-baseline-state)
3. [Migration Files — Full SQL DDL](#3-migration-files--full-sql-ddl)
4. [New Environment Variable](#4-new-environment-variable)
5. [Endpoint Contracts — Full Specification](#5-endpoint-contracts--full-specification)
6. [Sprint Backlog](#6-sprint-backlog)
7. [Implementation Contracts per File](#7-implementation-contracts-per-file)
8. [Validation & Acceptance Matrix](#8-validation--acceptance-matrix)
9. [Definition of Done](#9-definition-of-done)
10. [Cross-Cutting Rules Reference](#10-cross-cutting-rules-reference)

---

## 1. Locked Product Constraints

These constraints are non-negotiable and must be enforced at every layer (SQL check, API validation, AI prompt, UI guard):

| Constraint | Value |
|---|---|
| Allowed protein sources | `chicken`, `shrimp`, `eggs`, `dairy`, `plant` |
| Forbidden protein sources | `fish`, `beef`, `lamb`, `pork`, `goat` |
| Training day calories | 2,200 kcal |
| Rest / deload day calories | 2,050 kcal |
| Protein target (both days) | 160 g |
| Fat target (both days) | 70 g |
| Fiber minimum | 30 g |
| Added sugar maximum | 45 g |
| Sodium maximum | 2,300 mg |
| Iron minimum | 8 mg |
| Vitamin D minimum | 15 mcg |
| Water minimum | 3,000 ml (3.0 L) |
| Photo persistence | **Hard ban** — no photo/image/blob/base64 column anywhere |
| User ID source | Always `CONFIG.SINGLE_USER_ID` resolved at runtime; never hardcoded in SQL or migrations |
| Training-day sync | Queries must filter by active `block_id` from `user_profile.block_id` |
| AI keys | `OPENAI_API_KEY` server-side only; never in client bundle |

---

## 1.1 Ambiguity Resolutions (Normative)

## 1.2 Compliance Patch Notes (2026-02-24)

The following implementation-level contracts were added to close open compliance gaps:

- AI review-before-save flow:
  - New parse-preview endpoint: `POST /api/nutrition/log-preview`
  - Save-reviewed mode on canonical log endpoint: `save_mode='ai_reviewed'` on `POST /api/nutrition/log`
  - UI now requires parsed item review/edit before final save for AI text flow.

- Manual fallback non-blocking:
  - Manual save no longer requires non-zero macro/calorie values.
  - Required fields are item name + valid non-negative nutrient numbers (including zeros).

- Water intake tracking:
  - New endpoint: `POST /api/nutrition/water` with `{ date, water_ml }`
  - Nutrition Today UI includes water input and save action.

- Training-day sync with skip-day handling:
  - `syncTrainingDay` now treats dates in `user_profile.skipped_dates` as rest-day nutrition targets.

- Evidence tests added:
  - `tests/api/nutritionLogPreview.test.ts`
  - `tests/api/nutritionReadEndpoints.test.ts`
  - `tests/api/nutritionWater.test.ts`


The following definitions are binding and remove ambiguity in the original wording:

### A. Parse Response Time (`Response time < 3 seconds`)
- Scope: AI parse stage only (`/api/nutrition/log` for `save_mode='ai_parse'`, and `/api/nutrition/log-photo`).
- Measurement: `parse_duration_ms` measured inside API handler around the OpenAI parse call.
- SLO: parse-stage p95 <= 3000 ms over a rolling 7-day window.
- Runtime control: OpenAI calls use a hard timeout of 2500 ms; timeout paths return manual-fallback errors.
- Excluded from this SLO: client upload time, network RTT, and post-parse UI rendering.

### B. Parse Capability Boundary (`Works for compound foods, brand names, vague inputs`)
- Parse success is defined as:
  - at least 1 parsed item, and
  - at least 1 item with meaningful nutrition (`calories > 0` OR `protein_g > 0` OR `carbs_g > 0` OR `fat_g > 0` OR `fiber_g > 0`).
- Low-confidence threshold: `overall_confidence < 0.30`.
- Low-confidence behavior: save is allowed but must include warning `low_confidence_parse`.
- Parse-failure behavior: if parse returns 0 items or all-zero-nutrition items, return manual fallback error and keep logging unblocked.

### C. Weekly Goal Adjustment (`Targets adjust weekly based on weight trend from body_stats_daily`)
- Data window: last 14 calendar days ending on `goal_date`.
- Minimum data: at least 4 weigh-ins and at least 7 days between first and last point; otherwise adjustment = 0.
- Trend formula:
  - `weekly_delta_lb = ((last_weight_lb - first_weight_lb) / day_span) * 7`.
- Adjustment rule for cut goal:
  - `weekly_delta_lb <= -1.5` -> `+100 kcal` (loss too fast)
  - `weekly_delta_lb >= -0.25` -> `-100 kcal` (loss too slow/plateau)
  - otherwise `0 kcal`
- Adjustment applies equally to training/rest calorie targets and is rounded to nearest 25 kcal after applying bounds.

### D. Meal-Type Auto Timezone (`Meal type auto-selected by time of day`)
- Time windows: breakfast `<10:00`, lunch `10:00-13:59`, snack `14:00-16:59`, dinner `>=17:00`.
- Time basis: client local time from `Date.getTimezoneOffset()` passed as `client_tz_offset_min` in log requests.
- Fallback: if `client_tz_offset_min` is absent, server uses UTC.

### E. TDEE Suggestion + Override (`AI-calculated TDEE shown as suggestion; user can override any value`)
- Storage fields: `nutrition_profile.tdee_calculated`, `nutrition_profile.tdee_override`.
- Effective TDEE: `tdee_override ?? tdee_calculated ?? 2550`.
- Base calorie targets from effective TDEE:
  - training day: `effective_tdee - 350`
  - rest/deload day: `effective_tdee - 500`
- Weekly trend adjustment (section C) is applied on top of base targets.
- Edit location: `Settings` via `GET/PUT /api/nutrition/profile`.
- Change control: override updates regenerate goals for `goal_date >= today` only; past goal rows remain frozen.

## 2. Repo Baseline State

### Current migration sequence (do not alter these files)

```
supabase/migrations/
  0001_init.sql
  0002_performed_at.sql
  0003_retention_marker.sql
  0004_enable_rls_blocks_body_stats_daily.sql
  0005_enable_rls_remaining_public_tables.sql
  0006_enable_rls_exercises.sql
  0007_system_jobs_policies.sql
  0008_skipped_dates.sql
  0009_cardio_saved_at.sql
  0010_next_target_load.sql        <- current HEAD
```

**Next two migrations to add (in order):**
```
supabase/migrations/0011_nutrition_foundation.sql
supabase/migrations/0012_nutrition_rls.sql
```

### Current bottom nav tabs (to be replaced in Sprint 3)

`src/app/BottomNav.tsx` currently has: **Today | Dashboard | History | Upload**

Target after Sprint 3: **Today | Nutrition | Dashboard | More**

### Existing patterns to replicate exactly

- DB access: `import { getDb } from "@/lib/db/pg"` → `pool.connect()` / `client.release()` in finally
- Config: `import { CONFIG, requireConfig } from "@/lib/config"` → call `requireConfig()` at top of handler
- User ID: `const userId = CONFIG.SINGLE_USER_ID`
- Logging: `import { logError, logInfo } from "@/lib/logger"` → `logError(event, err, context)`
- Active block: always read `block_id` from `user_profile` first, never query all blocks
- Transactions: `BEGIN` / `COMMIT` / `ROLLBACK` in catch with `client.release()` in finally
- No SDK for OpenAI — raw `fetch()` only (consistent with zero-SDK approach in dependencies)

---

## 3. Migration Files — Full SQL DDL

### 3.1 `supabase/migrations/0011_nutrition_foundation.sql`

```sql
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
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal_log
  ON meal_items(meal_log_id, sort_order);

-- ---------- daily_nutrition_rollups (materialized daily totals) ----------
CREATE TABLE IF NOT EXISTS daily_nutrition_rollups (
  user_id          uuid NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  rollup_date      date NOT NULL,
  total_calories   numeric NOT NULL DEFAULT 0 CHECK (total_calories >= 0),
  total_protein_g  numeric NOT NULL DEFAULT 0 CHECK (total_protein_g >= 0),
  total_carbs_g    numeric NOT NULL DEFAULT 0 CHECK (total_carbs_g >= 0),
  total_fat_g      numeric NOT NULL DEFAULT 0 CHECK (total_fat_g >= 0),
  total_fiber_g    numeric NOT NULL DEFAULT 0 CHECK (total_fiber_g >= 0),
  total_sugar_g    numeric NOT NULL DEFAULT 0 CHECK (total_sugar_g >= 0),
  total_sodium_mg  numeric NOT NULL DEFAULT 0 CHECK (total_sodium_mg >= 0),
  total_iron_mg    numeric NOT NULL DEFAULT 0 CHECK (total_iron_mg >= 0),
  total_calcium_mg numeric NOT NULL DEFAULT 0 CHECK (total_calcium_mg >= 0),
  total_vitamin_d_mcg numeric NOT NULL DEFAULT 0 CHECK (total_vitamin_d_mcg >= 0),
  total_vitamin_c_mg  numeric NOT NULL DEFAULT 0 CHECK (total_vitamin_c_mg >= 0),
  total_potassium_mg  numeric NOT NULL DEFAULT 0 CHECK (total_potassium_mg >= 0),
  water_ml         numeric NOT NULL DEFAULT 0 CHECK (water_ml >= 0),
  meal_count       int NOT NULL DEFAULT 0 CHECK (meal_count >= 0),
  updated_at       timestamptz NOT NULL DEFAULT now(),
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
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_meals_plan
  ON nutrition_plan_meals(plan_id, meal_type);
```

---

### 3.2 `supabase/migrations/0012_nutrition_rls.sql`

```sql
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
```

---

## 4. New Environment Variable

Add to `.env.local` and Render environment:

```
OPENAI_API_KEY=sk-...
```

Update `src/lib/config.ts` — add inside the `CONFIG` object (do not remove existing fields):

```typescript
OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
```

**Fallback rule:** Routes that call OpenAI must catch a missing/empty `OPENAI_API_KEY` and return a graceful response rather than crashing. The fallback is: `input_mode='manual'`, surface "AI not configured" banner in UI, allow manual item entry. `requireConfig()` is NOT called for OPENAI_API_KEY — nutrition works in degraded-manual mode without it.

---

## 5. Endpoint Contracts — Full Specification

All new routes require the existing session cookie (`paifpe_session` — same auth that protects gym routes). All responses are `Content-Type: application/json`. The existing `src/middleware.ts` handles auth gating — no per-route auth code needed.

**Standard error shape:**
```json
{ "error": "machine_readable_code", "detail": "optional human detail" }
```

**Standard auth error:** `401 { "error": "unauthorized" }` — handled by middleware.

---

### 5.1 `POST /api/nutrition/log`

**File:** `src/app/api/nutrition/log/route.ts`
**Purpose:** Text parse + save OR manual entry save.

#### Request body (`application/json`)

```typescript
{
  meal_date:  string;           // "YYYY-MM-DD" required
  meal_type:  "breakfast" | "lunch" | "dinner" | "snack" | "auto";
  // "auto" derives meal type from server time:
  //   < 10:00 -> breakfast | 10:00-14:00 -> lunch | 14:00-17:00 -> snack | >= 17:00 -> dinner
  raw_input?: string;           // required when save_mode="ai_parse"
  notes?:     string | null;
  save_mode:  "ai_parse" | "manual";
  items?:     MealItemInput[];  // required when save_mode="manual"
                                // optional when save_mode="ai_parse" (additional user-added items)
}

type MealItemInput = {
  meal_item_id?:  string | null;  // omit or null for new items
  item_name:      string;
  quantity:       number;
  unit:           string;
  calories:       number;
  protein_g:      number;
  carbs_g:        number;
  fat_g:          number;
  fiber_g:        number;
  sugar_g:        number;
  sodium_mg:      number;
  iron_mg:        number;
  calcium_mg:     number;
  vitamin_d_mcg:  number;
  vitamin_c_mg:   number;
  potassium_mg:   number;
  source:         "ai" | "manual";
  confidence:     number | null;   // null for manual items
  is_user_edited: boolean;
  sort_order:     number;
}
```

#### Behaviour

1. Validate `meal_date` and `meal_type`. Resolve `"auto"` from server clock.
2. If `save_mode === "ai_parse"`: call `gpt-4o-mini` via `src/lib/ai/openai.ts`. Merge AI-returned items with any user-provided `items`. On AI failure return `422 parse_failed_manual_required`.
3. If `OPENAI_API_KEY` missing and `save_mode="ai_parse"`: return `422 parse_failed_manual_required` immediately (do not crash).
4. Open DB transaction: insert `meal_logs` row, insert all `meal_items` rows.
5. Call `recomputeDailyRollup(client, userId, meal_date)` inside same transaction.
6. COMMIT.

#### Success `200`

```json
{
  "ok": true,
  "meal_log_id": "uuid",
  "input_mode": "text",
  "ai_model": "gpt-4o-mini",
  "ai_confidence": 0.84,
  "items_saved": 2,
  "rollup": {
    "rollup_date": "YYYY-MM-DD",
    "total_calories": 1520,
    "total_protein_g": 118,
    "total_carbs_g": 155,
    "total_fat_g": 48,
    "total_fiber_g": 22,
    "total_sugar_g": 31,
    "total_sodium_mg": 1640,
    "total_iron_mg": 5.2,
    "total_vitamin_d_mcg": 4.1,
    "water_ml": 0,
    "meal_count": 2
  }
}
```

#### Errors

| Code | Status | Meaning |
|---|---|---|
| `invalid_body` | 400 | Body not parseable JSON |
| `invalid_meal_type` | 400 | `meal_type` not in allowed enum |
| `invalid_item_fields` | 400 | Required item fields missing or wrong type |
| `missing_raw_input` | 400 | `save_mode=ai_parse` but `raw_input` absent |
| `parse_failed_manual_required` | 422 | AI parse failed; client should show manual entry UI |
| `nutrition_log_save_failed` | 500 | DB write failed |

---

### 5.2 `POST /api/nutrition/log-photo`

**File:** `src/app/api/nutrition/log-photo/route.ts`
**Purpose:** Photo parse (transient) — returns parsed items, writes NOTHING to DB.

**Privacy contract (hard requirements):**
- Add `export const dynamic = "force-dynamic"` at top of file.
- Do NOT call `logInfo` or `logError` with request body, form data, or any image variable.
- Only log error codes/event names, never image content.
- Image bytes live only inside `src/lib/nutrition/photoParse.ts` as a local `const`. Garbage-collected after OpenAI response.
- No image data returned in response.

#### Request (`multipart/form-data`)

| Field | Type | Required |
|---|---|---|
| `photo` | image file (jpeg/png/webp/gif, max 20 MB) | yes |
| `meal_date` | string `YYYY-MM-DD` | no |
| `meal_type` | `breakfast\|lunch\|dinner\|snack\|auto` | no |

#### Success `200`

```json
{
  "ok": true,
  "input_mode": "photo",
  "ai_model": "gpt-4o",
  "ai_confidence": 0.78,
  "items": [
    {
      "item_name": "Grilled chicken breast",
      "quantity": 180,
      "unit": "g",
      "calories": 297,
      "protein_g": 55.0,
      "carbs_g": 0.0,
      "fat_g": 6.5,
      "fiber_g": 0.0,
      "sugar_g": 0.0,
      "sodium_mg": 130,
      "iron_mg": 1.3,
      "calcium_mg": 18,
      "vitamin_d_mcg": 0.1,
      "vitamin_c_mg": 0.0,
      "potassium_mg": 460,
      "source": "ai",
      "confidence": 0.81,
      "is_user_edited": false,
      "sort_order": 1
    }
  ],
  "warnings": []
}
```

**Client flow after this response:** present items as editable cards; user reviews/edits; user confirms; client calls `POST /api/nutrition/log` with `save_mode="ai_parse"` and the (possibly edited) items array. The `input_mode` written to `meal_logs` will be `"photo"` (text-only confirm) or `"text_photo"` (if user also typed a description).

#### Errors

| Code | Status | Meaning |
|---|---|---|
| `photo_missing` | 400 | No `photo` field in form |
| `unsupported_media_type` | 415 | File not jpeg/png/webp/gif |
| `photo_too_large` | 413 | File exceeds 20 MB |
| `image_unreadable` | 422 | Cannot read/convert file bytes |
| `parse_failed` | 422 | OpenAI returned 0 items or invalid JSON |
| `openai_unavailable` | 503 | OpenAI API non-2xx; client shows text/manual fallback |
| `nutrition_photo_parse_failed` | 500 | Unexpected server error |

---

### 5.3 `PUT /api/nutrition/log/:id`

**File:** `src/app/api/nutrition/log/[id]/route.ts`
**Purpose:** Edit meal metadata and items; always recomputes rollup.

#### Request body (`application/json`)

```typescript
{
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack";
  notes?:     string | null;
  items:      MealItemInput[];
  // Full replacement semantics:
  // - items with no meal_item_id => INSERT new
  // - items with existing meal_item_id => UPDATE in place
  // - items previously in the meal but absent from this array => DELETE
}
```

`MealItemInput` same type as in 5.1.

#### Success `200`

```json
{
  "ok": true,
  "meal_log_id": "uuid",
  "items_saved": 3,
  "rollup": {
    "rollup_date": "YYYY-MM-DD",
    "total_calories": 1840,
    "total_protein_g": 142
  }
}
```

#### Errors

| Code | Status | Meaning |
|---|---|---|
| `invalid_body` | 400 | |
| `meal_log_not_found` | 404 | `:id` not in DB for this user |
| `forbidden` | 403 | meal_log belongs to different user |
| `nutrition_log_update_failed` | 500 | |

---

### 5.4 `DELETE /api/nutrition/log/:id`

**File:** `src/app/api/nutrition/log/[id]/route.ts` (same file as PUT, different exported handler)
**Purpose:** Delete one meal + all its items; recompute rollup.

#### Success `200`

```json
{
  "ok": true,
  "deleted_meal_log_id": "uuid",
  "rollup": {
    "rollup_date": "YYYY-MM-DD",
    "total_calories": 1210,
    "total_protein_g": 98
  }
}
```

#### Errors

| Code | Status |
|---|---|
| `meal_log_not_found` | 404 |
| `forbidden` | 403 |
| `nutrition_log_delete_failed` | 500 |

---

### 5.5 `GET /api/nutrition/today`

**File:** `src/app/api/nutrition/today/route.ts`
**Query param:** `date` (optional, `YYYY-MM-DD`; defaults to server today in UTC)
**Purpose:** Full daily summary — goals + totals + deltas + meal list with items.

**Sparse-data guarantee:** If no `nutrition_goals_daily` row exists for the date, synthesise default goals from `nutrition_profile` (or system defaults if profile also missing). Never return `null` for `goals`, `totals`, or `deltas` — always return zero-valued objects.

#### Success `200`

```json
{
  "date": "YYYY-MM-DD",
  "goals": {
    "is_training_day": true,
    "target_calories": 2200,
    "target_protein_g": 160,
    "target_fat_g": 70,
    "target_carbs_g": 240,
    "target_fiber_g": 30,
    "target_sugar_g_max": 45,
    "target_sodium_mg_max": 2300,
    "target_iron_mg": 8,
    "target_vitamin_d_mcg": 15,
    "target_water_ml": 3000
  },
  "totals": {
    "total_calories": 1630,
    "total_protein_g": 126,
    "total_carbs_g": 162,
    "total_fat_g": 56,
    "total_fiber_g": 18,
    "total_sugar_g": 27,
    "total_sodium_mg": 1480,
    "total_iron_mg": 5.4,
    "total_vitamin_d_mcg": 6.2,
    "water_ml": 1200,
    "meal_count": 2
  },
  "deltas": {
    "calories_remaining": 570,
    "protein_remaining_g": 34,
    "fat_remaining_g": 14,
    "carbs_remaining_g": 78,
    "fiber_remaining_g": 12,
    "sugar_headroom_g": 18,
    "sodium_headroom_mg": 820,
    "iron_remaining_mg": 2.6,
    "vitamin_d_remaining_mcg": 8.8,
    "water_remaining_ml": 1800
  },
  "meals": [
    {
      "meal_log_id": "uuid",
      "meal_type": "breakfast",
      "raw_input": "Had 3 eggs and toast",
      "input_mode": "text",
      "ai_confidence": 0.91,
      "notes": null,
      "created_at": "ISO-8601",
      "items": [
        {
          "meal_item_id": "uuid",
          "item_name": "Scrambled eggs",
          "quantity": 3,
          "unit": "count",
          "calories": 210,
          "protein_g": 18.0,
          "carbs_g": 1.5,
          "fat_g": 15.0,
          "fiber_g": 0,
          "sugar_g": 0.4,
          "sodium_mg": 310,
          "iron_mg": 1.8,
          "calcium_mg": 75,
          "vitamin_d_mcg": 2.4,
          "vitamin_c_mg": 0,
          "potassium_mg": 204,
          "source": "ai",
          "confidence": 0.92,
          "is_user_edited": false,
          "sort_order": 1
        }
      ]
    }
  ]
}
```

#### Errors

| Code | Status |
|---|---|
| `invalid_date` | 400 |
| `nutrition_today_failed` | 500 |

---

### 5.6 `GET /api/nutrition/week`

**File:** `src/app/api/nutrition/week/route.ts`
**Query param:** `weekStart` (`YYYY-MM-DD`, must be a Monday) — defaults to current week's Monday.
**Purpose:** 7-day calorie/macro summaries. Always returns exactly 7 day objects.

#### Success `200`

```json
{
  "week_start": "YYYY-MM-DD",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "is_training_day": true,
      "target_calories": 2200,
      "total_calories": 2050,
      "total_protein_g": 148,
      "total_carbs_g": 198,
      "total_fat_g": 62,
      "meal_count": 4,
      "adherence_pct": 93
    }
  ]
}
```

Days with no logged data return zero totals and `adherence_pct: 0`. `adherence_pct = Math.round((total_calories / target_calories) * 100)`, capped at 100.

#### Errors

| Code | Status |
|---|---|
| `invalid_weekStart` | 400 |
| `nutrition_week_failed` | 500 |

---

### 5.7 `GET /api/nutrition/history`

**File:** `src/app/api/nutrition/history/route.ts`
**Query params:** `from` (`YYYY-MM-DD`), `to` (`YYYY-MM-DD`), `page` (int ≥ 1, default 1), `pageSize` (int 1–90, default 30).

#### Success `200`

```json
{
  "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD",
  "page": 1,
  "page_size": 30,
  "total_days": 12,
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meal_count": 4,
      "total_calories": 2110,
      "total_protein_g": 158,
      "is_training_day": true,
      "target_calories": 2200,
      "adherence_pct": 96
    }
  ]
}
```

#### Errors

| Code | Status |
|---|---|
| `invalid_date_range` | 400 |
| `nutrition_history_failed` | 500 |

---

### 5.8 `GET /api/nutrition/insights`

**File:** `src/app/api/nutrition/insights/route.ts`
**Query param:** `date` (optional, defaults to today).

#### Success `200`

```json
{
  "date": "YYYY-MM-DD",
  "insights": [
    {
      "insight_id": "uuid",
      "insight_type": "deficiency_alert",
      "generated_at": "ISO-8601",
      "recommendation_text": "Fiber is 12 g today vs 30 g target. Add legumes at dinner.",
      "is_dismissed": false,
      "context_json": {
        "nutrient": "fiber",
        "actual": 12,
        "target": 30
      }
    }
  ]
}
```

**Rule-based triggers (no AI required for basic alerts):**

| Alert type | Trigger condition |
|---|---|
| Low protein | `total_protein_g < target_protein_g * 0.8` |
| Low fiber | `total_fiber_g < 25` |
| High sugar | `total_sugar_g > 40` |
| Low iron | `total_iron_mg < 6` |
| Low vitamin D | `total_vitamin_d_mcg < 10` |
| Low water | `water_ml < 2000` |

#### Errors

| Code | Status |
|---|---|
| `nutrition_insights_failed` | 500 |

---

### 5.9 `POST /api/nutrition/plan/generate`

**File:** `src/app/api/nutrition/plan/generate/route.ts`
**Purpose:** AI meal plan. Protein constraint enforced in both the AI prompt AND server-side response validation.

#### Request body (`application/json`)

```typescript
{
  plan_date:        string;   // "YYYY-MM-DD"
  day_type:         "training" | "rest" | "auto";
  target_calories:  number;  // e.g. 2200
  target_protein_g: number;  // e.g. 160
  constraints?: {
    allowed_proteins:   string[];  // default: ["chicken","shrimp","eggs","dairy","plant"]
    forbidden_proteins: string[];  // default: ["fish","beef","lamb","pork","goat"]
  }
}
```

**Server-side validation after AI response:** scan all meal descriptions and `items_json` for forbidden protein names (`fish`, `beef`, `lamb`, `pork`, `goat`). If found, return `422 forbidden_protein_in_plan` — do not save the plan.

#### Success `200`

```json
{
  "ok": true,
  "plan_id": "uuid",
  "plan_date": "YYYY-MM-DD",
  "ai_model": "gpt-4o",
  "total_calories": 2190,
  "total_protein_g": 162,
  "meals": [
    {
      "plan_meal_id": "uuid",
      "meal_type": "breakfast",
      "description": "Greek yogurt parfait with berries and almonds",
      "total_calories": 420,
      "total_protein_g": 28,
      "total_carbs_g": 45,
      "total_fat_g": 14,
      "items_json": []
    }
  ]
}
```

#### Errors

| Code | Status | Meaning |
|---|---|---|
| `invalid_constraints` | 400 | |
| `forbidden_protein_in_plan` | 422 | AI returned a plan with forbidden protein |
| `plan_generation_failed` | 422 | AI returned unparseable/invalid plan |
| `nutrition_plan_generate_failed` | 500 | DB write or unexpected error |

---

## 6. Sprint Backlog

### Sprint 0 — Gym Stability Hardening (3–4 days)

**Goal:** Lock current gym behavior before touching anything nutrition-related. All gym tests must pass. No regressions allowed.

| ID | Story | Files | Exit Criterion |
|---|---|---|---|
| S0.1 | Cardio server-truth consistency | `src/app/api/plan/session-minutes/route.ts`, `src/app/api/plan/today/route.ts`, `src/app/api/plan/week/route.ts`, `src/app/session/[date]/page.tsx`, `src/app/session/[date]/SessionLogger.tsx` | Cardio minutes written via `session-minutes` API and returned identically by `today` and `week` APIs. PWA and browser show same value without page reload. |
| S0.2 | No-session fallback nav parity | `src/app/session/[date]/page.tsx` | When `/session/[date]` has no session, page renders Prev and Next date navigation buttons. Not a dead-end blank page. |
| S0.3 | Skip-day drift guardrails | `src/app/api/plan/insert-rest-day/route.ts`, `src/lib/engine/schedule.ts` | After skip: (a) `skipped_dates` array updated in `user_profile`, (b) subsequent sessions do not drift or duplicate, (c) navigating Back/Refresh retains skip state. |

**Sprint 0 exit gate (all must pass before Sprint 1 starts):**
- `npm run build` passes
- `npm test` passes
- Manual check: no-session page has Prev/Next navigation
- Manual check: cardio state identical in browser and PWA after save
- Manual check: `/api/plan/week` returns active-block sessions only (no old-block leakage)

---

### Sprint 1 — Nutrition Foundation (1 week)

**Goal:** Database schema live; goals engine running. Zero UI changes.

| ID | Story | Files | Exit Criterion |
|---|---|---|---|
| S1.1 | Apply nutrition schema migration | `supabase/migrations/0011_nutrition_foundation.sql` | Migration applies cleanly on fresh DB and idempotently on existing DB. All 8 tables exist with correct columns, types, checks, and indexes. |
| S1.2 | Apply nutrition RLS migration | `supabase/migrations/0012_nutrition_rls.sql` | Supabase RLS advisor shows no policy warnings. Anon/authenticated roles cannot cross-read nutrition data. |
| S1.3 | Nutrition profile seed | `src/lib/nutrition/profile.ts` | Exports `ensureNutritionProfile(client, userId)`. Idempotent INSERT ON CONFLICT DO NOTHING. Uses defaults: age=49, height_cm=178, sex='male', nutrition_goal='cut'. |
| S1.4 | Daily goal generator + training-day sync | `src/lib/nutrition/goals.ts`, `src/lib/nutrition/syncTrainingDay.ts` | `syncTrainingDay(client, userId, date)` reads `user_profile.block_id`, queries `plan_sessions WHERE user_id=$1 AND block_id=$2 AND date=$3`, UPSERTs `nutrition_goals_daily`. Training day → 2200 cal; rest/deload/no-session → 2050 cal; protein always 160 g. |

**Sprint 1 exit gate:**
- `npm run build` passes
- `npm test` passes
- Migration idempotency verified
- Supabase RLS advisor passes

---

### Sprint 2 — Logging APIs (1 week)

**Goal:** All CRUD nutrition API routes working server-side. No UI yet.

| ID | Story | Files | Notes |
|---|---|---|---|
| S2.1 | `POST /api/nutrition/log` | `src/app/api/nutrition/log/route.ts`, `src/lib/ai/openai.ts`, `src/lib/ai/prompts.ts`, `src/lib/ai/types.ts` | Raw `fetch()` to OpenAI. JSON mode. `gpt-4o-mini`. Fallback to 422 on failure. |
| S2.2 | `POST /api/nutrition/log-photo` | `src/app/api/nutrition/log-photo/route.ts`, `src/lib/nutrition/photoParse.ts` | Suppress body logging. Transient base64 only. `gpt-4o` vision. Returns parsed items, writes nothing. |
| S2.3 | `PUT` + `DELETE /api/nutrition/log/:id` | `src/app/api/nutrition/log/[id]/route.ts` | Full item replacement on PUT. Rollup recomputed on both operations. |
| S2.4 | Rollup recomputation helper | `src/lib/nutrition/rollups.ts` | `recomputeDailyRollup(client, userId, date)`: SUMs all `meal_items` via JOIN on `meal_logs`, UPSERTs `daily_nutrition_rollups`. Same pattern as `recomputeWeeklyRollup` in `src/lib/db/logs.ts`. |
| S2.5 | `GET /api/nutrition/today` | `src/app/api/nutrition/today/route.ts` | Calls `syncTrainingDay` → returns goals+totals+deltas+meals. Zero-value fallback on sparse data. |
| S2.6 | `GET /api/nutrition/week` | `src/app/api/nutrition/week/route.ts` | 7-day rollup array. Always exactly 7 entries. |
| S2.7 | `GET /api/nutrition/history` | `src/app/api/nutrition/history/route.ts` | Date-range with pagination. |

**Sprint 2 exit gate:**
- `npm run build` passes
- Manual API test: text log creates `meal_logs` + `meal_items`; `daily_nutrition_rollups` updates correctly
- Manual API test: photo log parses without any stored image (verify with DB query)
- Manual API test: edit/delete recomputes rollup exactly
- Manual API test: empty-day responses return valid non-null shapes
- `grep -ri "photo\|image\|blob\|base64" supabase/migrations/0011_nutrition_foundation.sql supabase/migrations/0012_nutrition_rls.sql` returns zero matches

---

### Sprint 3 — Nutrition UI + Navigation (1 week)

**Goal:** Usable nutrition experience on mobile. Navigation restructured.

| ID | Story | Files | Notes |
|---|---|---|---|
| S3.1 | Bottom tab restructure | `src/app/BottomNav.tsx`, `src/app/more/page.tsx` | Replace Today/Dashboard/History/Upload with Today/Nutrition/Dashboard/More. "More" page links to History (`/history`), Upload (`/upload`), and Settings (placeholder). |
| S3.2 | Nutrition Today page | `src/app/nutrition/today/page.tsx`, `src/app/nutrition/components/DailySummary.tsx`, `src/app/nutrition/components/MealCard.tsx`, `src/app/nutrition/components/MacroRings.tsx`, `src/app/nutrition/components/AddMealButton.tsx`, `src/app/nutrition/components/MealLogDrawer.tsx` | Fetches `/api/nutrition/today`. Shows macro rings, meal list with expand/edit/delete, add-meal button. |
| S3.3 | Nutrition History page | `src/app/nutrition/history/page.tsx` | Fetches `/api/nutrition/history`. Day-summary list. Tap day to expand meal list. |
| S3.4 | Loading + error states | `src/app/nutrition/today/loading.tsx`, `src/app/nutrition/today/error.tsx` | Skeleton loader. Error boundary with retry CTA. |
| S3.5 | Meal type auto-select | Inside `MealLogDrawer.tsx` | On drawer open, pre-select meal type from client clock. User can override. |

**Sprint 3 exit gate:**
- All 4 bottom tabs navigate correctly on iPhone viewport (375 × 812 px)
- Can add meal via text → AI parse → review items → save → totals update without page reload
- Can edit and delete a meal; totals update immediately after
- History page shows day summaries with correct totals
- Zero null/undefined render crashes in any state

---

### Sprint 4 — Insights, Plans, Unified Dashboard (1 week)

**Goal:** Decision support layer and merged dashboard view.

| ID | Story | Files | Notes |
|---|---|---|---|
| S4.1 | Insights API — rule-based | `src/app/api/nutrition/insights/route.ts`, `src/lib/nutrition/insights.ts` | Rule-based deficiency detection from Section 5.8. No AI required for basic alerts. |
| S4.2 | Insights API — AI coaching (optional enhancement) | `src/lib/ai/patternDetection.ts` | Calls `gpt-4o` sparingly only when 7+ days of data exist. Stores result in `nutrition_insights`. |
| S4.3 | Meal plan generation | `src/app/api/nutrition/plan/generate/route.ts`, `src/app/nutrition/plan/page.tsx` | Prompt enforces allowed/forbidden proteins. Server validates response before saving. |
| S4.4 | Dashboard merge | `src/app/dashboard/page.tsx`, `src/app/dashboard/components/NutritionQuickStats.tsx` | Add `NutritionQuickStats` section below existing gym dashboard content. Fetch `/api/nutrition/today` in parallel with existing dashboard query via `Promise.all`. Graceful empty state when no nutrition data. |
| S4.5 | Trends page | `src/app/nutrition/trends/page.tsx` | 7-day and 30-day calorie/macro sparklines. Adherence % bars. Weekly average summaries. |

**Sprint 4 exit gate:**
- Deficiency alerts fire correctly for each threshold in Section 5.8
- Generated meal plans contain zero forbidden proteins — verified by string search in response
- Dashboard renders combined training + nutrition data without null crash
- Dashboard renders gracefully with zero nutrition data (new user state)

---

### Sprint 5 — Release Hardening (3–4 days)

**Goal:** All automated checks green. Production-ready.

| ID | Story | Files | Notes |
|---|---|---|---|
| S5.1 | DB-free unit tests | `tests/api/nutritionLog.test.ts`, `tests/api/nutritionRollup.test.ts` | Test: rollup computation logic, meal type auto-detection, training-day switch logic, protein constraint validation. No DB connection. |
| S5.2 | CI workflow update | `.github/workflows/ci.yml` | Verify `npm test` covers new test files. No DB required in CI. |
| S5.3 | Smoke script — nutrition endpoints | `scripts/smoke-render.mjs` | Add: `POST /api/nutrition/log` (text), `GET /api/nutrition/today`, `PUT /api/nutrition/log/:id`, `DELETE /api/nutrition/log/:id`, `GET /api/nutrition/history`. Assert stable shapes. |
| S5.4 | Photo non-persistence verification | Manual — see Validation Matrix #12 | Grep schemas + migration files. Verify no base64 in DB rows. Verify no `data:image/` in server logs. |
| S5.5 | Manual fallback verification | Manual — see Validation Matrix #13 | Remove key from env; attempt text log; verify manual mode saves correctly. |

**Sprint 5 exit gate:**
- `npm test` passes all suites including nutrition
- `npm run build` passes with zero TS errors
- Render smoke script passes all gym + nutrition assertions
- Photo non-persistence proof complete (Validation Matrix #12)
- Manual fallback proof complete (Validation Matrix #13)

---

## 7. Implementation Contracts per File

### `src/lib/ai/openai.ts` — NEW FILE

```typescript
// Raw fetch() only — no openai npm package.
// Add OPENAI_API_KEY to CONFIG in src/lib/config.ts before using this.

import { CONFIG } from "@/lib/config";

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";

export async function callOpenAI(params: {
  model: OpenAIModel;
  systemPrompt: string;
  userContent:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string; detail?: "low" | "high" };
      }>;
  maxTokens?: number;
  responseFormat?: "json_object";
}): Promise<string>
// Returns raw JSON string from OpenAI.
// Throws Error on non-2xx response or missing OPENAI_API_KEY.
// Caller is responsible for JSON.parse and field validation.
```

### `src/lib/ai/types.ts` — NEW FILE

```typescript
export type ParsedFoodItem = {
  item_name:     string;
  quantity:      number;
  unit:          string;
  calories:      number;
  protein_g:     number;
  carbs_g:       number;
  fat_g:         number;
  fiber_g:       number;
  sugar_g:       number;
  sodium_mg:     number;
  iron_mg:       number;
  calcium_mg:    number;
  vitamin_d_mcg: number;
  vitamin_c_mg:  number;
  potassium_mg:  number;
  confidence:    number;  // 0-1 per item
};

export type MealParseResult = {
  items:      ParsedFoodItem[];
  confidence: number;  // overall 0-1
  model:      string;
};
```

### `src/lib/ai/prompts.ts` — NEW FILE

```typescript
// Exports functions that build system/user prompts.
// Prompts must instruct model to:
// 1. Return valid JSON only (no markdown, no code block wrapping)
// 2. Include all 15 nutrient fields for each item
// 3. Use standard US serving sizes when unspecified
// 4. Respect allowed/forbidden protein sources

export function buildMealParseSystemPrompt(allowedProteins: string[]): string;
export function buildMealParseUserPrompt(rawInput: string): string;
export function buildMealPlanSystemPrompt(constraints: {
  allowed_proteins:   string[];
  forbidden_proteins: string[];
  target_calories:    number;
  target_protein_g:   number;
}): string;
export function buildInsightSystemPrompt(): string;
```

### `src/lib/nutrition/photoParse.ts` — NEW FILE

```typescript
// CRITICAL PRIVACY CONTRACT:
// 1. Do NOT import or call logInfo/logError with image data.
// 2. imageBase64 must be a LOCAL const — not returned, not logged, not stored.
// 3. This function returns ParsedFoodItem[] only — zero image data.

import type { MealParseResult } from "@/lib/ai/types";

export async function parsePhotoMeal(imageBuffer: Buffer): Promise<MealParseResult>
// Implementation:
//   const imageBase64 = imageBuffer.toString("base64");
//   const result = await callOpenAI({ model: "gpt-4o", image_url: `data:image/jpeg;base64,${imageBase64}` });
//   // imageBase64 goes out of scope here — eligible for GC
//   return parsedItems;
```

### `src/lib/nutrition/rollups.ts` — NEW FILE

```typescript
// Mirrors pattern of recomputeWeeklyRollup() in src/lib/db/logs.ts

import type { PoolClient } from "pg";

export type DailyRollup = {
  rollup_date:        string;
  total_calories:     number;
  total_protein_g:    number;
  total_carbs_g:      number;
  total_fat_g:        number;
  total_fiber_g:      number;
  total_sugar_g:      number;
  total_sodium_mg:    number;
  total_iron_mg:      number;
  total_calcium_mg:   number;
  total_vitamin_d_mcg: number;
  total_vitamin_c_mg:  number;
  total_potassium_mg:  number;
  water_ml:           number;
  meal_count:         number;
};

export async function recomputeDailyRollup(
  client: PoolClient,
  userId: string,
  date: string  // "YYYY-MM-DD"
): Promise<DailyRollup>
// SQL query:
//   SELECT
//     COALESCE(SUM(mi.calories), 0) as total_calories, ...
//   FROM meal_logs ml
//   JOIN meal_items mi ON mi.meal_log_id = ml.meal_log_id
//   WHERE ml.user_id = $1 AND ml.meal_date = $2
// Then UPSERT daily_nutrition_rollups
// Returns the upserted row
```

### `src/lib/nutrition/goals.ts` — NEW FILE

```typescript
export async function ensureTodayGoals(
  client: PoolClient,
  userId: string,
  date: string  // "YYYY-MM-DD"
): Promise<DailyGoals>
// Checks if nutrition_goals_daily row exists for (userId, date).
// If not, calls syncTrainingDay to create it.
// If nutrition_profile missing, uses system defaults.
// Returns the row (existing or newly created).

export async function regenerateFutureGoals(
  client: PoolClient,
  userId: string,
  fromDate: string  // only rows with goal_date >= fromDate are regenerated
): Promise<void>
// Called when user updates calorie/macro targets in settings.
// Past rows (< fromDate) are frozen and never touched.
```

### `src/lib/nutrition/syncTrainingDay.ts` — NEW FILE

```typescript
// Training-day sync query MUST filter by active block_id.
// Never omit block_id — omitting it would leak old-block sessions.

export async function syncTrainingDay(
  client: PoolClient,
  userId: string,
  date: string  // "YYYY-MM-DD"
): Promise<void>
// Step 1: SELECT block_id FROM user_profile WHERE user_id = $1
// Step 2: SELECT is_deload, session_type
//           FROM plan_sessions
//           WHERE user_id = $1 AND block_id = $2 AND date = $3
// Logic:
//   session found AND is_deload = false  =>  training day (2200 cal)
//   no session OR is_deload = true       =>  rest day (2050 cal)
//   protein = 160g always
// UPSERT nutrition_goals_daily (user_id, goal_date)
```

### `src/lib/nutrition/profile.ts` — NEW FILE

```typescript
export async function ensureNutritionProfile(
  client: PoolClient,
  userId: string
): Promise<void>
// INSERT INTO nutrition_profile (user_id, age, height_cm, sex, nutrition_goal, ...)
// VALUES ($1, 49, 178, 'male', 'cut', ...)
// ON CONFLICT (user_id) DO NOTHING
// These are user-scoped profile defaults — not schema-level defaults.
// Called once at Sprint 1 and at first nutrition API call for safety.
```

### `src/app/api/nutrition/log-photo/route.ts` — NEW FILE

```typescript
// REQUIRED at top of file (no exceptions):
export const dynamic = "force-dynamic";

// REQUIRED: Do NOT call logInfo or logError with request body.
// Log only: event name, error code, user_id.
// Example:
//   logError("photo_parse_failed", err, { user_id: userId });  // OK
//   logError("photo_parse_failed", err, { body: rawBody });    // BANNED

export async function POST(req: Request): Promise<NextResponse>
```

---

## 8. Validation & Acceptance Matrix

| # | Test | Pass Condition |
|---|---|---|
| 1 | Unlock + protected API gate | Unauthenticated requests to `/api/nutrition/*` return `401`. After unlock, same requests succeed. |
| 2 | Plan init idempotency | `POST /api/plan/init` twice returns `initialized: true` both times. Same block ID both times. |
| 3 | Session logging rollup | After `POST /api/logs/set`, `weekly_rollups` and `top_set_history` updated correctly. |
| 4 | Cardio persistence cross-client | `cardio_saved_at` set after `session-minutes` call. Browser and PWA show same cardio value. |
| 5 | Skip-day persistence | After `insert-rest-day`, `skipped_dates` updated, session shifted, Back/Refresh retains state. |
| 6 | Nutrition text log end-to-end | `POST /api/nutrition/log` creates `meal_logs` + `meal_items` rows and updates `daily_nutrition_rollups`. Response shape matches Section 5.1 contract. |
| 7 | Nutrition photo parse — no persistence | `POST /api/nutrition/log-photo` returns parsed items. Zero rows written to ANY nutrition table. |
| 8 | Meal edit rollup accuracy | `PUT /api/nutrition/log/:id` updates items; `daily_nutrition_rollups.total_calories` recomputed to exactly the new sum. |
| 9 | Meal delete rollup accuracy | `DELETE /api/nutrition/log/:id` removes meal; `daily_nutrition_rollups` totals decrement by exactly the deleted meal's contribution. |
| 10 | Training-day target switch | On a day with an active non-deload session: `target_calories=2200`. On a day with no session or deload: `target_calories=2050`. Protein always 160 g. Query uses `block_id` from `user_profile`. |
| 11 | Stable shape on sparse data | `GET /api/nutrition/today` and `GET /api/nutrition/week` return valid non-null shapes with zero totals when no meals logged. No null crash in UI. |
| 12 | **Photo non-persistence proof** | **(a)** `grep -ri "photo\|image\|blob\|base64" supabase/migrations/0011_nutrition_foundation.sql supabase/migrations/0012_nutrition_rls.sql` → zero matches. **(b)** After photo-logged meal, `SELECT raw_input, notes FROM meal_logs WHERE input_mode='photo'` shows no base64 content. **(c)** `SELECT * FROM meal_items WHERE meal_log_id = <photo_meal_id>` shows no base64 in any text column. **(d)** Server logs grep for `data:image/` → zero matches. **(e)** Schema inspection: `\d meal_logs`, `\d meal_items`, and all other nutrition tables show no column named `photo*`, `image*`, `blob*`, or `base64*`. |
| 13 | **Manual fallback — missing OPENAI_API_KEY** | Remove `OPENAI_API_KEY` from env. Call `POST /api/nutrition/log` with `save_mode="manual"` and `items` array. Verify: meal saved with `input_mode='manual'`; all `meal_items.source='manual'`; rollup updated. UI shows "AI not configured" notice but manual entry saves successfully. |
| 14 | **Provenance non-null guarantee** | `SELECT COUNT(*) FROM meal_items WHERE source IS NULL OR is_user_edited IS NULL` → 0 after any save operation. |
| 15 | **Protein constraint in plans** | `POST /api/nutrition/plan/generate` with default constraints. Verify no meal description or `items_json` content in response or DB contains `fish`, `beef`, `lamb`, `pork`, or `goat`. |
| 16 | RLS cross-user isolation | Query nutrition tables via PostgREST with a different `auth.uid()` → zero rows returned (not an error — RLS filters silently). |
| 17 | Build passes | `npm run build` exits 0 with zero TypeScript errors. |
| 18 | Tests pass | `npm test` exits 0. All engine, adaptive, and API test suites green, including `nutritionLog.test.ts` and `nutritionRollup.test.ts`. |
| 19 | Smoke script passes | `npm run smoke:render` passes all gym endpoints AND new nutrition endpoints. |

---

## 9. Definition of Done

**Release is complete when ALL of the following are true:**

- [ ] Gym flows stable in production: correct date/session behavior, cardio persistence, skip-day persistence
- [ ] Nutrition text + photo + manual logging works end-to-end with no photo persistence
- [ ] Daily rollups and goal deltas accurate after all create/edit/delete operations
- [ ] Training-day target switches correctly based on active block session
- [ ] `GET /api/nutrition/today` returns stable non-null shape with zero meals
- [ ] All `meal_items` rows have non-null `source` and non-null `is_user_edited`
- [ ] Meal plans enforce allowed proteins; no forbidden protein ever returned
- [ ] Unified dashboard renders training + nutrition without null crashes
- [ ] Manual logging works without `OPENAI_API_KEY`
- [ ] RLS policies pass Supabase security advisor on all 8 nutrition tables
- [ ] Photo non-persistence proof passes (Validation Matrix #12)
- [ ] `npm run build` passes at every sprint boundary
- [ ] `npm test` passes including nutrition unit tests
- [ ] Render smoke script passes gym + nutrition endpoints

---

## 10. Cross-Cutting Rules Reference

Quick lookup for every new file written.

### DB access pattern (copy exactly)

```typescript
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... work ...
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("event_name_failed", err, { user_id: userId });
    return NextResponse.json({ error: "event_name_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
```

### Training-day sync query pattern (never omit block_id)

```sql
-- Step 1: get active block
SELECT block_id FROM user_profile WHERE user_id = $1;

-- Step 2: check today's session (block_id REQUIRED)
SELECT is_deload, session_type
FROM plan_sessions
WHERE user_id = $1 AND block_id = $2 AND date = $3;
-- Omitting block_id = bug: leaks sessions from old blocks
```

### Photo API privacy checklist

- [ ] `export const dynamic = "force-dynamic"` at top of route file
- [ ] No `logInfo(...)` call with request body or any image variable
- [ ] No `logError(err, { body: ... })` call
- [ ] base64 image assigned to `const` inside function scope, never module scope
- [ ] No image data in any return value
- [ ] No image written to DB, filesystem, or object storage

### OpenAI model selection

| Use case | Model | Approx cost/call |
|---|---|---|
| Text meal parse | `gpt-4o-mini` | ~$0.001 |
| Photo meal parse | `gpt-4o` (vision) | ~$0.01 |
| Meal plan generation | `gpt-4o` | ~$0.02 |
| Coaching insights | `gpt-4o` | ~$0.02 — use sparingly |

### Rollup recomputation call sites (must not miss any)

`recomputeDailyRollup(client, userId, date)` must be called inside the transaction in:
- `POST /api/nutrition/log` (save)
- `PUT /api/nutrition/log/:id` (edit)
- `DELETE /api/nutrition/log/:id` (delete)

### Config change for Sprint 2

Add to `src/lib/config.ts` inside the `CONFIG` object:

```typescript
OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
```

Do NOT add to `requireConfig()` check — nutrition degrades gracefully without it.

---

## 11. Request Type Aliases — GET Endpoints & Photo Form

Named TypeScript types for every input surface not already covered by a `type` block in Section 5.

### 11.1 Shared primitive types

```typescript
// src/lib/nutrition/types.ts  (add alongside ai/types.ts)

export type ISODate = string;          // "YYYY-MM-DD"
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealTypeOrAuto = MealType | "auto";
export type InputMode = "text" | "photo" | "text_photo" | "manual";
export type SaveMode = "ai_parse" | "manual";
export type InsightType = "deficiency_alert" | "coaching" | "supplement";
export type DayType = "training" | "rest" | "auto";
export type NutritionGoal = "cut" | "maintain" | "bulk";
```

### 11.2 `POST /api/nutrition/log-photo` — form-data shape

```typescript
// Parsed from multipart/form-data inside the route handler.
// Use req.formData() — no body-parser needed in Next.js App Router.

type PhotoLogFormData = {
  photo:      File;              // required; jpeg | png | webp | gif; max 20 MB
  meal_date?: ISODate;           // optional; defaults to server today
  meal_type?: MealTypeOrAuto;    // optional; defaults to "auto"
};

// Validation sequence inside handler:
// 1. formData.get("photo") — 400 photo_missing if absent
// 2. photo.type in ["image/jpeg","image/png","image/webp","image/gif"] — 415 if not
// 3. photo.size <= 20 * 1024 * 1024 — 413 if exceeded
// 4. meal_date: if provided, must match /^\d{4}-\d{2}-\d{2}$/ — 400 invalid_date if not
// 5. meal_type: if provided, must be MealTypeOrAuto — 400 invalid_meal_type if not
```

### 11.3 `GET /api/nutrition/today` — query params

```typescript
type NutritionTodayQuery = {
  date?: ISODate;  // optional; defaults to server UTC date
                   // validated: must match /^\d{4}-\d{2}-\d{2}$/ — 400 invalid_date if not
};
```

### 11.4 `GET /api/nutrition/week` — query params

```typescript
type NutritionWeekQuery = {
  weekStart?: ISODate;
  // optional; defaults to Monday of current UTC week
  // validation: must be a Monday (getUTCDay() === 1) — 400 invalid_weekStart if not
  // helper: same getWeekStartDateUtc() pattern from src/lib/db/rollups.ts
};
```

### 11.5 `GET /api/nutrition/history` — query params

```typescript
type NutritionHistoryQuery = {
  from:       ISODate;  // required — 400 invalid_date_range if absent or malformed
  to:         ISODate;  // required — 400 invalid_date_range if absent or malformed
                        // must satisfy: from <= to, range <= 365 days
  page?:      number;   // optional int >= 1; default 1
  pageSize?:  number;   // optional int 1–90; default 30
};
```

### 11.6 `GET /api/nutrition/insights` — query params

```typescript
type NutritionInsightsQuery = {
  date?: ISODate;  // optional; defaults to server UTC date
};
```

---

## 12. Route Handler Contracts — Remaining API Files

Function signatures and behaviour specs for the 7 route files not covered in Section 7.

---

### 12.1 `src/app/api/nutrition/log/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

// POST /api/nutrition/log
export async function POST(req: NextRequest): Promise<NextResponse>
// Steps (in order):
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. body = await req.json().catch(() => null) — 400 invalid_body if null
// 3. Validate meal_date (required, ISODate) — 400 invalid_date if missing/malformed
// 4. Validate meal_type (required, MealTypeOrAuto) — resolve "auto" from server clock
//    clock rule: hour < 10 -> breakfast | 10-14 -> lunch | 14-17 -> snack | >=17 -> dinner
// 5. Validate save_mode ("ai_parse" | "manual") — 400 invalid_body if absent
// 6. If save_mode === "ai_parse":
//    a. raw_input required — 400 missing_raw_input if absent
//    b. call parseMealText(raw_input, allowedProteins) from src/lib/ai/openai.ts
//    c. on AI failure (throws) -> return 422 parse_failed_manual_required
//    d. merge AI items with any user-supplied items[] (user items append after AI items)
// 7. If save_mode === "manual":
//    a. items[] required and non-empty — 400 invalid_item_fields if absent
//    b. validate each MealItemInput: all numeric fields must be finite >= 0
//    c. source must be "manual" for all items
// 8. BEGIN transaction
// 9. ensureNutritionProfile(client, userId)          // idempotent
// 10. syncTrainingDay(client, userId, meal_date)     // upserts goals row
// 11. INSERT meal_logs row
// 12. INSERT all meal_items rows with correct sort_order (1-indexed)
// 13. recomputeDailyRollup(client, userId, meal_date)
// 14. COMMIT
// 15. Return 200 with shape from Section 5.1
// On any DB error: ROLLBACK, logError("nutrition_log_save_failed", ...), 500
```

### 12.2 `src/app/api/nutrition/log/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: { id: string } };

// PUT /api/nutrition/log/:id
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. mealLogId = ctx.params.id  (UUID string)
// 3. Verify meal_log exists for this userId:
//    SELECT meal_log_id, meal_date FROM meal_logs WHERE meal_log_id = $1 AND user_id = $2
//    404 meal_log_not_found if 0 rows; 403 forbidden handled implicitly by user_id filter
// 4. body = await req.json().catch(() => null) — 400 invalid_body if null
// 5. Validate items[] non-empty — 400 invalid_item_fields if absent/empty
// 6. Validate each MealItemInput (same rules as POST)
// 7. BEGIN transaction
// 8. UPDATE meal_logs SET meal_type, notes, updated_at WHERE meal_log_id = $1
// 9. Full item replacement:
//    a. DELETE FROM meal_items WHERE meal_log_id = $1 AND meal_item_id != ANY($existing_ids)
//    b. For items with meal_item_id: UPDATE in place, set is_user_edited = true
//    c. For items without meal_item_id: INSERT new rows
// 10. recomputeDailyRollup(client, userId, meal_date)
// 11. COMMIT
// 12. Return 200 with shape from Section 5.3

// DELETE /api/nutrition/log/:id
export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. Verify meal_log exists and get meal_date:
//    SELECT meal_log_id, meal_date FROM meal_logs WHERE meal_log_id = $1 AND user_id = $2
//    404 meal_log_not_found if 0 rows
// 3. BEGIN transaction
// 4. DELETE FROM meal_logs WHERE meal_log_id = $1
//    (meal_items cascade-deleted via FK ON DELETE CASCADE)
// 5. recomputeDailyRollup(client, userId, meal_date)
// 6. COMMIT
// 7. Return 200 with shape from Section 5.4
```

### 12.3 `src/app/api/nutrition/today/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. date = req.nextUrl.searchParams.get("date") ?? todayUtc()
//    todayUtc(): new Date().toISOString().slice(0, 10)
//    Validate format — 400 invalid_date if malformed
// 3. pool/client (read-only, no transaction needed)
// 4. ensureNutritionProfile(client, userId)      // idempotent, no-op if exists
// 5. syncTrainingDay(client, userId, date)       // upserts goals row for this date
// 6. Parallel queries:
//    a. SELECT * FROM nutrition_goals_daily WHERE user_id=$1 AND goal_date=$2
//    b. SELECT * FROM daily_nutrition_rollups WHERE user_id=$1 AND rollup_date=$2
//    c. SELECT ml.*, json_agg(mi.* ORDER BY mi.sort_order) as items
//         FROM meal_logs ml
//         LEFT JOIN meal_items mi ON mi.meal_log_id = ml.meal_log_id
//         WHERE ml.user_id=$1 AND ml.meal_date=$2
//         GROUP BY ml.meal_log_id
//         ORDER BY ml.created_at ASC
// 7. Sparse-data fallback:
//    - goals row missing: synthesise from nutrition_profile defaults (or system defaults)
//    - rollup row missing: use zero-valued DailyRollup
//    - meals missing: return empty array []
//    NEVER return null for goals, totals, or deltas
// 8. Compute deltas (targets minus actuals; floor at 0 for "remaining", raw for "headroom")
// 9. Return 200 with shape from Section 5.5
```

### 12.4 `src/app/api/nutrition/week/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. weekStart = req.nextUrl.searchParams.get("weekStart")
//    If absent: compute from getWeekStartDateUtc(new Date())
//               (reuse same helper from src/lib/db/rollups.ts)
//    If present: validate ISODate format AND getUTCDay() === 1 (Monday)
//                400 invalid_weekStart if either fails
// 3. Build 7 ISO date strings: weekStart + 0..6 days
// 4. Batch queries:
//    a. SELECT * FROM nutrition_goals_daily
//         WHERE user_id=$1 AND goal_date >= $2 AND goal_date < $3
//    b. SELECT * FROM daily_nutrition_rollups
//         WHERE user_id=$1 AND rollup_date >= $2 AND rollup_date < $3
// 5. For each of the 7 dates, merge goals + rollup:
//    - goals missing for a date: use system defaults (2050 cal, 160g protein)
//    - rollup missing for a date: all totals = 0
//    - adherence_pct = min(100, round((total_calories / target_calories) * 100))
//      returns 0 if target_calories = 0
// 6. Return 200 with shape from Section 5.6 (exactly 7 day objects, no nulls)
```

### 12.5 `src/app/api/nutrition/history/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. Parse and validate query params using NutritionHistoryQuery (Section 11.5):
//    - from and to required — 400 invalid_date_range if absent
//    - from <= to — 400 invalid_date_range if not
//    - date range <= 365 days — 400 invalid_date_range if exceeded
//    - page >= 1; pageSize 1-90
// 3. COUNT query:
//    SELECT COUNT(DISTINCT rollup_date) FROM daily_nutrition_rollups
//    WHERE user_id=$1 AND rollup_date >= $2 AND rollup_date <= $3
// 4. Paginated data query (join rollups + goals):
//    SELECT
//      dnr.rollup_date as date,
//      dnr.meal_count,
//      dnr.total_calories,
//      dnr.total_protein_g,
//      COALESCE(ngd.is_training_day, false) as is_training_day,
//      COALESCE(ngd.target_calories, 2050) as target_calories
//    FROM daily_nutrition_rollups dnr
//    LEFT JOIN nutrition_goals_daily ngd
//      ON ngd.user_id = dnr.user_id AND ngd.goal_date = dnr.rollup_date
//    WHERE dnr.user_id=$1 AND dnr.rollup_date >= $2 AND dnr.rollup_date <= $3
//    ORDER BY dnr.rollup_date DESC
//    LIMIT $4 OFFSET $5
// 5. Compute adherence_pct per row (same formula as week endpoint)
// 6. Return 200 with shape from Section 5.7
```

### 12.6 `src/app/api/nutrition/insights/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. date = searchParams.get("date") ?? todayUtc(); validate ISODate format
// 3. Fetch rollup for date from daily_nutrition_rollups
//    If no rollup: return { date, insights: [] }  (no meals = no alerts)
// 4. Fetch goals for date from nutrition_goals_daily
//    If no goals: use system defaults for threshold comparison
// 5. Run rule-based checks (all from Section 5.8 trigger table):
//    Each check produces an InsightCandidate:
//    { insight_type, recommendation_text, context_json }
// 6. For each InsightCandidate:
//    UPSERT nutrition_insights
//      ON CONFLICT (user_id, insight_type, date_trunc('day', generated_at))
//      DO UPDATE SET recommendation_text = excluded.recommendation_text
//                  , is_dismissed = false  -- re-surface if condition re-triggers
//    NOTE: Add a unique partial index to support this upsert:
//      CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_user_type_day
//        ON nutrition_insights(user_id, insight_type, date_trunc('day', generated_at));
//    Add this index to 0011_nutrition_foundation.sql before Sprint 4.
// 7. SELECT all non-dismissed insights for this user generated today
// 8. Return 200 with shape from Section 5.8
```

### 12.7 `src/app/api/nutrition/plan/generate/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse>
// Steps:
// 1. requireConfig(); userId = CONFIG.SINGLE_USER_ID
// 2. body = await req.json().catch(() => null) — 400 invalid_body if null
// 3. Validate required fields:
//    - plan_date: ISODate — 400 invalid_constraints if missing/malformed
//    - day_type: DayType — 400 invalid_constraints if invalid
//    - target_calories: number > 0 — 400 invalid_constraints if not
//    - target_protein_g: number > 0 — 400 invalid_constraints if not
// 4. Merge constraints with hardcoded defaults:
//    allowed  = body.constraints?.allowed_proteins  ?? ["chicken","shrimp","eggs","dairy","plant"]
//    forbidden = body.constraints?.forbidden_proteins ?? ["fish","beef","lamb","pork","goat"]
//    Validate: if any forbidden item appears in allowed list -> 400 invalid_constraints
// 5. If OPENAI_API_KEY missing: 503 openai_unavailable
// 6. Call gpt-4o via callOpenAI() with buildMealPlanSystemPrompt(constraints)
//    Request JSON response with schema:
//    { meals: Array<{ meal_type, description, items: ParsedFoodItem[], total_calories, total_protein_g, total_carbs_g, total_fat_g }> }
// 7. Parse and validate AI response:
//    - Must be valid JSON — 422 plan_generation_failed if not
//    - Must contain at least 2 meals — 422 plan_generation_failed if not
// 8. Server-side protein constraint check:
//    forbidden_regex = /fish|beef|lamb|pork|goat/i
//    For each meal: check description + JSON.stringify(items) against regex
//    If match found -> 422 forbidden_protein_in_plan (do NOT save, do NOT log image data)
// 9. BEGIN transaction
// 10. INSERT nutrition_plans row
// 11. INSERT nutrition_plan_meals rows (one per meal in AI response)
// 12. COMMIT
// 13. Return 200 with shape from Section 5.9
// On DB error: ROLLBACK, logError("nutrition_plan_generate_failed", ...), 500
```

---

### Index addition for Sprint 4 (add to `0011_nutrition_foundation.sql` before Sprint 4 work starts)

The insights upsert pattern in Section 12.6 requires one additional unique index. Add this block to the bottom of `0011_nutrition_foundation.sql`:

```sql
-- Required for insights upsert deduplication (used in GET /api/nutrition/insights)
-- Add before Sprint 4 begins. Safe to run on existing DB (IF NOT EXISTS guard).
CREATE UNIQUE INDEX IF NOT EXISTS uq_insights_user_type_day
  ON nutrition_insights(user_id, insight_type, date_trunc('day', generated_at));
```

---

*Document complete. Do not begin implementation until reviewed and approved.*
