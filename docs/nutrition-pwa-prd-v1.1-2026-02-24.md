# Nutrition + Gym Integrated PWA PRD (Updated)

Version: 1.1  
Date: 2026-02-25  
Type: Single integrated PWA  
Source of truth: Current repository implementation + applied migrations


## 0) Document Precedence Lock (2026-02-25)
For compliance scoring in this repo:
1. Canonical release-gating UI and behavior contract is this v1.1 document.
2. v1.0 backlog remains a detailed implementation reference; when wording conflicts with v1.1 shipped summary, v1.1 prevails.
3. v1.2 addendum Sections 2-10 are exploratory and non-release-gating unless a separate local-first adoption record is added.
4. Canonical contradiction resolutions for current release:
   - Bottom nav first tab label is `Gym`.
   - Manual nutrition save allows zero macro/calorie values.
   - v1.2-only day-page clarification modal, shortcuts, Favorites/Recents, and Recipe mode are not required for release acceptance.

## 1) Product Objective
One daily-use system combining gym execution and nutrition adherence with low-friction logging, focused on fat loss, waist reduction, and muscle retention.

## 2) Current Delivery Status

### Sprint status matrix
- Planning lock: DONE
- Sprint 0 (gym stability hardening): DONE
- Sprint 1 (schema + RLS + profile/goals/sync): DONE
- Sprint 2 (nutrition log + rollup + read APIs): DONE
- Sprint 3 (nav + nutrition today/history UI): DONE
- Sprint 4 (insights + plan + trends + unified dashboard): DONE
- Sprint 5 (tests + CI + smoke + security verification): DONE
- Dedicated lint cleanup sprint: DONE (`npm run lint` clean)

### Current release gates (local repo)
- `npm run lint`: PASS
- `npm test`: PASS
- `npm run build`: PASS

### 2026-02-25 Implementation Update
- Nutrition Day water tracking UI is present (water input + save action) and wired to `POST /api/nutrition/water`.
- `GET /api/nutrition/today` includes water fields in goals/totals/deltas (`target_water_ml`, `water_ml`, `water_remaining_ml`).
- AI-unavailable fallback message is explicit in both text-parse and photo-parse manual fallback paths.
- Added API coverage: `tests/api/nutritionToday.test.ts` for water target/current/remaining response shape.

## 3) Navigation + IA (Shipped)
Bottom tabs are now:
- Gym (`/today`, includes `/session/[date]`)
- Nutrition (`/nutrition/today`)
- Dashboard (`/dashboard`)
- More (`/more`)

### Route map
- `/today`: gym entry
- `/session/{date}`: session logger
- `/nutrition/today`: nutrition day view + create/edit/delete meal logs
- `/nutrition/history`: range-based nutrition history
- `/nutrition/plan`: AI meal plan generation
- `/nutrition/trends`: 7-day/30-day adherence visuals
- `/dashboard`: unified gym + nutrition summary
- `/more`: workout history, upload, export CSV, settings

## 4) Database/Migration Contract (Locked)
Apply order:
1. `supabase/migrations/0011_nutrition_foundation.sql`
2. `supabase/migrations/0012_nutrition_rls.sql`

### Includes in 0011
- 8 nutrition tables:
  - `nutrition_profile`
  - `nutrition_goals_daily`
  - `meal_logs`
  - `meal_items`
  - `daily_nutrition_rollups`
  - `nutrition_insights`
  - `nutrition_plans`
  - `nutrition_plan_meals`
- Immutable helper:
  - `public.utc_date(ts timestamptz)`
- Unique insight index:
  - `uq_insights_user_type_day` on `(user_id, insight_type, public.utc_date(generated_at))`

### Includes in 0012
- RLS enabled and policies created for all 8 nutrition tables
- Child table ownership checks via parent `EXISTS` subqueries (`meal_items`, `nutrition_plan_meals`)

### Privacy hard ban (enforced)
- No nutrition schema columns containing `photo`, `image`, `blob`, `base64`
- Photo parse endpoint does not persist image payloads

## 5) Configuration Contract
File: `src/lib/config.ts`
- Added: `OPENAI_API_KEY`
- Behavior: optional by default; only required when `requireConfig({ openai: true })` is used
- Manual logging remains fully functional without OpenAI key

## 6) Endpoint Contracts (Implemented)

## 6.1 `POST /api/nutrition/log`
Purpose: create meal log from AI parse, reviewed parse payload, or manual payload; recompute rollup.

Companion parse-preview endpoint for review-first UX:
- `POST /api/nutrition/log-preview` returns parsed editable items before save.

Request (JSON):
- `meal_date: string (YYYY-MM-DD)`
- `meal_type: "breakfast"|"lunch"|"dinner"|"snack"|"auto"`
- `save_mode: "ai_parse"|"manual"|"ai_reviewed"`
- `raw_input?: string` (required for `ai_parse`)
- `items?: MealItemInput[]` (required for `manual` and `ai_reviewed`; optional supplement for `ai_parse`)
- `notes?: string`

Success `200`:
- `{ ok: true, meal_log_id, input_mode, ai_model, ai_confidence, items_saved, rollup }`

Errors:
- `400`: `invalid_body|invalid_date|invalid_meal_type|missing_raw_input|invalid_item_fields`
- `422`: `parse_failed_manual_required`
- `500`: `nutrition_log_save_failed`

## 6.2 `POST /api/nutrition/log-photo`
Purpose: parse photo only (no DB writes); return structured items for review.

Request: multipart form-data
- `photo: File` (jpeg/png/webp/gif; <=20MB)
- `meal_date?: YYYY-MM-DD`
- `meal_type?: breakfast|lunch|dinner|snack|auto`

