# INCIDENT_LOG_GYM.md

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
