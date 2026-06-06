# PROJECT_TRACKER_GYM.md

Single source of truth for gym app state. Update every session.

---

## Status Snapshot -- 2026-06-06

**Deployment:** Netlify (`deepakgupta5`), site `gym-routine-app.netlify.app`
**GitHub HEAD:** `0138169` (Remove ignore = exit 0 from netlify.toml)
**CI:** Green
**Migration HEAD:** 0028
**Build:** `npm run build` / `.next` / `@netlify/plugin-nextjs`

---

## Active Work Queue

| Priority | Item | Notes |
|---|---|---|
| P1 | Add env vars to new Netlify account | DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, NEXTAUTH_SECRET, NEXTAUTH_URL |
| P1 | Test app on new Netlify URL | Log a session; check exercises load correctly |
| P2 | Delete old Netlify sites on `deepak-gupta5` | gym-routine-app (36697ac0) + meal-planner-deepak (2c69b0f8) |
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
| 2026-06-06 | -- | Migrated to new Netlify account (deepakgupta5) |

---

## Data Model

**Migration HEAD:** 0028
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

---

## Next Session Checklist

- [ ] Confirm env vars set on new Netlify account
- [ ] Confirm gym app loads and sessions work on new URL
- [ ] Delete old Netlify sites once confirmed
- [ ] Decide: implement PRD 4.4 load computation next?
