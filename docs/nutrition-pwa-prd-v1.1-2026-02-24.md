# Nutrition + Gym Integrated PWA PRD (Shipped, Implementation-Locked)

Version: 1.1  
Updated: 2026-02-26  
Type: Single integrated PWA  
Source of truth: Current repository implementation + applied migrations

## 0) Document Precedence Lock
For implementation and compliance scoring in this repository:
1. This v1.1 document is the canonical shipped behavior contract.
2. `docs/nutrition-pwa-execution-backlog-v1.0.md` remains historical planning/reference.
3. `docs/nutrition-pwa-prd-v1.2-architecture-addendum.md` sections marked exploratory are non-release-gating unless explicitly adopted by a separate decision record.

Canonical resolved choices for shipped behavior:
- Bottom nav first tab label is `Gym`.
- Nutrition Day entry modes are `Text` and `Photo`.
- Nutrition Day has no standalone `Manual` mode tab.
- Nutrition Day logger meal-type selector exposes `Breakfast | Lunch | Snack | Dinner` in UI.

## 1) Product Objective
One daily-use system combining gym execution and nutrition adherence with low-friction logging, centered on repeatable workout execution and meal adherence visibility.

## 2) Release State (Current Repo)
### Sprint status
- Sprint 0 (gym stability hardening): DONE
- Sprint 1 (nutrition schema + RLS + profile/goals/sync): DONE
- Sprint 2 (nutrition log + rollup + read APIs): DONE
- Sprint 3 (navigation + nutrition day/history UI): DONE
- Sprint 4 (insights + plan + trends + dashboard merge): DONE
- Sprint 5 (tests/CI/security verification baseline): DONE

### Current quality gates (local run on 2026-02-26)
- `npm run lint`: FAIL
  - error: `react-hooks/set-state-in-effect` in `src/app/nutrition/components/NutritionTodayClient.tsx`
  - warning: unused variable in `tests/api/nutritionInsights.test.ts`
- `npm test`: PASS (23 files, 75 tests)
- `npm run build`: PASS

## 3) Navigation + IA (Shipped)
Bottom tabs:
- Gym (`/today`, includes `/session/[date]`)
- Nutrition (`/nutrition/today`)
- Dashboard (`/dashboard`)
- More (`/more`)

Primary routes:
- `/today`: gym entry
- `/session/{date}`: session logger
- `/nutrition/today`: nutrition day view + add/edit/delete meal logs
- `/nutrition/history`: nutrition history
- `/nutrition/trends`: nutrition trend view
- `/nutrition/plan`: meal plan generation
- `/dashboard`: unified gym + nutrition summary
- `/more`: links hub for history/upload/export/settings

## 4) Shipped Nutrition Day UX Contract
Implemented in:
- `src/app/nutrition/components/NutritionTodayClient.tsx`
- `src/app/nutrition/components/MealLogForm.tsx`
- `src/app/nutrition/components/MealHistory.tsx`

### 4.1 Add meal card
- Meal type dropdown shows: `Breakfast`, `Lunch`, `Snack`, `Dinner`.
- Free-text meal description input appears above mode buttons.
- Mode buttons are `Text` and `Photo`.
- `Text` triggers parse-preview flow immediately.
- `Photo` opens photo selection flow; selected photo can be parsed and reviewed.
- No standalone manual mode toggle.
- No add-meal notes input field in the add card.
- No shortcut chips in add card (`same as yesterday`, `add 1 tbsp olive oil`, `half portion` are not shown).

### 4.2 Parse-review-save behavior
- Text parse uses preview-first flow.
- Photo parse also returns preview items for review.
- Parsed items are shown in `Review Parsed Items` with editable labeled nutrient fields and per-item remove action.
- User can add/remove/edit items, then save via `Save Reviewed Meal`.

### 4.3 Meal history behavior
- Existing meals render with source and summary values.
- Each meal supports `Update Meal` and `Delete Meal`.

### 4.4 Insights behavior
- Insights panel shows deficiency/coaching/supplement cards from `/api/nutrition/insights`.
- Water-specific coaching card is not part of current shipped insights generation logic.

## 5) Shipped API Contract
### 5.1 `POST /api/nutrition/log-preview`
Purpose: parse text to editable preview before final save.

Returns on success:
- `items`, `ai_model`, `ai_confidence`, `parse_duration_ms`, `parse_p95_7d_ms`, `warnings`.

Failure behavior:
- Returns `422 parse_failed_manual_required` with detail code for parse/config/upstream issues.
- Detail values include: `ai_not_configured`, `openai_timeout`, `openai_auth_failed`, `openai_rate_limited`, `openai_model_unavailable`, `openai_request_failed`, `openai_empty_response`, `openai_response_invalid_json`, `parse_empty_items`, `parse_no_meaningful_nutrition`.

### 5.2 `POST /api/nutrition/log`
Purpose: persist meal logs and items; recompute rollups.

