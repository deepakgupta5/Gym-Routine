<!-- DOC-STATUS: LOG; SYNCED: INC-021 / 2026-07-08 -->
# INCIDENT_LOG_GYM.md

---

## INC-021 -- Exercise 49 (Barbell OHP) absent from UPPER_PUSH_PRIMARY_ROTATION dashboard catalog (2026-07-08)

**Severity:** P3 (dashboard sparkline silently misses Barbell OHP top sets; no wrong data, just invisible history)
**Detected:** Catalog-eligibility hook flagged exercise 49 as suitable_slots-primary but absent from every *_PRIMARY_ROTATION array
**Resolved:** Commit `3cf727c`, 2026-07-08

**Root cause:**
Same INC-017 drift pattern (L23/L24). Exercise 49 (Barbell Overhead Press) was added in migration 0026 with `allowed_day_types=['push_upper','full_body']` and `suitable_slots=['primary','secondary']`. The static dashboard catalog `UPPER_PUSH_PRIMARY_ROTATION` in `src/lib/engine/constants.ts` was not updated when INC-017 was fixed (INC-017 extended UPPER_PULL and LOWER_SQUAT only; did not re-audit UPPER_PUSH beyond the IDs that existed at the time).

**Fix:**
`UPPER_PUSH_PRIMARY_ROTATION = [9, 10, 11, 15, 16]` -> `[9, 10, 11, 15, 16, 49]` in `src/lib/engine/constants.ts`.

No DB action needed. No session purge needed (catalog is query-time only; affects future dashboard reads immediately).

**See also:** INC-014 (original drift), INC-017 (same class), L23/L24 (pattern rules).

---

## INC-020 -- Dumbbell Shoulder Press prescribed at 205 lb (correct: 25 lb) -- JS string coercion (2026-07-08)

**Severity:** P1 (wrong load shown mid-workout; exercise 15 top_set_target_load_lb = 205 lb instead of 25 lb)
**Detected:** User reported wrong weight during live workout session 2026-07-08
**Resolved:** Commit `a8ed51b`, 2026-07-08; DB hotfix SQL provided (run in Supabase)

**Root cause:**
`pg` returns PostgreSQL `NUMERIC` columns as JavaScript strings at runtime, despite TypeScript annotations typing them as `number`. In `src/lib/scheduler/v2/load.ts`, `loadV2Exercises()` fetches `coalesce(e.load_increment_lb, 5) as load_increment_lb` but applies no `Number()` coercion. TypeScript trusts the annotation; at runtime `exercise.load_increment_lb = "5"` (string).

In `computeLoad()`:
```typescript
const increment = exercise.load_increment_lb || 5;  // "5" (string, truthy)
// prevLoad = 20 (number, correctly coerced via Number(prior.last_load))
topSetLoad = roundToIncrement(prevLoad + increment, increment);
// 20 + "5" = "205" (JS string concat, not arithmetic)
// roundToIncrement("205", "5") = Math.round(41) * 5 = 205
// rationale_text = "205 lb, up 5 lb (20 lb x 15 last time)" -- matches screenshot exactly
```

Exercise 15 (Dumbbell Shoulder Press): prevLoad=20, prevReps=15 (>= repsMax=13), so progression applies. Correct: 20+5=25. Bug output: 205. Back-off also wrong: 185 lb (= 205*0.9) instead of 25 lb (= roundToIncrement(25*0.9,5)).

The same string-coercion bug existed in `index.ts:286` (deload rounding): `const inc = ex.exercise.load_increment_lb ?? 5` -- `?? 5` does not guard against a truthy string.

Other places that fetch `load_increment_lb` (`integration.ts:523`, `logs/set/route.ts:445`, `set/[id]/route.ts:277`) already call `Number()` explicitly -- only the v2 scheduler paths were missing it.

**Fix (code):**
- `src/lib/scheduler/v2/load.ts:51`: `const increment = Number(exercise.load_increment_lb) || 5;`
- `src/lib/scheduler/v2/index.ts:286`: `const inc = Number(ex.exercise.load_increment_lb) || 5;`