Success `200`:
- `{ ok: true, input_mode: "photo", ai_model, ai_confidence, items, warnings: [] }`

Errors:
- `400`: `invalid_body|photo_missing|invalid_date|invalid_meal_type`
- `413`: `photo_too_large`
- `415`: `unsupported_media_type`
- `422`: `image_unreadable|parse_failed`
- `503`: `openai_unavailable`
- `500`: `nutrition_photo_parse_failed`

## 6.3 `PUT /api/nutrition/log/:id`
Purpose: replace meal items/metadata; recompute rollup.

Request (JSON):
- `meal_type?: breakfast|lunch|dinner|snack`
- `notes?: string|null`
- `items: MealItemInput[]` (required)

Success `200`:
- `{ ok: true, meal_log_id, items_saved, rollup }`

Errors:
- `400`: `invalid_body|invalid_item_fields`
- `404`: `meal_log_not_found`
- `500`: `nutrition_log_update_failed`

## 6.4 `DELETE /api/nutrition/log/:id`
Purpose: delete meal log + cascading items; recompute rollup.

Success `200`:
- `{ ok: true, deleted_meal_log_id, rollup }`

Errors:
- `404`: `meal_log_not_found`
- `500`: `nutrition_log_delete_failed`

## 6.5 `GET /api/nutrition/today?date=YYYY-MM-DD`
Purpose: return goals, totals, deltas, meals for one day.

Success `200`:
- `{ date, goals, totals, deltas, meals }`

Notes:
- Includes water fields for day tracking:
  - `goals.target_water_ml`
  - `totals.water_ml`
  - `deltas.water_remaining_ml`
- Sparse data guaranteed (defaults returned; never null shape)
- Auto-syncs training/rest goal for the date

Errors:
- `400`: `invalid_date`
- `500`: `nutrition_today_failed`

## 6.6 `GET /api/nutrition/week?weekStart=YYYY-MM-DD`
Purpose: 7-day summary (must start Monday if provided).

Success `200`:
- `{ week_start, days: [7 rows] }`

Errors:
- `400`: `invalid_weekStart`
- `500`: `nutrition_week_failed`

## 6.7 `GET /api/nutrition/history?from&to&page&pageSize`
Purpose: paginated day-level historical summaries.

Success `200`:
- `{ from, to, page, page_size, total_days, days }`

Errors:
- `400`: `invalid_date_range`
- `500`: `nutrition_history_failed`

## 6.8 `GET /api/nutrition/insights?date=YYYY-MM-DD`
Purpose: rule-based deficiency/coaching/supplement insights with daily upsert.

Success `200`:
- `{ date, insights }`

Errors:
- `400`: `invalid_date`
- `500`: `nutrition_insights_failed`

## 6.9 `POST /api/nutrition/plan/generate`
Purpose: generate/save daily plan under protein constraints.

Request (JSON):
- `plan_date: YYYY-MM-DD`
- `day_type: training|rest|auto`
- `target_calories: number`
- `target_protein_g: number`
- `constraints.allowed_proteins?: string[]`
- `constraints.forbidden_proteins?: string[]`

Success `200`:
- `{ ok: true, plan_id, plan_date, ai_model, total_calories, total_protein_g, meals }`

Errors:
- `400`: `invalid_body|invalid_constraints`
- `422`: `plan_generation_failed|forbidden_protein_in_plan`
- `503`: `openai_unavailable`
- `500`: `nutrition_plan_generate_failed`

## 6.10 `POST /api/nutrition/water`
Purpose: set water intake for a date in daily rollups.

Request (JSON):
- `date?: YYYY-MM-DD` (defaults to today UTC if omitted)
- `water_ml: number` (0..10000)

Success `200`:
- `{ ok: true, date, water_ml }`

Errors:
- `400`: `invalid_body|invalid_date|invalid_water_ml`
- `500`: `nutrition_water_update_failed`

## 7) Shipped UI Scope
- Nutrition Today: logging, manual fallback, edit/delete, insight panel, water input/save
- Nutrition History: range filtering + empty states
- Meal Plan page: constraints input + forbidden protein surfaced in UX
- Trends page: 7-day + 30-day visuals and adherence summaries
- Dashboard merge: `NutritionQuickStats` integrated into gym dashboard
- Dashboard cleanup shipped:
  - top "Next Workout" card removed
  - upload/export action block removed from dashboard
  - export moved under More page
  - bottom tab label now "Gym"

## 8) Security + Privacy Verification
Current checks documented in:
- `docs/sprint5-security-verification-2026-02-24.md`
- `docs/release-signoff-2026-02-24.md`

Verified:
- RLS enabled on all nutrition tables
- Photo non-persistence constraints enforced
- OPENAI missing-key fallback works (`ai_parse` fails safely; manual works)

## 9) CI/Smoke Contract
- CI workflow: `.github/workflows/ci.yml`
  - `npm run test:ci`
  - `npm run build`
- Smoke script: `scripts/smoke-render.mjs`
  - includes nutrition create/read/update/delete checks
  - includes dashboard/nutrition summary checks

## 10) Remaining Work (Post-v1)
- Multi-user auth migration (replace single-user runtime assumption)
- Optional barcode and wearable integrations
- Additional deterministic tests around edge-case nutrition parsing behaviors
- Ongoing UX polish and analytics instrumentation

## 11) Decision Update
Previous release note marked lint non-blocking due backlog. That backlog is now cleared in current repo state (lint passes). Team can treat lint as blocking gate for next release cycle.
