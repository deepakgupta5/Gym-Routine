# Nutrition + Training PWA PRD v1.2 - Architecture Addendum

Version: 1.2 (Addendum)
Date: 2026-02-24
Base document: `docs/nutrition-pwa-prd-v1.1-2026-02-24.md`
Original PRD reference: `docs/nutrition-pwa-execution-backlog-v1.0.md`

## 1. Purpose
This addendum introduces a local-first nutrition intelligence architecture and interaction model, adding the exact requirements requested for:
- richer meal interaction behavior,
- deterministic food matching and portion resolution,
- SQLite on-device storage,
- strict tool API surface for logging/edit/undo,
- phased MVP build order.

## 1.0 Scope Precedence (Normative)

To remove contradictions with v1.0/v1.1 and shipped code:
- v1.0 backlog + v1.1 shipped PRD remain the authoritative implementation scope for this repo.
- This v1.2 document contains exploratory architecture options and interaction patterns.
- Any v1.2 item that conflicts with current server-backed Supabase + OpenAI architecture is non-blocking and not required for release acceptance.
- Specifically, USDA-first matching and SQLite-only storage are optional future tracks, not active release gates.

## 1.1 Ambiguity Resolutions (Binding)

These clarifications are now normative for implementation and testing:

1. Parse latency
- Measure parse stage only as `parse_duration_ms` around OpenAI call.
- SLO: p95 <= 3000 ms (rolling 7-day).
- Enforce hard timeout: 2500 ms per OpenAI parse call.

2. Parse success boundary
- Success requires >=1 parsed item and >=1 item with non-zero meaningful nutrition (`calories|protein_g|carbs_g|fat_g|fiber_g`).
- `overall_confidence < 0.30` => emit warning `low_confidence_parse` and allow save.
- 0-item or all-zero result => parse failure fallback path.

3. Weekly target adjustment from body stats
- Window: last 14 days ending at `goal_date`.
- Minimum evidence: >=4 weigh-ins and >=7-day span.
- `weekly_delta_lb = ((last - first) / day_span) * 7`.
- Adjustment: <= -1.5 lb/week => +100 kcal; >= -0.25 lb/week => -100 kcal; else 0.

4. Auto meal-type timezone
- Input uses client local timezone offset (`client_tz_offset_min`).
- Fallback to UTC when offset missing.
- Time buckets remain: breakfast <10, lunch 10-14, snack 14-17, dinner >=17.

5. TDEE override semantics
- `effective_tdee = tdee_override ?? tdee_calculated ?? 2550`.
- Base targets: training `effective_tdee - 350`, rest/deload `effective_tdee - 500`.
- Override is edited via Settings (`GET/PUT /api/nutrition/profile`).
- Override changes regenerate future goals only (`goal_date >= today`), never retroactive.

## 2. Scope Additions (Exact Requirement Coverage)

### 2.1 Interaction Layer
Input support:
- free text meal logs,
- photo meal logs (already present, retained),
- shorthand edits.

Output support:
- itemized macros,
- meal totals,
- day totals,
- remaining vs targets.

Agent behavior rules:
- default units to grams/ml when possible,
- ask clarification only when it changes nutrition materially,
- support shortcuts:
  - `same as yesterday's breakfast`
  - `add 1 tbsp olive oil`
  - `half portion`

### 2.2 Nutrition Backend
Primary provider:
- USDA FoodData Central (FDC).

Fallbacks:
- pinned alias match,
- custom user food,
- AI estimate fallback only when provider match is low confidence.

### 2.3 Matching Strategy
Tiered resolver:
1. Exact pinned match for alias/user phrase.
2. High-confidence auto match using lexical + semantic + nutrition sanity checks.
3. Disambiguation prompt with 2-4 candidates.
4. Custom food creation path.

Rule:
- never ask twice for same alias once user has chosen and alias is pinned.

### 2.4 Portion Resolution
Resolution priority:
1. grams/ml direct
2. provider serving conversion
3. local conversion table + food-specific overrides
4. per-food typical grams-per-unit for count units.

Every entry stores:
- original user text,
- resolved grams,
- conversion rule used.

### 2.5 Day-1 Product Capabilities
- log meal,
- edit/undo,
- day summary,
- favorites + recents,
- recipe mode (ingredients + servings, then log servings),
- CSV export.