**DB hotfix (run in Supabase for 2026-07-08 session):**
```sql
UPDATE plan_exercises pe
SET
  top_set_target_load_lb  = 25,
  prescribed_load         = 25,
  back_off_target_load_lb = 25,
  rationale_text          = '25 lb, up 5 lb (20 lb x 15 last time)'
FROM plan_sessions ps
WHERE pe.plan_session_id = ps.plan_session_id
  AND pe.exercise_id     = 15
  AND ps.session_date    = CURRENT_DATE
RETURNING pe.plan_exercise_id, pe.top_set_target_load_lb, pe.prescribed_load,
          pe.back_off_target_load_lb, pe.rationale_text;
```

**Prevention:** See L27 in LESSONS_LEARNED_GYM.md.

---

## INC-019 -- Integration test suite: 4 tests failed on first CI run (2026-07-01)

**Severity:** P3 (CI red; no production impact -- tests ran against fresh CI Postgres, not prod)
**Detected:** GitHub Actions notification after commit `668ddd5`
**Resolved:** Commit `034d68d`, 2026-07-01; CI green on `034d68d` and `0315c6e`

**Root cause (4 failures):**

1. **Exercises 8, 19, 20-24 return 0 rows** (2 test failures): `supabase/seed.sql` seeds exercises 1-25 but the CI workflow only ran migrations, never seed.sql. Migration 0035 UPDATEs suitable_slots for those exercise IDs, but since the rows did not exist, the UPDATE silently affected 0 rows. Tests querying by exercise_id got empty results.

2. **plan_exercises PK assertion wrong**: Test asserted column `'id'` as PK; actual PK column is `plan_exercise_id` (confirmed in 0001_init.sql line 93). The assertion was inverted from reality.

3. **session_type_enum exact-count check wrong**: Test used `toEqual(["Fri","Mon","Sat","Sun","Thu","Tue","Wed"])` (7 values); actual enum has 17 values (7 day names + 5 from migration 0021 + 5 from migration 0031).

**Fix:**
- `ci.yml`: inject `supabase/seed.sql` immediately after `0001_init.sql` applies (schema exists, 0019 column additions and 0035 suitable_slots patches not yet run). Exercises 1-25 now exist when those later migrations fire.
- `schema.test.ts`: flip plan_exercises assertion to `toContain("plan_exercise_id")` / `not.toContain("id")`.
- `schema.test.ts`: replace exact `toEqual` on enum with `arrayContaining` for both day-name and v2-session-type subsets.

**Prevention:** See L26 in LESSONS_LEARNED_GYM.md.

---

## INC-018 -- Equipment rotation 14-day window blocked Barbell Deadlift for entire hinge cycle (2026-06-30)

**Severity:** P2 (UX: deadlift and RDL invisible for ~14 days after any hinge session; scheduler silently replaces them with Hip Thrust every cycle)
**Detected:** User reported Barbell Deadlift absent from next 8 days of sessions after INC-015 fix confirmed working
**Resolved:** Commit `af96cd6`, 2026-06-30

**Root cause:**
`loadLastEquipmentByMuscle()` in `index.ts` queries `set_logs` for distinct `(muscle_primary, equipment_type)` pairs in the last 14 days. After any hinge session that included Barbell Deadlift (exercise 7, equipment_type='barbell', muscle_primary='hamstrings'), the next 14 days had `recentEquipmentByMuscle.get('hamstrings') = {'barbell'}`.

The equipment rotation filter then excluded ALL barbell-hamstrings exercises from candidate pools. Both Barbell Deadlift (7) and Romanian Deadlift (5) are barbell+hamstrings. The only remaining hinge primary candidate was Hip Thrust (6), which has `muscle_primary='glutes'` (not 'hamstrings'), so it was not excluded.

The soft-exclusion fallback (`if (rotated.length > 0) candidates = rotated`) did NOT fire because the filtered pool still contained Hip Thrust (glutes) and Standing Calf Raise (calves). These non-hamstring exercises kept the pool non-empty, so the barbell-hamstrings exclusion was applied for the full 14 days.

At 4 sessions/week, hinge_lower recurs every ~9 calendar days. A 14-day window guaranteed that both deadlift and RDL were excluded from the entire next hinge cycle.

**Fix:**
Reduced `interval '14 days'` to `interval '7 days'` in `loadLastEquipmentByMuscle()`. PRD Section 3.4 says "week-over-week equipment rotation" -- 7 days IS one week. At 4/week the same day type recurs every ~9 days, so a 7-day window expires before the next hinge session and barbell-hamstrings exercises are available again in time.

**SQL required (user action):**
```sql
DELETE FROM plan_sessions
WHERE performed_at IS NULL
  AND date > CURRENT_DATE
  AND session_blueprint_version = 2;
```
Pre-generated sessions used the 14-day window. Delete them to force regeneration.

