# Gym App Audit Document

Generated: 2026-04-21. Execute every item before shipping any new feature.
Severity: CRITICAL > HIGH > MEDIUM > LOW.

---

## 1. Schema Validation (SQL vs Real DB Types)

Each SQL query must be checked against the actual PostgreSQL schema.
Run against prod DB: `psql $SUPABASE_DB_URL -c "<query>"`

| ID | File | Query / Issue | Check | Status |
|----|------|---------------|-------|--------|
| S1 | `v2/index.ts:loadRecentV2DayTypes` | `session_type = any($3::text[])` -- enum vs text mismatch | `session_type::text = any(...)` required | FIXED |
| S2 | `plan/week/route.ts:55` | `order by ... session_type asc` -- ordering an enum works but may surprise | Verify sort order matches expected | OPEN |
| S3 | `plan/today/route.ts:50` | `select pe.*` -- wildcard; skipped exercises not filtered | Must add `and pe.skipped_at is null` | OPEN |
| S4 | `plan/week/route.ts:61` | `select pe.*` -- same wildcard / no skipped filter | Must add `and pe.skipped_at is null` | OPEN |
| S5 | `v2/index.ts:insertV2Session` | INSERT uses `session_blueprint_version` column | Exists in prod (verified) | CLOSED |
| S6 | `integration.ts:loadExerciseRows` | Uses `alt_3_exercise_id`, `category`, `fatigue_score` etc. | All exist after migration 0019 | CLOSED |
| S7 | All queries with `session_type` enum | Any `=` or `IN` comparison without `::text` cast will error | Grep: `session_type.*=` without `::text` | OPEN |
| S8 | `plan/session-minutes/route.ts:42` | Raw SQL has broken indentation (`cardio_saved_at = now()` and `where` at column 0) | Cosmetic only; verify it executes correctly | OPEN |

**How to execute S7:**
```bash
grep -rn "session_type" src/ --include="*.ts" | grep -v "::text" | grep "= any\|= '\|IN ("
```

---

## 2. Business Logic Contracts

Who is responsible for what, and whether that is consistently enforced.

| ID | Contract | Owner | Enforced | Status |
|----|----------|-------|----------|--------|
| B1 | No session generated on Sundays | `ensureWorkoutPlanForDate` | Yes - DOW=0 guard added | FIXED |
| B2 | No session generated for dates in `skipped_dates` | `ensureWorkoutPlanForDate` | Yes - skipped_dates guard added | FIXED |
| B3 | Skipped exercises excluded from exercise list | Session page query + `plan/today` + `plan/week` | Session page: yes. `plan/today` + `plan/week`: NO (no `skipped_at is null` filter) | OPEN |
| B4 | Session generation is idempotent (same date, same result) | `ensureWorkoutPlanForDate` + UNIQUE constraint | UNIQUE (user_id, block_id, date) enforced in DB | CLOSED |
| B5 | `plan/regenerate` creates v1 blocks, not v2 sessions | `plan/regenerate/route.ts` | Generates v1-style pre-populated sessions; conflicts with GYM_V2_ENABLED | OPEN - CRITICAL |
| B6 | `plan/shift` moves sessions by date; nonsensical for v2 | `plan/shift/route.ts` | Still active; shifts v1 sessions that may not exist in v2 context | OPEN |
| B7 | Session page does not call `ensureWorkoutPlanForDate` for past performed sessions | `page.tsx:169` | Called unconditionally. Guard returns early for skipped/Sunday but not for already-performed sessions -- this is fine (reads existing session), but wastes one extra profile+block query | LOW |

---

## 3. Data Integrity