### 2.6 Storage Policy
- primary storage: on-device SQLite,
- no cloud sync by default,
- cloud sync optional and explicit.

## 3. Architecture Decision

## 3.1 Runtime Model
- Local-first data plane (SQLite in app runtime).
- Server-assisted lookup plane (FDC proxy and optional cache).
- Existing Supabase nutrition tables remain backward-compatible for current web deployment and optional sync.

## 3.2 Web/PWA SQLite implementation
For this repository (Next.js PWA), SQLite will run via OPFS-backed WASM SQLite (or equivalent local SQLite layer).
If OPFS is unavailable, fallback storage is IndexedDB-backed SQLite adapter.

## 4. Data Model + Migration Filenames

## 4.1 Client SQLite migrations (new)
Create folder:
- `src/lib/nutrition/local/migrations/`

Migration files (exact):
1. `0001_local_food_catalog.sql`
2. `0002_local_meal_entries.sql`
3. `0003_local_alias_pins.sql`
4. `0004_local_portion_conversions.sql`
5. `0005_local_recipes.sql`
6. `0006_local_favorites_recents.sql`
7. `0007_local_undo_log.sql`

Table intents:
- `local_food_catalog`: normalized foods, source (`fdc|custom|ai_fallback`), nutrient profile.
- `local_meal_entries`: itemized meal entries, raw text, resolved grams, conversion rule.
- `local_alias_pins`: alias -> canonical food mapping (never ask twice).
- `local_portion_conversions`: unit conversions and per-food overrides.
- `local_recipes`, `local_recipe_items`: recipe definitions and ingredients.
- `local_favorites`, `local_recents`: one-tap relogging.
- `local_undo_log`: reversible command history for `undo_last()`.

Mandatory columns on local entry rows:
- `raw_user_text`
- `resolved_grams`
- `conversion_rule_id` or `conversion_rule_name`

## 4.2 Server migrations (optional sync/cache path)
Create Supabase migrations (exact filenames):
1. `supabase/migrations/0014_food_match_cache.sql`
2. `supabase/migrations/0015_nutrition_alias_pins.sql`
3. `supabase/migrations/0016_nutrition_custom_foods.sql`
4. `supabase/migrations/0017_nutrition_recipes.sql`

Purpose:
- FDC result caching,
- cross-device alias pin sync (only if sync enabled),
- custom foods and recipes persistence.

Default behavior:
- app functions without these sync tables; local SQLite remains source of truth unless user enables sync.

## 5. Endpoint Contracts (New in v1.2)

All endpoints are server-side only. No API key exposure to client.

## 5.1 `GET /api/foods/search?q=<text>&limit=<n>`
Purpose:
- proxy USDA search and return 5-10 ranked candidates.

Response `200`:
- `candidates[]` with:
  - `fdc_id`
  - `name`
  - `brand?`
  - `kcal_per_100g`
  - `protein_per_100g`
  - `carbs_per_100g`
  - `fat_per_100g`
  - `confidence`

Errors:
- `400 invalid_query`
- `502 fdc_unavailable`

## 5.2 `POST /api/foods/pin`
Purpose:
- pin alias to selected food ("never ask twice" rule).

Request:
- `alias: string`
- `fdc_id | custom_food_id`

Response `200`:
- `{ ok: true, alias, pinned_to }`

Errors:
- `400 invalid_body`

## 5.3 `POST /api/nutrition/interpret`
Purpose:
- parse user phrase into action plan and detect if clarification required.

Request:
- `{ text, date, meal }`

Response `200`:
- `{ intent, items, requires_clarification, clarification_options[] }`

Clarification trigger policy:
- ask only if estimated impact crosses threshold (e.g., >80 kcal difference or >10% macro uncertainty).

## 5.4 `POST /api/nutrition/log-food`
Purpose:
- canonical logging endpoint used by AI/manual/photo flows after resolution.

Request:
- `{ datetime, meal, alias_or_food_id, qty, unit, raw_user_text? }`

Response `200`:
- `{ ok, entry_id, item_totals, meal_totals, day_totals, remaining_vs_targets }`

## 5.5 `GET /api/nutrition/day-summary?date=YYYY-MM-DD`
Purpose:
- totals + remaining + adherence.

