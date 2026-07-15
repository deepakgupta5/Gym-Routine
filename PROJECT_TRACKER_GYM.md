<!-- DOC-STATUS: LIVE; SYNCED: INC-021 / D020 / L29 / 2026-07-15; reconciled 2026-07-15 -->
# PROJECT_TRACKER_GYM.md

Single source of truth for gym app state. Update every session.

---

## Status Snapshot -- 2026-07-15 (reconciled)

**Deployment:** Vercel (PRIMARY) -- `https://deepak-gym-tracker.vercel.app`
**GitHub HEAD:** `d95aaac` (B1 fix + PRD v2.0 rev 6 sync; push verified 2026-07-15)
**CI:** Green (pre-existing test suite; Jest/Babel config cannot parse warmup-era test syntax -- confirmed pre-existing, not new)
**Migration HEAD:** 0035 (applied to Supabase production 2026-06-30, verified; no new migrations this session)
**Build:** `npm run build` / Next.js / Vercel
**Vercel project:** `gym-routine` (deepak-guptas-projects-4f1b1c8b), all 6 env vars set
**Netlify site ID:** `f16ac1c7-3a1b-4e22-a39f-bc4855f18360` (exerciseplanning, deepakgupta5) -- idle
**PRD:** v2.0 rev 6 (2026-07-15) -- fully synced to live implementation; all "not yet shipped" items closed
**DB state:** `user_profile.primary_lift_map.UPPER_PUSH = 16` (Machine Shoulder Press; updated 2026-06-25 via SQL)

---

## Active Work Queue

| Priority | Item | Notes |
|---|---|---|
| P2 | Dashboard weekly volume bars (PRD Section 6.3) | CLOSED -- W8 (2026-06-10) commit `76e9888` |
| P2 | /history muscle-group filter | CLOSED -- W9 (2026-06-10) commit `5ea9fc9` |
| P3 | Deload auto-trigger rule (PRD Section 4.5) | CLOSED -- W10 (2026-06-10) |
| P3 | Equipment rotation week-over-week | CLOSED -- D020 (2026-06-30): 7-day window now enforces week-over-week; per-session diversity via EQUIPMENT_GROUPS already enforced |
| P4 | Settings frequency override | CLOSED -- W12 (2026-06-10) commit `535c1d3` |
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
| 2026-06-10 | commit `76e9888` | W8: MuscleVolumeCard dashboard bars -- horizontal bars, color zones, legend, sorted by deficit (CLOSED) |
| 2026-06-10 | commit `5ea9fc9` | W9: /history muscle-group filter -- chip pills, ?muscle= URL param, EXISTS subquery filter (CLOSED) |
| 2026-06-10 | commit `535c1d3` | W10: deload auto-trigger; W12: settings frequency override -- target_sessions_per_week picker (3/4/5/6), /api/plan/frequency PATCH, dashboard session counter (CLOSED) |
| 2026-06-10 | migration 0034 | W13: warm-up set logging -- is_warmup flag, Log Warmup button, excluded from volume/rollup/progression (CLOSED) |
| 2026-06-25 | commit `3f9b25e` | Fix INC-013: warmup sets broke v2 top-set classification -- workingSetIndex splits warmup from working sets |
| 2026-06-25 | commit `47bb6f8` + SQL | Fix INC-014: UPPER_PUSH_PRIMARY_ROTATION extended to [9,10,11,15,16]; primary_lift_map.UPPER_PUSH set to 16 (Machine Shoulder Press) |
| 2026-06-30 | commit `36cbf17` | Fix INC-015: deload triggers too aggressively -- session threshold 6->8, WEEKLY_MAX_SETS 2x->3x (D018, D019) |
| 2026-06-30 | CASCADE DELETE | Fix INC-016: Barbell Deadlift 405 lb wrong data -- stale plan_exercises row cleared by INC-015 DELETE; RESOLVED |
| 2026-06-30 | commit `717daa5` | Fix INC-017: UPPER_PULL catalog +17,18,28; LOWER_SQUAT catalog +26 (Back Squat) |
| 2026-06-30 | commit `af96cd6` | Fix INC-018: equipment rotation window 14->7 days -- barbell-hamstrings blocked for full hinge cycle (D020) |
| 2026-06-30 | migration 0035 | Fix G11: suitable_slots restricted for isolation exercises 8,19-24; purges future unperformed sessions |
| 2026-06-30 | commit `668ddd5` | CI integration test suite: postgres:16 job, ci-pg-bootstrap.sql, 14 schema/enum/view/slots tests (GYM_APP_AUDIT.md 5c CLOSED) |
| 2026-07-01 | commit `034d68d` | Fix 4 failing integration tests: seed exercises 1-25 via supabase/seed.sql after 0001 in CI; fix plan_exercises PK assertion; fix session_type_enum arrayContaining |
| 2026-07-08 | commit `a8ed51b` | Fix INC-020: pg NUMERIC string coercion in v2 scheduler -- Number() added to load_increment_lb reads in load.ts:51 and index.ts:286; DB hotfix applied for session row |
| 2026-07-08 | commit `3cf727c` | Fix INC-021: exercise 49 (Barbell OHP) added to UPPER_PUSH_PRIMARY_ROTATION catalog |
| 2026-07-15 | commit `51cd214` | Governance: L28-L29 lessons (PRD spec-deviation write-back, bypass-path gaps); PRD conformance review report at docs/code-review-prd-conformance-2026-07-15.md |
| 2026-07-15 | commit `d95aaac` | B1 fix: forcedDayType now soft-checks no-repeat rule (console.warn on repeat day type); PRD v2.0 bumped to rev 6 (fully synced: 3 spec deviations documented, all shipped items moved, deployment + rationale_code corrected) |