**See also:** L24 (equipment rotation window calibration lesson)

---

## INC-017 -- PRIMARY_ROTATION catalog drift: Lat Pulldown, Assisted Pull-Up, Pull-Up, Back Squat missing (2026-06-30)

**Severity:** P2 (dashboard sparkline silently misses assigned primaries; same INC-014 pattern)
**Detected:** Systematic audit of all four rotation catalogs post INC-014
**Resolved:** Commit (this session)

**Root cause:**
Same pattern as INC-014. The v2 scheduler independently picks exercises for primary slots using `allowed_day_types` and `suitable_slots`. The rotation catalogs in `constants.ts` were never updated when new exercises (26-44) were added in migration 0020/0026. Four exercises were legitimately assignable as primary but absent from their catalogs:
- 17 (Lat Pulldown), 18 (Assisted Pull-Up), 28 (Pull-Up): can be pull_upper primary (`allowed_day_types=['pull_upper',...]`, suitable_slots includes 'primary')
- 26 (Back Squat): can be squat_lower primary (`suitable_slots=['primary','secondary']`)
- LOWER_HINGE catalog [5,7,6] was clean -- no gaps.

**Side issue (logged, not fixed):** exercises 19 (Barbell Curl), 23 (Rear Delt Fly Machine), 24 (Standing Calf Raise) have default `suitable_slots=['primary','secondary','accessory']` so the scheduler CAN assign them as primaries. They are isolation/accessory exercises and should be restricted. Requires a new migration -- flagged as G11.

**Fix:**
- `UPPER_PULL_PRIMARY_ROTATION = [12, 13, 14, 17, 18, 28]`
- `LOWER_SQUAT_PRIMARY_ROTATION = [1, 2, 4, 3, 26]`
- No DB update needed: existing `primary_lift_map` values remain valid in the extended catalogs.

**Prevention:** See L24 in LESSONS_LEARNED_GYM.md.

---

## INC-016 -- Barbell Deadlift prescribed at wrong load (405 lb) due to incorrect set_logs entry (2026-06-30)

**Severity:** P2 (data integrity: load prescription wrong; no irreversible data loss)
**Detected:** User reported deadlift showing 405 lb as prescribed load; seed_load_lb = 115 lb, so load must come from v_last_top_set_per_exercise history. User confirmed 405 lb is incorrect.
**Status:** RESOLVED -- stale plan_exercises row cleared as collateral of INC-015 DELETE CASCADE, 2026-06-30

**Root cause (confirmed):**
The 405 lb was NOT in `set_logs`. User-provided CSV of all deadlift top-set logs (27 rows, 2026-02-21 to 2026-06-27) shows loads 30-60 lb; no row reaches 405 lb.

The 405 lb was stored in `plan_exercises.top_set_target_load_lb` -- the prescribed load written at session generation time. A pre-existing plan session generated under old app logic (before v2 scheduler progression) contained a stale 405 lb target. The `v_last_top_set_per_exercise` view reads from `set_logs` (actual performed sets) and is not affected. The display the user saw was pulling from the plan_exercises prescribed load column, which was wrong.

Note: the investigation identified a bug in the original inspection SQL -- the query used `JOIN plan_exercises pe ON pe.id = sl.plan_exercise_id` but `set_logs` has its own `exercise_id` column directly and no `plan_exercise_id` column. Correct query: `WHERE exercise_id = 7`.

**Fix:**
INC-015 DELETE SQL (`DELETE FROM plan_sessions WHERE performed_at IS NULL AND date > CURRENT_DATE`) CASCADE-deleted all child `plan_exercises` rows, including the stale 405 lb entry. No further action needed.

---

## INC-015 -- Auto-deload triggering every session, producing 3-exercise full_body days (2026-06-30)

**Severity:** P2 (UX broken: all sessions generated as full_body with 3 slots instead of 5)
**Detected:** User reported week shifted from 5 exercises/day to 3 exercises/day; next week also showing 3
**Resolved:** Commit `36cbf17`, 2026-06-30