| ID | Issue | Risk | Status |
|----|-------|------|--------|
| D1 | Old sessions have block_id `502dd1bb-...`; profile points to `fc692fe3-...` | Sessions are invisible to page queries that filter by profile block_id | MITIGATED - page generates new v2 sessions on first visit; old sessions have performed_at set |
| D2 | `plan/regenerate` changes `user_profile.block_id` and resets `skipped_dates = '{}'` | All skip history erased; new v1 sessions created; v2 and v1 coexist under same block_id | CRITICAL - must disable or rewrite for v2 |
| D3 | UNIQUE(user_id, block_id, date) added in migration 0023 | Prevents duplicate sessions per block per date. If `regenerate` runs, new block gets v1 sessions. Subsequent v2 generation on same date under same block_id will conflict. | CLOSED for v2 natural flow; still an issue if regenerate runs |
| D4 | `skipped_dates` is a `text[]` of ISO dates; comparison uses `text = any(text[])` | Always correct since both sides are text | CLOSED |
| D5 | `insert-rest-day` deletes session using profile block_id; if session is under old block_id, delete silently fails | Session remains, not actually rest-ed | OPEN - test by visiting an old-block session date and inserting rest |

---

## 4. Error Handling

Every API route must: (a) release client in finally, (b) catch errors, (c) log via `logError`, (d) return 500 with error key.

| ID | File | Missing | Status |
|----|------|---------|--------|
| E1 | `plan/today/route.ts` | No try/catch around main DB queries (only `finally` for release) | OPEN |
| E2 | `plan/week/route.ts` | No try/catch around main DB queries (only `finally` for release) | OPEN |
| E3 | `plan/regenerate/route.ts` | Has try/catch + logError + ROLLBACK | CLOSED |
| E4 | `plan/shift/route.ts` | Has try/catch + logError + ROLLBACK | CLOSED |
| E5 | `plan/insert-rest-day/route.ts` | Has try/catch + logError + ROLLBACK | CLOSED |
| E6 | `plan/session-minutes/route.ts` | Has try/catch + logError + ROLLBACK | CLOSED |
| E7 | `plan/skip-exercise/route.ts` | Has try/catch | CLOSED |
| E8 | `plan/toggle-deload/route.ts` | Has try/catch + logError | CLOSED |
| E9 | `plan/exercise-settings/route.ts` | Has try/catch + logError | CLOSED |
| E10 | `session/[date]/page.tsx` | Has outer catch returning in-page error UI | CLOSED |
| E11 | `dashboard/page.tsx` | Has outer catch returning in-page error UI | CLOSED |

---

## 5. Test Coverage Gaps

### 5a. Tests that will break due to recent code changes

| ID | Test | Issue | Status |
|----|------|-------|--------|
| T1 | `schedulerIntegration.test.ts` test 2: "generates and stores a new workout when the day was skipped" | `skipped_dates: ["2026-04-03"]` + calling for "2026-04-03" -- new guard returns null, but test expects "session-new" | FAILING - must fix |

### 5b. Critical paths with zero test coverage

| ID | Path | Why It Matters |
|----|------|----------------|
| T2 | v2 `selectDayType` | Only function that determines session rotation; wrong rotation = wrong workout type forever |
| T3 | v2 `selectExercisesForSession` | Core selection logic; candidate filtering, no-repeat rule, equipment diversity |
| T4 | v2 `ensureWorkoutPlanForDateV2` (end-to-end) | Full generation path never tested; enum cast bug was in this path |
| T5 | `ensureWorkoutPlanForDate` Sunday guard | New guard has no test |
| T6 | `ensureWorkoutPlanForDate` skipped-date guard | New guard has no test |
| T7 | `plan/today` route | No test |
| T8 | `plan/week` route | No test |
| T9 | `plan/regenerate` route | No test |
| T10 | `plan/shift` route | No test |
| T11 | `plan/insert-rest-day` route | No test |
| T12 | `plan/session-minutes` route | No test |

### 5c. Integration test gap (most important)

No test runs SQL against a real (or containerized) PostgreSQL schema. All DB tests mock `client.query`. This means:
- Enum type mismatches (like S1) will never be caught in CI
- Missing columns surface only in production
- FK violations never caught

**Recommended fix:** Add a `vitest.integration.config.ts` that spins up a local Postgres (Docker) and runs migrations before tests. Tag integration tests separately so they don't block fast unit CI.

---

## 6. v1/v2 Migration Completeness

The app has `GYM_V2_ENABLED=true` in production. The following v1 code paths are still active and conflict with v2:

| ID | File | Issue | Risk |
|----|------|-------|------|
| V1 | `plan/regenerate/route.ts` | Generates a full v1 block with pre-populated sessions via `generateInitialBlock`. Under v2, sessions are generated on-demand per visit. Running regenerate while v2 is active: (a) creates new block_id, (b) populates with v1-type sessions for future dates, (c) these sessions have exercises so v2 will reuse them, (d) user gets v1 sessions instead of v2. | CRITICAL |
| V2 | `plan/shift/route.ts` | Shifts future unperformed sessions by date. In v2 there are no pre-populated sessions to shift (they are generated on visit). If old v1 sessions exist under the block, shift would move them. | LOW - effectively a no-op in v2 |
| V3 | `syncCompletedWorkoutAndState` in `integration.ts` | Still used by `plan/session-minutes`. Calls `loadExerciseRows` + `loadCompletedWorkoutsForScheduler` + `refreshSchedulerState`. These update v1 `progression_state`. Harmless for v2 (v2 doesn't read this state), but wastes 3 DB queries on every cardio save. | LOW |
| V4 | `insertPlannedWorkoutV1` in `integration.ts` | Still active for `GYM_V2_ENABLED=false` path. Dead code in production. | LOW |

---

## 7. Code Quality

| ID | File | Issue |
|----|------|-------|
| Q1 | `plan/session-minutes/route.ts:42-46` | SQL indentation broken -- `cardio_saved_at = now()` and `where` are at column 0 inside a template literal |
| Q2 | `plan/today/route.ts` + `plan/week/route.ts` | `select pe.*` wildcard -- returns all columns including ones the consumer doesn't need; schema changes silently change API responses |
| Q3 | `plan/week/route.ts` | No error handler (only finally). An exception returns a raw Next.js 500 with no JSON body |
| Q4 | `plan/today/route.ts` | Same as Q3 |
| Q5 | `v2/select.ts:candidatesForSlot` | `role === "secondary"` allows exercises tagged `primary` -- this is intentional per comments but undocumented |
| Q6 | `integration.ts:EXERCISE_META_FALLBACK` | 130-line hardcoded map for exercises 1-25. Still needed as fallback but should have a comment explaining when it's hit and a migration plan to remove it |

---

## 8. Execution Order

Fix in this order to avoid blocking deploys:

**Immediate (blocks current users):**
1. T1 -- fix breaking test in `schedulerIntegration.test.ts`
2. S3 -- add `skipped_at is null` to `plan/today` exercise query
3. S4 -- add `skipped_at is null` to `plan/week` exercise query

**High (correctness bugs):**
4. B5 / V1 -- disable or rewrite `plan/regenerate` for v2 (simplest fix: return 400 if GYM_V2_ENABLED)
5. E1 -- wrap `plan/today` in try/catch + logError
6. E2 -- wrap `plan/week` in try/catch + logError
7. D5 -- verify `insert-rest-day` works against v2 sessions (test manually)

**Medium (code quality):**
8. Q1 -- fix SQL indentation in `session-minutes`
9. Q2/Q3/Q4 -- replace `pe.*` with explicit column list + add try/catch

**Future (test infrastructure):**
10. T2-T6 -- add unit tests for v2 scheduler (selectDayType, Sunday guard, skipped guard)
11. T7-T12 -- add mock-client tests for uncovered API routes
12. Integration test setup -- Docker Postgres + schema migration runner in CI

---

## Appendix: How to Verify Schema Columns Quickly

```bash
export PATH="/opt/homebrew/Cellar/postgresql@16/16.13/bin:$PATH"
SUPABASE_DB_URL=$(cd /Users/deepakgupta/Claude-Code/Projects/gym-app && netlify env:get SUPABASE_DB_URL --context production)

# All columns on a table
psql "$SUPABASE_DB_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='plan_exercises' ORDER BY ordinal_position;"

# All enum values
psql "$SUPABASE_DB_URL" -c "SELECT unnest(enum_range(NULL::session_type_enum))::text;"

# Sessions vs profile block_id match
psql "$SUPABASE_DB_URL" -c "SELECT ps.date, ps.block_id = up.block_id as match FROM plan_sessions ps CROSS JOIN user_profile up WHERE ps.date >= current_date ORDER BY ps.date LIMIT 10;"
```