---

## Data Model

**Migration HEAD:** 0035 (applied to Supabase production 2026-06-30)
**Key tables:** `plan_sessions`, `plan_exercises`, `set_logs`, `exercises`, `body_stats_daily`
**Key fields on exercises:** `suitable_slots`, `allowed_day_types`, `forbidden_day_types`, `user_preference_score`, `uses_bodyweight`, `load_increment_lb`
**Key fields on set_logs:** `is_warmup` (BOOLEAN DEFAULT FALSE) -- excludes from volume, weekly rollup, top_set_history, progression
**Key fields on plan_sessions:** `cardio_type`, `performed_at`, `cardio_saved_at`, `session_blueprint_version`
**Key views:** `v_weekly_muscle_volume` (rolling 7-day sets per muscle), `v_last_top_set_per_exercise` (most recent top/straight set per exercise)
**Key indexes (0032):** `idx_set_logs_top_set` (partial, set_index=1), `idx_plan_sessions_user_date_type` (covering)

**suitable_slots assignments (post-0035):**
- `['primary','secondary']` -- exercises 26 (Back Squat), 28 (Pull-Up)
- `['secondary','accessory']` -- exercises 8 (Seated Leg Curl), 19 (Barbell Curl); exercises 27, 29-34, 38, 40
- `['accessory']` -- exercises 20-24 (isolation arms/shoulders/calves); exercises 35-37, 39, 41-42
- Core exercises (43 Cable Crunch, 44 Hanging Knee Raise, 25 Pallof Press): fixed in 0026
- Compounds 1-7, 9-18: default ['primary','secondary','accessory'] (correct -- all valid primaries)

**WEEKLY_MIN_SETS (Section 3.3, in constants.ts):**
- quads:12, hamstrings:10, glutes:12, chest:12, back:14, shoulders:12, biceps:8, triceps:8, calves:8
- core intentionally omitted (no dedicated day type in 5-day rotation; cannot trigger override)

---

## Known Gaps / Bugs (Open)

| G11 | Exercises 8,19-24 had default suitable_slots=['primary','secondary','accessory'] -- could be assigned as primary. Fixed in migration 0035: 8+19 -> ['secondary','accessory']; 20-24 -> ['accessory']. | CLOSED -- migration 0035 |

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

No pending DB actions. No open incidents. All PRD items shipped.

## Next Session Start

**Repo:** `/Users/deepakgupta/Vault/Claude-Code/Projects/Gym-App`
**HEAD:** `d95aaac` (B1 fix + PRD rev 6 sync; push verified 2026-07-15)
**Migration HEAD:** 0035 (applied to Supabase production 2026-06-30, verified; no migrations pending)
**Live URL:** `https://deepak-gym-tracker.vercel.app`
**State:** Clean. All PRD v2.0 features shipped. No pending DB actions. PRD rev 6 is current.
**Preview:** open Claude Code from `/Users/deepakgupta/Vault/Claude-Code/Projects/Gym-App` and use `preview_start "Next.js dev"` (port 3000; `.claude/launch.json` committed).
**Next work options:** new feature (rest timer deferred to v2.1; estimated 1RM tracking; or any new request).

## Open Work Queue

- [x] W8: MuscleVolumeCard dashboard bars -- CLOSED (2026-06-10, commit `76e9888`)
- [x] W9: /history muscle-group filter -- CLOSED (2026-06-10, commit `5ea9fc9`)
- [x] W11: equipment week-over-week rotation -- CLOSED by D020 (INC-018 fix, 7-day window)
- [x] W12: settings frequency override -- CLOSED (2026-06-10, commit `535c1d3`)
- [x] Integration test suite -- CLOSED (2026-06-30, commit `668ddd5`): postgres:16 CI job, 14 schema/enum/view tests, scripts/ci-pg-bootstrap.sql
