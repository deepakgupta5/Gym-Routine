# Gym App Audit Document

Generated: 2026-04-21. Last executed: 2026-04-21 (all items resolved).
Severity: CRITICAL > HIGH > MEDIUM > LOW.

---

## 1. Schema Validation (SQL vs Real DB Types)

| ID | File | Query / Issue | Status |
|----|------|---------------|--------|
| S1 | `v2/index.ts:loadRecentV2DayTypes` | `session_type = any($3::text[])` enum vs text -- fixed with `session_type::text = any(...)` | CLOSED |
| S2 | `plan/week/route.ts` | `order by session_type asc` -- fixed with `session_type::text asc` | CLOSED |
| S3 | `plan/today/route.ts` | `select pe.*` wildcard; skipped exercises not filtered -- added `pe.skipped_at is null` | CLOSED |
| S4 | `plan/week/route.ts` | Same as S3 -- added `pe.skipped_at is null` and replaced wildcard with explicit columns | CLOSED |
| S5 | `v2/index.ts:insertV2Session` | `session_blueprint_version` column -- verified exists in prod | CLOSED |
| S6 | `integration.ts:loadExerciseRows` | `alt_3_exercise_id`, `category`, `fatigue_score` etc. -- verified, all exist after migration 0019 | CLOSED |
| S7 | All SQL with `session_type` enum | Literal comparisons (`= 'Fri'`) are safe in Postgres. Only `= any(text[])` requires `::text` cast. Grep confirms no remaining violations. | CLOSED |
| S8 | `plan/session-minutes/route.ts` | Broken SQL indentation -- fixed | CLOSED |

**Ongoing rule:** Any new SQL comparing `session_type` to a text array must use `session_type::text = any(...)`.

---

## 2. Business Logic Contracts

| ID | Contract | Status |
|----|----------|--------|
| B1 | No session generated on Sundays | CLOSED - DOW=0 guard in `ensureWorkoutPlanForDate`; tested |
| B2 | No session generated for skipped dates | CLOSED - `skipped_dates` guard in `ensureWorkoutPlanForDate`; tested |
| B3 | Skipped exercises excluded from exercise list | CLOSED - `skipped_at is null` added to session page, `plan/today`, `plan/week` |
| B4 | Session generation is idempotent | CLOSED - UNIQUE(user_id, block_id, date) in DB |
| B5 | `plan/regenerate` must not run while v2 is active | CLOSED - returns 400 when `GYM_V2_ENABLED=true`; tested |
| B6 | `plan/shift` must not run while v2 is active | CLOSED - returns 400 when `GYM_V2_ENABLED=true`; tested |
| B7 | `ensureWorkoutPlanForDate` called unconditionally for performed sessions | ACCEPTED - guard returns immediately after profile fetch; extra 2 queries are acceptable |

---

## 3. Data Integrity

| ID | Issue | Status |
|----|-------|--------|
| D1 | Old sessions have mismatched block_id | MITIGATED - old sessions have `performed_at` set; page generates fresh v2 sessions |
| D2 | `plan/regenerate` would reset `skipped_dates` and create v1 sessions | CLOSED - endpoint disabled in v2 |
| D3 | UNIQUE(user_id, block_id, date) constraint | CLOSED - in place since migration 0023 |
| D4 | `skipped_dates` text[] comparison correctness | CLOSED - both sides are text |
| D5 | `insert-rest-day` delete uses profile block_id -- must match v2 sessions | CLOSED - verified: new v2 sessions are inserted under the current profile block_id, so the delete hits correctly |

---

## 4. Error Handling

Every API route: (a) client released in `finally`, (b) errors caught, (c) logged via `logError`, (d) returns 500 with JSON error key.

| ID | File | Status |
|----|------|--------|
| E1 | `plan/today/route.ts` | CLOSED - try/catch + logError added |
| E2 | `plan/week/route.ts` | CLOSED - try/catch + logError added |
| E3 | `plan/regenerate/route.ts` | CLOSED |
| E4 | `plan/shift/route.ts` | CLOSED |
| E5 | `plan/insert-rest-day/route.ts` | CLOSED |
| E6 | `plan/session-minutes/route.ts` | CLOSED |
| E7 | `plan/skip-exercise/route.ts` | CLOSED |
| E8 | `plan/toggle-deload/route.ts` | CLOSED |
| E9 | `plan/exercise-settings/route.ts` | CLOSED |
| E10 | `session/[date]/page.tsx` | CLOSED |
| E11 | `dashboard/page.tsx` | CLOSED |

---

## 5. Test Coverage

