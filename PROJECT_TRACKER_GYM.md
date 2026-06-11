# PROJECT_TRACKER_GYM.md

Single source of truth for gym app state. Update every session.

---

## Status Snapshot -- 2026-06-10 (updated)

**Deployment:** Vercel (PRIMARY) -- `https://deepak-gym-tracker.vercel.app`
**GitHub HEAD:** pending W13 commit
**CI:** Green (150 tests)
**Migration HEAD:** 0034 (0033 + 0034 pending application to production)
**Build:** `npm run build` / Next.js / Vercel
**Vercel project:** `gym-routine` (deepak-guptas-projects-4f1b1c8b), all 6 env vars set
**Netlify site ID:** `f16ac1c7-3a1b-4e22-a39f-bc4855f18360` (exerciseplanning, deepakgupta5) -- idle
**PRD:** v2.0 rev 5 (2026-06-10)

---

## Active Work Queue

| Priority | Item | Notes |
|---|---|---|
| P2 | Dashboard weekly volume bars (PRD Section 6.3) | `v_weekly_muscle_volume` view exists; need UI bar chart per muscle group |
| P2 | /history muscle-group filter | Session-type filter exists; muscle-group filter not implemented |
| P3 | Deload auto-trigger rule (PRD Section 4.5) | CLOSED -- W10 (2026-06-10) |
| P3 | Equipment rotation week-over-week | Per-session diversity enforced; week-over-week not enforced |
| P4 | Settings frequency override | Target sessions/week (default 4, range 3-6) |
| P4 | Warm-up set logging | CLOSED -- W13 (2026-06-10) |

---

## Shipped Features (Chronological)

| Date | Commit / Migration | Feature |
|---|---|---|
| 2026-02-24 | migrations 0001-0012 | v1.1 shipped: gym tracking, nutrition foundation, RLS |
| 2026-04-13 | commit `30f0fff` | next_target_load partial fix |
| 2026-04-17 | -- | PRD v2.0 written |
| 2026-04-18 | migration 0020 | v2 data model: plan_exercises, plan_sessions v2 fields |
| 2026-05-xx | migration 0019 | Rolling scheduler v1 |
| 2026-05-30 | commit `2291878` | v2 scheduler: no-repeat filter extended to ALL roles |
| 2026-06-02 | migration 0026 | Program redesign: core exercises added, user_preference_score seeded |
| 2026-06-02 | migration 0027 | cardio_type column on plan_sessions |
| 2026-06-04 | commit `421bafc` | CardioEditor moved to bottom of session page; SessionHeader simplified |
| 2026-06-04 | commit `69bee02` | Fix CI: add 4th DB mock in planSessionMinutes.test.ts |
| 2026-06-04 | commit `5617958` | Fix TypeScript: functional update form for setSessionMinutes |
| 2026-06-05 | migration 0028 | Fix suitable_slots for exercises 26-44; purge stale future sessions |
| 2026-06-06 | commit `0138169` | Re-enable Netlify builds (remove ignore = exit 0) |
| 2026-06-06 | -- | Migrated to new Netlify account (deepakgupta5); both sites green |
| 2026-06-06 | commit `4b7d70f` | Add operational docs (PROJECT_TRACKER, LESSONS_LEARNED, INCIDENT_LOG, DECISION_LOG); PRD rev 4 |
| 2026-06-06 | commit `28a3d40` | Fix fallback scoring: recency penalty (-200) prevents repeat monopoly in small pools |
| 2026-06-06 | migration 0029 | Fix SECURITY DEFINER on v_weekly_muscle_volume + v_last_top_set_per_exercise; purge today's stale session |
| 2026-06-08 | commit `6a7cdf5` | Fix exercise repeat root cause: reduce no-repeat window from 7 to 2 days (INC-011) |
| 2026-06-08 | migration 0030 | Purge today + future unperformed sessions so they regenerate with 2-day window |
| 2026-06-09 | commit `de1639e` | Fix rotation stuck on hinge_lower: ORDER BY date ASC LIMIT 10 -> DESC LIMIT 1 (INC-012) |
| 2026-06-09 | migration 0031 | Enum values no-op + purge all unperformed sessions to reset rotation |
| 2026-06-09 | commit `5e9c0df` | PRD Section 4.4 top-set + back-off logging flow: auto-switch load, correct set_type in DB, fix top_set_history filter |
| 2026-06-09 | commit `cd816aa` | PRD Section 7 progression visibility: rationale_text format + colored rationale in ExerciseCard + DeltaBadge in TodayHeroCard |
| 2026-06-09 | commit `9b2a56b` | PRD Section 6.1 today hero + day type override: force-regen API, forcedDayType scheduler param, TodayHeroCard client component |
| 2026-06-10 | ops | Netlify account consolidation: all 3 apps on deepakgupta5; deepak-gupta5 decommissioned; Cloudflare SSL Full (strict) restored |
| 2026-06-10 | commit `a4b5f9f` | W1-W3: scheduler fixes (backoff_percent typo, forbidden_day_types, NO_REPEAT_DAYS removed); bodyweight 0lb fix; roundToIncrement; 5x network safety; Skip All confirm modal |
| 2026-06-10 | commit `f3c7188` | W4: dashboard empty state (P1-4); session error CTAs (P1-5); settings deload always visible (P2-8) |
| 2026-06-10 | commit `66685ae` | W5: N+1 bulk UPDATE (P2-9); body_stats 365-day cap (P2-12); nutrition error codes + date format (P2-13/14) |
| 2026-06-10 | commit `1779e43` | W6: migration 0032 -- RLS on planned_workouts + muscle_exposures; v_last_top_set set_type filter; 2 indexes; backoff_percent backfill; drop orphaned index |
| 2026-06-10 | commit `51d923e` | W7 audit fixes: settings fetch safety BLOCKER; loadWeeklyMuscleVolume fallback; core removed from WEEKLY_MIN_SETS; 6 new tests; back-off assertion fix |
| 2026-06-10 | pending | W8: MuscleVolumeCard dashboard bars; W9: /history muscle filter; W10: deload auto-trigger; W11: equipment rotation; W12: settings frequency override |
| 2026-06-10 | pending | W13: warm-up set logging -- migration 0034 is_warmup, Log Warmup button, excluded from volume/rollup/progression |