**Root cause (dual):**
A. **Session-count condition (condition B)**: `shouldAutoDeload()` fires if `recentSessionCount >= 6` in rolling 7-day window. A 4-session/week user whose sessions cluster at a calendar-week boundary (e.g. 4 sessions at end of week N + 3 at start of week N+1) accumulates 7 sessions in the rolling window -- exceeding the threshold even though no overtraining has occurred.
B. **Volume condition (condition A)**: `WEEKLY_MAX_SETS` was set to 2x `WEEKLY_MIN_SETS` per D016. After INC-014 extended `UPPER_PUSH_PRIMARY_ROTATION` to include shoulder press exercises, each push_upper session accumulates more shoulder sets. The 24-set cap was reached after 2 push_upper sessions in 7 days.

**Fix:**
- `src/lib/scheduler/v2/index.ts`: session-count threshold raised from 6 to 8.
- `src/lib/scheduler/v2/constants.ts`: all `WEEKLY_MAX_SETS` raised from 2x to 3x `WEEKLY_MIN_SETS`.

**SQL required (user action):**
```sql
DELETE FROM plan_sessions
WHERE performed_at IS NULL
  AND date > CURRENT_DATE
  AND session_blueprint_version = 2;
```
Deletes pre-generated deload sessions so they regenerate as the correct 5-exercise day type.

---

## INC-014 -- Primary Lifts sparkline never tracked shoulder press as primary (2026-06-25)

**Severity:** P2 (UX: dashboard chart showed stale data; no data loss)
**Detected:** User noticed "Current: Jun 18" for Upper Push after logging a push_upper session today
**Resolved:** Commit `47bb6f8` + Supabase SQL update, 2026-06-25

**Root cause:**
`UPPER_PUSH_PRIMARY_ROTATION = [9, 10, 11]` (Flat DB Press, Incline DB Press, Chest Press Machine -- all horizontal push / chest) was the sole catalog for the Primary Lifts dashboard sparkline. The v2 scheduler independently assigns exercises based on `allowed_day_types` and `suitable_slots`; exercises 15 (Dumbbell Shoulder Press) and 16 (Machine Shoulder Press) both have `allowed_day_types = ['push_upper']` and `suitable_slots = ['primary', ...]`, so the scheduler legitimately selects them as primary in push_upper sessions. The sparkline queries `top_set_history` only for exercise IDs in the rotation catalog, so shoulder press top sets were silently invisible on the dashboard regardless of how many sessions were logged. The two systems (dynamic scheduler, static catalog) were never synced after the v2 scheduler expanded the candidate pool.

**Fix:**
- `src/lib/engine/constants.ts`: `UPPER_PUSH_PRIMARY_ROTATION = [9, 10, 11, 15, 16]`
- `user_profile`: `primary_lift_map.UPPER_PUSH = 16` (SQL: `jsonb_set` on UPPER_PUSH key)

**Prevention:** See L23 in LESSONS_LEARNED_GYM.md.

---

## INC-013 -- Warmup sets broke v2 top-set classification and backoff prefill (2026-06-25)

**Severity:** P2 (data integrity: top_set_history not written, next_target_load not updated; no irreversible data loss)
**Detected:** Investigation of "UI not refreshed" complaint; warmup feature (W13) had been added without auditing downstream index consumers
**Resolved:** Commit `3f9b25e`, 2026-06-25

**Root cause:**
`addSet` in `useSessionLoggerController.ts` computed `setIndex = logsByExercise.get(exerciseId).length + 1` where `logsByExercise` includes ALL logs (warmup + working). `v2SetType(ex, setIndex)` checks `setIndex === 1` to classify the top set. After logging 1 warmup set, the first working set got `setIndex = 2`, returning `"backoff"` instead of `"top"`. Cascading effects: (1) API route excluded non-top rows from `top_set_history` insert, so progression history was not recorded; (2) `next_target_load` update for future sessions was gated on `workingSetIndex === 1` -- never triggered; (3) backoff prefill (90% of top-set load) never fired.

**Fix:** Introduced `workingSetIndex = allLogsForEx.filter(l => !l.is_warmup).length + 1` for `v2SetType` and backoff prefill. Raw `setIndex` (all sets) kept for the `set_index` DB column.

**Prevention:** See L22 in LESSONS_LEARNED_GYM.md.

---

## INC-004 -- Same accessory exercises repeating every session (2026-05-30)

**Severity:** P2 (UX broken; no data loss)
**Detected:** User reported same 3 accessories every session
**Resolved:** Commit `2291878`, 2026-05-30