Response `200`:
- `{ totals, targets, remaining, adherence_pct, meals[] }`

## 5.6 `PATCH /api/nutrition/entry/:id`
Purpose:
- edit entry with deterministic recompute.

## 5.7 `POST /api/nutrition/undo-last`
Purpose:
- reverse last mutation from undo log.

## 5.8 `POST /api/nutrition/recipe`
Purpose:
- define recipe with ingredients and servings.

## 5.9 `POST /api/nutrition/recipe/log`
Purpose:
- log N servings of named recipe.

## 5.10 `GET /api/nutrition/export/csv?from&to`
Purpose:
- export nutrition logs as CSV.

## 6. UI Changes (Mapped)

## 6.1 Nutrition Day page
File target:
- `src/app/nutrition/components/NutritionTodayClient.tsx`

Required UX changes:
- mode switcher tabs: `Text + AI | Manual | Photo`
- clear per-mode primary CTA:
  - `Save With AI`
  - `Save Manual Meal`
  - `Save Photo Meal`
- clarification modal only when material impact threshold is exceeded,
- shortcuts input recognition:
  - `same as yesterday's breakfast`
  - `add 1 tbsp olive oil`
  - `half portion`

## 6.2 History/Trends/More
File targets:
- `src/app/more/page.tsx`
- `src/app/nutrition/components/NutritionHistoryClient.tsx`
- `src/app/nutrition/components/NutritionTrendsClient.tsx`

Required UX changes:
- keep Nutrition History and Nutrition Trends in More section,
- add Favorites/Recents quick-relog module on Nutrition Day.

## 6.3 Recipe mode UI
New files:
- `src/app/nutrition/recipes/page.tsx`
- `src/app/nutrition/components/RecipeBuilder.tsx`
- `src/app/nutrition/components/RecipeLogQuickAction.tsx`

## 7. Agent Tool Surface (v1.2)

Required tool-equivalent operations:
1. `search_food(query)` -> `GET /api/foods/search`
2. `pin_food(alias, food_id)` -> `POST /api/foods/pin`
3. `log_food(...)` -> `POST /api/nutrition/log-food`
4. `day_summary(date)` -> `GET /api/nutrition/day-summary`
5. `edit_entry(entry_id, changes)` -> `PATCH /api/nutrition/entry/:id`
6. `undo_last()` -> `POST /api/nutrition/undo-last`

## 8. Portion Defaults (Editable Seed Set)
Seed defaults (hardcoded and editable):
- egg: 50g per large egg
- banana: 118g edible portion
- apple (medium): 182g
- olive oil: 13.5g per tbsp
- cooked rice: log by cooked grams

Uncertain units:
- ask once,
- persist as alias conversion override,
- never ask same alias again unless user explicitly resets pin.

## 9. MVP Build Order (fastest path)
1. Local SQLite schema + migrations (`0001`..`0007` local)
2. USDA search wrapper + food detail cache (`0014` optional server cache)
3. Portion resolver + alias pinning
4. Logging + edit + undo
5. Day summary + favorites/recents + CSV export
6. Recipe mode

## 10. Acceptance Matrix Additions (v1.2)

### 10.1 Clarification policy
- entering `1 bowl rice` asks size clarification only once for same alias.
- if user selects 250g bowl once, later logs auto-resolve without prompt.

### 10.2 Shortcuts
- `same as yesterday's breakfast` duplicates previous items into today breakfast.
- `add 1 tbsp olive oil` appends item and recomputes meal/day totals.
- `half portion` applies 0.5 multiplier to last addressed item/meal.

### 10.3 Manual mode guardrail
- manual save must require non-zero calories or macro field to prevent false zero-total logs.

### 10.4 No-cloud-default
- app must operate fully in local mode with network disabled (except USDA lookup).
- sync operations remain disabled unless explicitly enabled.

## 11. Explicit Non-Goals (v1.2)
- full social/sharing layer
- wearable integration
- barcode scanner (deferred)
- automatic cloud sync default-on behavior

## 12. Original PRD
Original baseline PRD/backlog remains unchanged at:
- `docs/nutrition-pwa-execution-backlog-v1.0.md`

Current shipped summary PRD remains at:
- `docs/nutrition-pwa-prd-v1.1-2026-02-24.md`

This document is an additive architecture delta only.