Accepted `save_mode`:
- `ai_parse`
- `ai_reviewed`
- `manual`

Accepted `meal_type` request values:
- `breakfast|lunch|dinner|snack|auto`
- `auto` resolves server-side using client timezone offset if provided.

Behavior:
- Forbidden protein guard enforced on raw input and item names.
- Recomputes daily rollup after save.
- Writes parse metrics when applicable.

### 5.3 `POST /api/nutrition/log-photo`
Purpose: transient photo parse to structured items (no photo persistence).

Behavior:
- Validates file type/size.
- Parses with retry/fallback model logic.
- Returns structured items for review; no image data persisted.
- Returns detailed parse failure information.

### 5.4 `GET /api/nutrition/today`
Purpose: return goals/totals/deltas/meals for one date.

Notes:
- Response currently includes legacy water fields in shape (`target_water_ml`, `water_ml`, `water_remaining_ml`) for compatibility.
- Nutrition Day UI does not expose a dedicated water logging card/control.

### 5.5 `GET /api/nutrition/week`, `GET /api/nutrition/history`
- Week and history nutrition read endpoints are implemented.

### 5.6 `GET /api/nutrition/insights`
- Rule-driven insight generation from daily rollups.

### 5.7 `POST /api/nutrition/plan/generate`
- Meal plan generation endpoint is implemented with allowed/forbidden protein constraints.

### 5.8 `GET/PUT /api/nutrition/profile`
- Supports TDEE override flow used by Settings.
- Override updates future goals from today forward.

### 5.9 Removed endpoint
- `POST /api/nutrition/water` is removed from shipped scope.

## 6) Dashboard Contract (Shipped)
Implemented in:
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/components/SparklineChart.tsx`
- `src/app/dashboard/components/WeightChart.tsx`
- `src/app/dashboard/components/NutritionQuickStats.tsx`

### 6.1 Current section behavior
- Week summary card grid is present.
- Primary lift sparkline cards are present.
- Body stats trend cards are present.
- Nutrition quick stats card is present at the bottom of dashboard content.

### 6.2 Personal records badge
- Previous PR badge/card is removed from current dashboard UI.

### 6.3 Chart labeling and span markers
- Primary-lift sparkline cards show axis markers/labels: `Start`, `Mid`, `Current`.
- Body-metric cards show axis markers/labels: `Start`, `Mid`, `Current`.

### 6.4 Body metrics shown on dashboard
- Body Weight
- Skeletal Mass
- Basal Metabolic Rate
- Body Fat %
- SMI

### 6.5 Body history window
- Dashboard body metric charts use full available history from `body_stats_daily` (no 30-point chart cap in current code).

## 7) Gym Session UI Contract (Shipped)
Implemented in:
- `src/app/session/[date]/useSessionLoggerController.ts`
- `src/app/session/[date]/components/SetLogRow.tsx`

Behavior:
- Logged set rows show neutral labels `Set #N`.
- Logged row UI does not display TOP/BACKOFF pills.
- New set default type in current session flow maps to `straight` or `accessory` by exercise role.

## 8) Settings Contract (Shipped)
Implemented in `src/app/settings/page.tsx`.

- Displays calculated/effective/override TDEE.
- Allows Save Override and Clear Override.
- Shows training/rest calorie targets derived from effective TDEE.
- Explicitly states override affects future goals only.

## 9) Body Stats Capture + Migration Contract
### 9.1 Applied/required migration chain in repo
- `0011_nutrition_foundation.sql`
- `0012_nutrition_rls.sql`
- `0013_fix_utc_date_search_path.sql`
- `0014_supabase_lints_cleanup.sql`
- `0015_nutrition_parse_metrics.sql`
- `0016_body_stats_extended_metrics.sql`
- `0017_supabase_lints_parse_metrics_and_fk_indexes.sql`

### 9.2 Parse metrics table
- Canonical table name: `public.nutrition_parse_metrics`.
- Rolling p95 helper reads from this table.

### 9.3 Extended body-stats fields captured by upload pipeline
- `skeletal_mass`, `bodyfat_lb`, `bmi`, `lean_body_mass_lb`, `bmr_kcal`, `smi_kg_m2`
- Segment mass columns: `left_arm_lb`, `right_arm_lb`, `trunk_lb`, `left_leg_lb`, `right_leg_lb`
- Segment ratio columns: `left_arm_ratio`, `right_arm_ratio`, `trunk_ratio`, `left_leg_ratio`, `right_leg_ratio`

## 10) Security + Privacy Contract
- RLS enabled on nutrition tables and parse metrics table.
- Photo/image payloads are not persisted by nutrition photo parse route.
- OpenAI key remains server-side only.

## 11) Known Non-Gating Notes
- v1.2 exploratory local-first items remain non-release-gating unless explicitly adopted.
- Existing Next.js warning: middleware convention deprecation (`middleware` -> `proxy`) is informational from build output.