**Root cause:**
1. Migration 0026 gave Cable Crunch (#25), Hanging Knee Raise (#43), Pallof Press (#44) `user_preference_score=2`.
2. No-repeat filter only excluded primary/secondary roles.
3. With exactly 3 high-score accessories and 3 accessory slots, same 3 filled every session.

**Fix:**
- Extended no-repeat filter in `select.ts` to all roles.
- Updated `loadRecentPrimaryExerciseIds` query in `index.ts` to remove `pe.role` filter.

**Prevention:** See L1 in LESSONS_LEARNED_GYM.md.

---

## INC-005 -- Same leg exercises repeating every day (2026-06-05)

**Severity:** P2 (UX broken; no data loss)
**Detected:** User reported same leg exercises repeating across consecutive sessions
**Resolved:** Migration 0028, 2026-06-05

**Root cause (two-part):**
1. Exercises 26-44 had default `suitable_slots=['primary','secondary','accessory']`, causing Back Squat to appear as accessory.
2. Existing pre-generated future sessions were created before the no-repeat fix and were not regenerated (scheduler skips sessions with `totalExerciseCount > 0`).

**Fix:**
- Migration 0028 Part A: corrected `suitable_slots` for exercises 26-44.
- Migration 0028 Part B: deleted all unperformed future sessions with no logged sets, forcing regeneration on next access.

**Prevention:** See L2 in LESSONS_LEARNED_GYM.md.

---

## INC-006 -- CI failing: test mock count mismatch (2026-06-04)

**Severity:** P1 (CI broken; blocks all deploys)
**Detected:** CI failure on commit `421bafc`
**Resolved:** Commit `69bee02`, 2026-06-04

**Root cause:** `planSessionMinutes.test.ts` mocked 3 DB calls. After adding a SELECT for remaining unskipped exercises in the route handler (to set `performed_at` correctly), the route made 4 calls. Test saw no mock for the 4th call and returned 500.

**Fix:** Added 4th mock `mockResolvedValueOnce({ rows: [{ remaining: "2" }] })`.

**Prevention:** See L6 in LESSONS_LEARNED_GYM.md.

---

## INC-007 -- TypeScript build error: state update drops cardioType (2026-06-04)

**Severity:** P1 (build broken)
**Detected:** CI failure on commit `69bee02`
**Resolved:** Commit `5617958`, 2026-06-04

**Root cause:** `setSessionMinutes({ cardio: String(cardio) })` in `useSessionLoggerController.ts` line 332 replaced the full state object. TypeScript error: property `cardioType` missing from object literal.

**Fix:** Changed to functional update: `setSessionMinutes((prev) => ({ ...prev, cardio: String(cardio) }))`.

---

## INC-008 -- Netlify deploys silently skipping (2026-06-02 to 2026-06-06)

**Severity:** P2 (new commits not deploying)
**Detected:** Commits `e9c70b84` and `2291878c` showed "Canceled build due to no content change"
**Resolved:** Commit `0138169`, 2026-06-06

**Root cause:** `ignore = "exit 0"` in `netlify.toml [build]` told Netlify to skip every build after the first.

**Fix:** Removed the `ignore` line from `netlify.toml`.

---

## INC-009 -- Exercise repeat persisting after INC-004 fix (2026-06-06)

**Severity:** P2 (UX broken; exercises repeating day-to-day)
**Detected:** User reported 3 of yesterday's exercises repeated today AND on Monday
**Resolved:** Commit `28a3d40` + migration 0029, 2026-06-06

**Root cause (two-part):**
1. The fallback in `selectExercisesForSession` fires when the strict 7-day no-repeat pool is exhausted (e.g., all push_upper accessories used yesterday). Fallback reopens the full pool with `new Set()` but kept the original `scoreCandidates()` call with no recency context. Core exercises (score +40) always won the fallback over other accessories (score +10).
2. Migration 0028 deleted sessions where `date > CURRENT_DATE` but left today's session intact. If today's session was generated before the no-repeat fix, it still had repeated exercises and the scheduler would not regenerate it (`totalExerciseCount > 0` guard).

**Fix:**
- `scoreOne()` now accepts optional `recentExerciseIds` and applies a -200 penalty to recently-used exercises. Max positive score is 150 (100+40+10), so any fresh exercise always outscores a penalised one.
- `scoreCandidates()` passes `recentExerciseIds` in both normal and fallback paths.
- Migration 0029 Part B: deletes today's unperformed session (`date = CURRENT_DATE`) so it regenerates fresh.

**Prevention:** See L8 in LESSONS_LEARNED_GYM.md.

---

## INC-010 -- Supabase CRITICAL: SECURITY DEFINER views bypass RLS (2026-06-06)

**Severity:** P1 (security advisory -- CRITICAL x2 in Supabase advisor)
**Detected:** Supabase security advisor flagged `v_weekly_muscle_volume` and `v_last_top_set_per_exercise`
**Resolved:** Migration 0029, 2026-06-06

**Root cause:** PostgreSQL views run as the view owner (SECURITY DEFINER) by default. This means the view bypasses RLS policies and executes with the creator's permissions rather than the querying user's. Any user who can query the view can see all rows, not just their own.

**Fix:** Migration 0029 Part A drops both views and recreates them with `WITH (security_invoker = on)`. The view now runs under the querying user's identity, so RLS policies apply correctly.

**Prevention:** See L9 in LESSONS_LEARNED_GYM.md.

---

## INC-011 -- Exercise repeat STILL persisting after INC-009 fix (2026-06-08)

**Severity:** P2 (UX broken; exercises repeating day-to-day)
**Detected:** User reported same exercises repeating after migration 0029 + commit `28a3d40`
**Resolved:** Commit `6a7cdf5` + migration 0030, 2026-06-09

**Root cause:**
The -200 recency penalty in `scoreOne()` only prevents repeats when FRESH exercises exist in the candidate pool. With a 7-day exclusion window and a 5-day rotation, the previous same-type session is 5 days ago -- inside the 7-day window. This puts ALL day-type-specific accessories into `recentIds`, triggering `candidatesForSlot`'s internal fallback (keep full pool when filter empties it). With every candidate penalised by -200, the relative ordering is identical to the unpenalised case: core exercises (user_preference_score=2 -> +40 -> net -160) beat non-core (+0 -> net -200). Same exercises win regardless of the penalty.

**Fix:**
- `index.ts`: `loadRecentPrimaryExerciseIds` interval reduced from `7 days` to `2 days`. Only yesterday's + day-before's exercises are excluded. Day-type-specific accessories from 5 days ago (previous same-type session) are fresh candidates; the strict filter passes them; the fallback rarely fires.
- Migration 0030: purges today's and all future unperformed sessions (no logged sets) so they regenerate with the 2-day window code.

**Prevention:** See L11 in LESSONS_LEARNED_GYM.md.

---

## INC-012 -- v2 rotation stuck on hinge_lower for every session (2026-06-09)

**Severity:** P1 (plan completely broken; wrong muscle groups every day)
**Detected:** User reported all 5 days showing hinge/lower exercises only (no push, pull, squat)
**Resolved:** Commit `de1639e` + migration 0031, 2026-06-09

**Root cause:**
`loadRecentV2DayTypes` in `src/lib/scheduler/v2/index.ts` used:
```sql
ORDER BY date ASC LIMIT 10
```
This returns the **10 oldest** v2 sessions, not the most recent. `selectDayType` reads `recentV2DayTypes[length-1]` (last element), which with ASC ordering is the 10th-oldest session -- not the most recent one.

The v2 scheduler launched 2026-04-18. Sessions ran correctly for the first 10 sessions (push_upper, squat_lower, pull_upper, hinge_lower, full_body cycle). Session 10 was `pull_upper` (index 2 in V2_ROTATION). From session 11 onwards, `LIMIT 10 ASC` always returned the same 10 oldest sessions with `pull_upper` as the last element. `selectDayType` permanently returned `hinge_lower` (index 3 = next after pull_upper). Every session generated since has been `hinge_lower`.

**Fix:**
- `index.ts`: changed query to `ORDER BY date DESC LIMIT 1` -- always fetches the single most-recent v2 session. `selectDayType` only needs `recentV2DayTypes[length-1]`; with a 1-element DESC array that's index 0 = most recent.
- Migration 0031 Part A: idempotent enum value additions (no-ops; all 5 v2 values confirmed present).
- Migration 0031 Part B: deletes ALL unperformed sessions with no logged sets, clearing the stale hinge_lower pile. Next generation correctly advances from the last performed session type.

**Prevention:** See L12 in LESSONS_LEARNED_GYM.md.

---

## INC-001 to INC-003 (pre-2026-05-30)

Pre-dating this tracker. See `docs/release-signoff-2026-02-24.md` for v1.1 sprint hardening issues.
