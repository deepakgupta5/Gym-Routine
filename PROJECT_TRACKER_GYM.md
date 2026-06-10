# PROJECT_TRACKER_GYM.md

Single source of truth for gym app state. Update every session.

---

## Status Snapshot -- 2026-06-09 (updated)

**Deployment:** Netlify (`deepakgupta5`), site `gym-routine-app.netlify.app` -- green
**GitHub HEAD:** `de1639e` (fix rotation stuck on hinge_lower)
**CI:** Green (128 tests)
**Migration HEAD:** 0031
**Build:** `npm run build` / `.next` / `@netlify/plugin-nextjs`

---

## Active Work Queue

| Priority | Item | Notes |
|---|---|---|
| P1 | Delete old Netlify sites on `deepak-gupta5` | gym-routine-app (36697ac0) + meal-planner-deepak (2c69b0f8); new account confirmed working |
| P3 | Implement top-set + back-off load computation | PRD Section 4.4; not yet built |
| P3 | Progression visibility ("up 5 lb" rationale) | PRD Section 7; not yet built |
| P4 | Equipment diversity / rotation rules | PRD Section 3.4; not yet built |
| P4 | /today hero + day type override UI | PRD Section 6.1; not yet built |

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
| 2026-06-09 | commit `de1639e` | Fix rotation stuck on hinge_lower: ORDER BY date ASC LIMIT 10 was reading 10 oldest sessions; changed to DESC LIMIT 1 (INC-012) |
| 2026-06-09 | migration 0031 | Enum values no-op + purge all unperformed sessions to reset rotation |

---

## Data Model

**Migration HEAD:** 0031
**Key tables:** `plan_sessions`, `plan_exercises`, `set_logs`, `exercises`, `body_stats_daily`
**Key fields on exercises:** `suitable_slots`, `allowed_day_types`, `user_preference_score`, `role`
**Key fields on plan_sessions:** `cardio_type`, `performed_at`, `cardio_saved_at`

**suitable_slots assignments (post-0028):**
- `['primary','secondary']` -- exercises 26 (Back Squat), 28 (Pull-Up)
- `['secondary','accessory']` -- exercises 27, 29-34, 38, 40
- `['accessory']` -- exercises 35-37, 39, 41-42
- Core exercises (43 Cable Crunch, 44 Hanging Knee Raise, 25 Pallof Press): fixed in 0026

---

## Known Gaps / Bugs (Open)

| ID | Description | Root cause | Status |
|---|---|---|---|
| G1 | Load progression not yet dynamic | getPrescriptionForRole still static map; PRD 4.4 not implemented | Open |
| G2 | No "rationale text" on exercise cards | PRD Section 7 not built | Open |
| G3 | Equipment diversity not enforced | Scheduler does not check equipment_type across slots | Open |
| G4 | Exercise repeat | CLOSED -- migration 0030 run 2026-06-09, INC-011 resolved | Closed |
| G5 | Rotation stuck on hinge_lower | CLOSED -- ORDER BY ASC LIMIT 10 read 10 oldest sessions; fixed DESC LIMIT 1 + migration 0031, INC-012 resolved 2026-06-09 | Closed |

---

## Next Session Checklist

- [ ] Delete old Netlify sites on `deepak-gupta5` (both new sites confirmed working)
- [ ] Decide: implement PRD 4.4 load computation next?