### 5a. Tests fixed

| ID | Test | Status |
|----|------|--------|
| T1 | `schedulerIntegration` test 2: skipped_dates fixture was triggering the new guard | CLOSED - fixture updated to use empty `skipped_dates` |

### 5b. New tests added (128 total, all green)

| ID | Test File | Coverage |
|----|-----------|----------|
| T2 | `tests/scheduler/v2Scheduler.test.ts` | `selectDayType`: rotation, empty history, wrap-around, unknown type |
| T3 | `tests/scheduler/v2Scheduler.test.ts` | `computeLoad`: seed, progression, regression, hold, back-off, zero floor |
| T4 | `tests/scheduler/v2Scheduler.test.ts` | `roundTo5` edge cases |
| T5 | `tests/api/schedulerIntegration.test.ts` | Sunday (2026-04-19) returns null, only 2 queries fire |
| T6 | `tests/api/schedulerIntegration.test.ts` | Skipped date returns null, only 2 queries fire |
| T7 | `tests/api/planToday.test.ts` | 404 missing profile, null session, exercises with skipped_at filter verified, 500 on error |
| T8 | `tests/api/planWeek.test.ts` | Invalid weekStart 400, missing profile 404, empty week, sessions+exercises, 500 on error |
| T9 | `tests/api/planRegenerate.test.ts` | Returns 400 when v2 enabled |
| T10 | `tests/api/planShift.test.ts` | Missing profile 404, shift updates and drops |
| T11 | `tests/api/planInsertRestDay.test.ts` | Missing date 400, dry_run no DB, deletes session and appends skipped_dates, 500 rollback |
| T12 | `tests/api/planSessionMinutes.test.ts` | Invalid body 400, invalid minutes 400, session not found 404, updates + syncs state, 500 rollback |

### 5c. Integration test gap

No test runs SQL against a real PostgreSQL schema. All DB tests mock `client.query`. Enum type mismatches and missing columns only surface in production.

**Recommended fix (not yet implemented):** Add a GitHub Actions job that starts a Postgres container, applies all migrations, then runs a separate `tests/integration/` suite that uses a real DB connection. Tag with `--project integration` in vitest config to keep separate from the fast unit suite.

---

## 6. v1/v2 Migration Completeness

| ID | File | Status |
|----|------|--------|
| V1 | `plan/regenerate/route.ts` | CLOSED - disabled in v2 (returns 400) |
| V2 | `plan/shift/route.ts` | CLOSED - disabled in v2 (returns 400) |
| V3 | `syncCompletedWorkoutAndState` called from `plan/session-minutes` | ACCEPTED - updates v1 progression_state; harmless but wastes 3 queries per cardio save. Remove when v1 scheduler is fully retired. |
| V4 | `insertPlannedWorkoutV1` in `integration.ts` | ACCEPTED - needed for `GYM_V2_ENABLED=false` fallback path; remove when flag is removed |

---

## 7. Code Quality

| ID | File | Status |
|----|------|--------|
| Q1 | `plan/session-minutes/route.ts` SQL indentation | CLOSED - fixed |
| Q2 | `plan/today` + `plan/week` wildcard `pe.*` | CLOSED - replaced with explicit column lists |
| Q3 | `plan/week/route.ts` missing error handler | CLOSED - added |
| Q4 | `plan/today/route.ts` missing error handler | CLOSED - added |
| Q5 | `v2/select.ts` secondary role allows primary-tagged exercises | ACCEPTED - intentional design; comment added inline |
| Q6 | `EXERCISE_META_FALLBACK` 130-line hardcoded map | ACCEPTED - needed as DB fallback; remove when all exercises have DB metadata |

---

## Appendix: Verify Schema Columns

```bash
export PATH="/opt/homebrew/Cellar/postgresql@16/16.13/bin:$PATH"
SUPABASE_DB_URL=$(cd /Users/deepakgupta/Claude-Code/Projects/gym-app && netlify env:get SUPABASE_DB_URL --context production)

# All enum values
psql "$SUPABASE_DB_URL" -c "SELECT unnest(enum_range(NULL::session_type_enum))::text;"

# Check for session_type enum vs text comparison issues in new code
grep -rn "session_type" src/ --include="*.ts" | grep "= any" | grep -v "::text"

# Sessions vs profile block_id match (run after any migration or block change)
psql "$SUPABASE_DB_URL" -c "SELECT ps.date, ps.block_id = up.block_id as match FROM plan_sessions ps CROSS JOIN user_profile up WHERE ps.date >= current_date ORDER BY ps.date LIMIT 10;"
```