---

## Data Model

**Migration HEAD:** 0034 (0033 target_sessions_per_week + 0034 is_warmup -- pending production apply)
**Key tables:** `plan_sessions`, `plan_exercises`, `set_logs`, `exercises`, `body_stats_daily`
**Key fields on exercises:** `suitable_slots`, `allowed_day_types`, `forbidden_day_types`, `user_preference_score`, `uses_bodyweight`, `load_increment_lb`
**Key fields on set_logs:** `is_warmup` (BOOLEAN DEFAULT FALSE) -- excludes from volume, weekly rollup, top_set_history, progression
**Key fields on plan_sessions:** `cardio_type`, `performed_at`, `cardio_saved_at`, `session_blueprint_version`
**Key views:** `v_weekly_muscle_volume` (rolling 7-day sets per muscle), `v_last_top_set_per_exercise` (most recent top/straight set per exercise)
**Key indexes (0032):** `idx_set_logs_top_set` (partial, set_index=1), `idx_plan_sessions_user_date_type` (covering)

**suitable_slots assignments (post-0028):**
- `['primary','secondary']` -- exercises 26 (Back Squat), 28 (Pull-Up)
- `['secondary','accessory']` -- exercises 27, 29-34, 38, 40
- `['accessory']` -- exercises 35-37, 39, 41-42
- Core exercises (43 Cable Crunch, 44 Hanging Knee Raise, 25 Pallof Press): fixed in 0026

**WEEKLY_MIN_SETS (Section 3.3, in constants.ts):**
- quads:12, hamstrings:10, glutes:12, chest:12, back:14, shoulders:12, biceps:8, triceps:8, calves:8
- core intentionally omitted (no dedicated day type in 5-day rotation; cannot trigger override)

---

## Known Gaps / Bugs (Open)

| ID | Description | Status |
|---|---|---|
| G1 | Load progression (PRD 4.4) | CLOSED -- 2026-06-09 |
| G2 | Progression visibility (rationale text) | CLOSED -- 2026-06-09 |
| G3 | Equipment diversity not enforced | CLOSED -- already implemented (EQUIPMENT_GROUPS + requiredEquipmentTypes()) |
| G4 | Exercise repeat | CLOSED -- 2026-06-09 |
| G5 | Rotation stuck on hinge_lower | CLOSED -- 2026-06-09 |
| G6 | Network safety -- bare fetch calls | CLOSED -- 2026-06-10 (W3 + W7 audit) |
| G7 | Settings loading state stuck on network error | CLOSED -- 2026-06-10 (W7 audit) |
| G8 | Bodyweight exercises show 0 lb instead of "Bodyweight" | CLOSED -- 2026-06-10 (W2) |
| G9 | backoff_percent written as 0.1 (10%) instead of 0.9 (90%) | CLOSED -- 2026-06-10 (W1 code + W6 DB backfill) |
| G10 | Weekly minimum sets not tracked or enforced | CLOSED -- 2026-06-10 (W1, Section 3.3 Wednesday gate) |

---

## Next Session Checklist

- [ ] **CRITICAL: Apply migrations to production Supabase (SQL editor):**
  - Migration 0033 (target_sessions_per_week): `ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS target_sessions_per_week SMALLINT NOT NULL DEFAULT 4 CONSTRAINT chk_target_sessions_range CHECK (target_sessions_per_week BETWEEN 3 AND 6);`
  - Migration 0034 (is_warmup): see `supabase/migrations/0034_is_warmup.sql`
- [ ] Consider integration test suite (real PostgreSQL container in CI) -- flagged in GYM_APP_AUDIT.md Section 5c
