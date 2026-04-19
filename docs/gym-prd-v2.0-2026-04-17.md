# Gym App PRD v2.0 (Complete Redesign)

Version: 2.0 DRAFT (rev 2)
Date: 2026-04-17, rev 2 on 2026-04-18
Scope: UI, data model, scheduler, equipment
Base: `docs/nutrition-pwa-prd-v1.1-2026-02-24.md` (shipped state)
Replaces: gym-side contracts in v1.1 sections 3, 7. Nutrition scope in v1.1/v1.2 is unchanged.
Status: Draft for user review before any code changes.

---

## 0) Why v2.0

User-observed failures of the shipped (v1.1) + rolling-scheduler (migration 0019) state:

1. Session variety: after switching to rolling scheduler, some days still presented near-identical exercise lists to the previous leg/push day. Push template included a lower-body secondary slot (hipthrust), blurring upper vs lower.
2. Weight progression: `next_target_load` copied forward the last logged load with no overload logic. Fixed partially on 2026-04-13 (commit 30f0fff) but prescription-range hardcoding in `getPrescriptionForRole` still limits responsiveness.
3. Rep progression: rep ranges are static per role, no read-back of how many reps the user actually hit, no clear "next target reps" surfaced to the user.
4. UX: no single screen shows "what do I lift today, how heavy, how many reps, and why that is the target." Users see a list, not a plan.

v2.0 addresses all four: explicit prescription contract, strict day-type separation, visible progression logic, and a session UI that answers "what and why" at a glance.

---

## 1) Product Objectives (Ranked)

1. **Every workout feels different.** Leg day shares zero primary exercises with the preceding upper day. Within a 7-day window, no exercise repeats as a primary lift.
2. **Reps and weight move forward week over week.** The user should see "last time you did X, this time do Y" on every set, and `Y > X` whenever performance in the prior session warrants it.
3. **Volume floor is hit every set.** Minimum 3 sets of 12 reps per exercise; shortfall is visible and intentional, not accidental.
4. **One-screen session view.** The session page shows, for each exercise: prior load/reps, today's target (sets, reps, load), and a single tap to log.

Non-goals for v2.0: new social features, wearable sync, HRV-driven readiness, barcode scanner (nutrition), cloud backup of media.

---

## 2) Prescription Contract (Binding)

### 2.1 Minimum volume
Every prescribed exercise in every session:
- **Sets**: minimum 3, maximum 5.
- **Reps**: minimum 12, target range 12 to 15 for accessories, 12 to 13 for compounds.
- **Load**: explicit in lb, stored per set as `target_load_lb`.

If a session plan cannot meet the 3 by 12 floor for any slotted exercise (e.g., exercise has no previous data and role has no seed load), the scheduler must either substitute an exercise with seed data or flag the slot as `needs_seed` and present a bodyweight/light-load prompt on the UI.

### 2.2 Load ordering within an exercise (top set + back-off)

For exercises tagged `role IN (primary_compound, primary_push, primary_pull, primary_squat, primary_hinge)`:

- **Set 1 (top set)**: heaviest. Target 12 reps at RIR 1 to 2. `load = next_target_load_lb`.
- **Sets 2 to 3 (back-offs)**: `load = round_to_5lb(top_set_load * 0.90)`. Target 12 to 15 reps each.

For exercises tagged `role IN (accessory, isolation, unilateral)`:

- **All sets straight**: same load across 3 sets. Target 12 to 15 reps per set.

Rationale: see Section 0 best-practice check in the kickoff message. Top-set + back-off is evidence-supported for compound lifts; straight sets are simpler and equivalent for isolation work.

### 2.3 Exercise ordering within a session (compound first)

Session blueprint slots are filled in this fixed order:

1. Primary compound (squat / bench / row / hinge family per day type)
2. Secondary compound (same movement pattern, different angle)
3. Accessory 1 (muscle-group specific)
4. Accessory 2 (muscle-group specific)
5. Isolation / finisher

Heaviest absolute load lands in slot 1 or 2, not later. This is universal, not user-option.

---

## 3) Day Types and Separation Rules

### 3.1 Day type catalog

| Session type | Primary movement patterns | Forbidden patterns |
|--------------|---------------------------|--------------------|
| `push_upper` | horizontal push, vertical push, tricep, front delt | any hip hinge, squat, hamstring, calf, lower-body unilateral |
| `pull_upper` | horizontal pull, vertical pull, bicep, rear delt | any hip hinge, squat, hamstring, calf, lower-body unilateral |
| `squat_lower` | knee-dominant squat, quad, glute (squat pattern) | any horizontal/vertical push, horizontal/vertical pull, bench-family |
| `hinge_lower` | hip-dominant hinge, hamstring, glute (hinge pattern), calf | any horizontal/vertical push, horizontal/vertical pull, bench-family |
| `full_body` | one compound from each of squat OR hinge, one push, one pull | none (deload/travel day variant, max 3 exercises) |

**Key change from v1.1 / migration 0019**: `push` and `pull` days are **strictly upper-body**. No token lower-body slot. The `hipthrust` slot that currently lives in the push blueprint is removed.

### 3.2 Day-to-day separation (no-repeat window)

- Within any rolling 7-day window, no primary compound may appear in two sessions.
- Between day N and day N+1, zero overlap in primary or secondary compound exercises.
- Accessories may repeat across days only if the muscle group's `muscle_exposures.hard_ready_at` has passed.

### 3.3 Weekly frequency targets (per muscle group)

Assumed schedule: 5 sessions per week (per user answer to §11.1). Rotation: `push_upper -> squat_lower -> pull_upper -> hinge_lower -> full_body`, repeating. This produces 1x push, 1x pull, 1x squat, 1x hinge, and 1x mixed per ISO week.

From training science (Schoenfeld et al., 10 to 20 sets per muscle per week for hypertrophy). Minimums enforced by scheduler, calibrated for the 5-day rotation:

| Muscle group | Min weekly sets | Max weekly sets |
|--------------|-----------------|-----------------|
| Quads | 12 | 22 |
| Hamstrings | 10 | 18 |
| Glutes | 12 | 22 |
| Chest | 12 | 22 |
| Back (lat + mid-back) | 14 | 24 |
| Shoulders (front + side + rear) | 12 | 20 |
| Biceps | 8 | 16 |
| Triceps | 8 | 16 |
| Calves | 8 | 16 |
| Core | 6 | 14 |

Scheduler tracks weekly running totals from `set_logs` and prefers slots that close the gap to minimums for under-exposed muscles, subject to Section 3.2 no-repeat rules.

### 3.4 Equipment diversity rules (new)

Every exercise carries an `equipment_type` tag (Section 5.2) from this set:

| Tag | Examples |
|-----|----------|
| `barbell` | back squat, bench press, deadlift, barbell row |
| `dumbbell` | DB bench, DB row, DB curl, DB lateral raise, DB Bulgarian split squat |
| `machine_plate_loaded` | hammer strength chest press, plate-loaded row, leg press |
| `machine_selectorized` | seated cable row, leg extension, leg curl, pec deck |
| `cable` | cable fly, triceps pushdown, face pull, cable lateral raise |
| `smith_machine` | smith squat, smith incline press, smith row |
| `bodyweight` | pull-up, dip, push-up, hanging leg raise |
| `kettlebell` | KB swing, goblet squat |
| `specialty_bar` | trap bar deadlift, safety squat bar squat |

Multi-use / multi-attachment equipment is captured via a separate `equipment_variants` field on the exercise row (e.g., cable machine exercises record the attachment used: rope, straight bar, D-handle, ankle strap, long bar).

**Diversity rule (per session)**: every generated 5-slot session must include at least 3 distinct `equipment_type` values. At least 1 slot must be `barbell` OR `specialty_bar` (forces a real loaded free-weight movement when the day type has a barbell-compatible pattern). At least 1 slot must be `dumbbell` OR `bodyweight` (forces unilateral / stabilizer work). At least 1 slot must be `machine_selectorized` OR `machine_plate_loaded` OR `cable` (machine slot for safe high-rep finishing).

Exception: if day type is `full_body` (3 slots), minimum drops to 2 distinct equipment types and the barbell-required rule becomes "barbell OR specialty_bar OR dumbbell."

**Diversity rule (per week)**: across the 5 scheduled sessions, every `equipment_type` in `{barbell, dumbbell, machine_selectorized, cable}` must appear at least twice. This prevents the scheduler collapsing into "all barbell" or "all machine" weeks.

**Equipment rotation rule**: for the same muscle group, consecutive weeks rotate equipment. Example: if week 1 chest primary was `barbell bench press`, week 2 chest primary must be `dumbbell bench press` or `machine_plate_loaded chest press` or `smith_machine incline press`, not `barbell bench press` again. Enforced via `last_equipment_per_muscle_per_user` check in the scheduler.

---

## 4) Scheduler Behavior (Rolling, Event-Driven)

### 4.1 Triggering
Session plan is generated on first access of a date, and regenerated if:

- no `set_logs` exist against the session, AND
- the session `plan_session_id` is older than 24 hours, OR
- a force-regenerate button is pressed (new in v2.0).

Sessions with any logged sets are never regenerated (history is immutable).

### 4.2 Day type selection
Input state at generation time:

- user's logged sessions in the prior 7 days (by type and muscle exposure)
- weekly running totals per muscle group
- each exercise's `muscle_exposures.hard_ready_at` timestamp

Selection rule (priority order):

1. If any muscle group is below min weekly sets and we are past Wednesday of the current ISO week, pick the day type that targets the deepest under-exposed group.
2. Else, rotate through day types in a deterministic order, ensuring Section 3.2 no-repeat: `push_upper -> squat_lower -> pull_upper -> hinge_lower -> full_body -> (repeat)`.
3. If the user requested a specific day type via UI override, honor it unless it violates 3.2.

### 4.3 Exercise selection within a day type
Fixed slot count per day type (always 5, except `full_body` which is 3). For each slot:

1. Filter exercise catalog to role + day type's allowed patterns.
2. Exclude exercises with `muscle_exposures.hard_ready_at > now()` for the targeted muscle.
3. Exclude exercises used as primary or secondary in the prior 7 days.
4. Apply §3.4 equipment diversity constraint: if slots already filled leave only one slot to satisfy a required equipment category, restrict this slot's candidates to that category.
5. Apply equipment rotation rule: exclude exercises whose `equipment_type` matches what was used for this `muscle_primary` in the prior 14 days.
6. Rank remaining by: (a) equipment category gap-fill priority per §3.4, (b) longest-ago use, (c) user preference (manual boost/demote via Settings), (d) seed-data completeness (exercises with load history ranked higher than unseeded).
7. Pick top 1.

Deterministic seed: hash of `(user_id, session_date_iso, slot_index)` so the same date always produces the same plan on regeneration, preventing accidental day-to-day drift when user reopens the app.

### 4.4 Load computation per exercise

```
prev = latest completed top-set of this exercise (from set_logs, status = completed)
prescription = prescription_for_role(exercise.role)  // sets, rep range, scheme

if prev is null:
  next_top_set_load = exercise.seed_load_lb ?? bodyweight_prompt
  new_exercise_flag = true
else:
  increment = exercise.load_increment_lb  // default 5
  if prev.reps >= prescription.reps_target_high:  // e.g., 13 for compounds
    next_top_set_load = prev.load + increment
  elif prev.reps < prescription.reps_min:  // 12
    next_top_set_load = max(0, prev.load - increment)
  else:
    next_top_set_load = prev.load  // hold; beat the rep count

if exercise.role in PRIMARY_ROLES:
  back_off_load = round_to_5lb(next_top_set_load * 0.90)
else:
  back_off_load = next_top_set_load  // straight sets
```

This replaces the current `getPrescriptionForRole` static map.

### 4.5 Deload rule
If any muscle group exceeds `max weekly sets` in the prior 7 days, or the user has logged >= 6 sessions in 7 days, the next generated session is `full_body` with 3 exercises and all loads at 80% of `next_target_load`. Manual deload toggle in Settings also forces this.

---

## 5) Data Model

### 5.1 Tables to keep (from existing schema)
- `exercises` (48 rows, migration 0019 fields)
- `set_logs`
- `plan_sessions`
- `muscle_exposures`
- `planned_workouts` (migration 0019)
- `body_stats_daily`
- `blocks` (legacy, kept read-only for history pages)

### 5.2 Fields to add (migration 0020)

On `exercises`:
- `seed_load_lb numeric(6,2)`: default load when no history exists. For `bodyweight` exercises, stores the added load (belt / vest / dumbbell between feet). 0 = unloaded bodyweight.
- `muscle_primary text`: normalized primary muscle group (maps to Section 3.3 rows)
- `muscle_secondary text[]`: secondary groups, counted at 0.5 weight in weekly totals
- `allowed_day_types text[]`: subset of `{push_upper, pull_upper, squat_lower, hinge_lower, full_body}`
- `user_preference_score int default 0`: -2 to +2, set via Settings boost/demote
- `forbidden_day_types text[]`: explicit block list (populates from role to day-type rules in seed)
- `equipment_type text not null`: one of `{barbell, dumbbell, machine_plate_loaded, machine_selectorized, cable, smith_machine, bodyweight, kettlebell, specialty_bar}` per §3.4
- `equipment_variants text[]`: optional attachment list for multi-use equipment (e.g., cable machine: `['rope', 'straight_bar', 'd_handle', 'ankle_strap', 'long_bar']`). Used by UI to show "with rope attachment" label.
- `is_unilateral boolean not null default false`: triggers per-side rep semantics (§11.3 resolution)
- `uses_bodyweight boolean not null default false`: triggers total-system-weight display (§11.2 resolution). True for pull-up, dip, push-up, and any movement where bodyweight is a meaningful share of the load.

On `planned_workouts`:
- `top_set_target_reps int not null default 12`
- `top_set_target_load_lb numeric(6,2) not null`: for `uses_bodyweight=true` exercises, this is the ADDED load only; UI computes and shows `bodyweight_lb + top_set_target_load_lb` as the display total.
- `back_off_target_reps int not null default 13`
- `back_off_target_load_lb numeric(6,2) not null`
- `per_side_reps boolean not null default false`: true when `exercises.is_unilateral`; UI shows "per side" and reps field logs per-side count
- `equipment_variant text`: which attachment was prescribed (e.g., `rope` for triceps pushdown)
- `rationale_code text`: why this exercise was picked: `{rotation, under_exposed_muscle, user_requested, seed_only, equipment_rotation}`
- `rationale_text text`: human-readable version for UI tooltip

On `plan_sessions`:
- `session_blueprint_version int not null default 2`: allows rolling forward if blueprint changes

### 5.3 Views (migration 0020)

`v_weekly_muscle_volume`: running 7-day set count per `muscle_primary`, per user. Used by scheduler 4.2 rule 1.

`v_last_top_set_per_exercise`: most recent top set (set_logs where set_index = 1 and status = completed) per exercise, per user. Used by 4.4.

### 5.4 Legacy data migration
- Existing `set_logs` and `plan_sessions` stay untouched. History pages read from them.
- Existing `block` sessions (session_type values Mon/Tue/etc.) are marked `session_blueprint_version = 1` and will not be regenerated.
- On first v2.0 session access, scheduler inserts `planned_workouts` with v2.0 blueprint. Prior `planned_workouts` rows remain; a `session_blueprint_version` filter on the session page prevents mixing.

No destructive migration. Rollback path: set app flag `GYM_V2_ENABLED=false`, scheduler falls back to v1 path.

---

## 6) UI Contract

### 6.1 `/today` (gym entry)

Top card, hero: "Today's session: **Push Upper**" with rationale line below: "Your chest and triceps are behind target this week (6 sets logged, 10 target)."

Primary CTA: "Start session" (routes to `/session/YYYY-MM-DD`).

Secondary actions (collapsed):
- "Change day type" (dropdown of 5 day types; warns if picked type violates no-repeat rule)
- "Force regenerate" (only visible if no sets logged yet for the date)
- "Skip today" (existing `/api/session/skip` flow)

Below hero: 5 exercise preview cards in session order, each showing:
- Exercise name + primary muscle icon
- "Top set: 135 lb x 12" (compound) or "3 x 12 at 20 lb" (accessory)
- "vs last time: 130 lb x 11" (delta badge, green if up, gray if hold, red if drop)

### 6.2 `/session/[date]` (logger)

One scrollable column, one card per exercise. Within a card:

- Exercise header: name + attachment label where applicable (e.g., "Triceps Pushdown, rope"), muscle tag, equipment icon, "Slot 1 of 5" indicator.
- Target panel (top): "Top set: **12 reps at 135 lb**. Back-off sets: **12 to 15 reps at 120 lb**."
- For `uses_bodyweight=true` exercises: display total system weight. Example: "Weighted Pull-up: **185 lb total** (175 bodyweight + 10 added) x 12." Added load is what the user logs; total is shown for context. Bodyweight sourced from latest `body_stats_daily`.
- For `is_unilateral=true` exercises: target and prior both labeled "per side." Example: "Bulgarian Split Squat: **12 reps per side at 30 lb**."
- Prior panel (subtext): "Last session (Apr 10): 130 lb x 11, 115 lb x 14, 115 lb x 13."
- Three set rows, pre-populated with target load. Each row: `load` input, `reps` input, checkbox.
- Log button (single tap, logs all three with pre-filled values if untouched).
- "Log warm-up" button (optional, per §11.6 resolution): opens lightweight inline rows with `is_warmup=true`, excluded from volume totals.

Design principle: user sees target + prior on the same card. No navigating to history mid-workout.

Skip exercise: existing flow, preserved.

Add set beyond 3: allowed, rows appended. No cap.

### 6.3 `/dashboard` (gym section)

Replaces current mixed panel with:

- **Weekly volume bars**: one horizontal bar per muscle group, colored by zone (under, in-range, over). Tapping a bar routes to `/history` filtered to that muscle.
- **Primary lift progress**: 3 sparklines (bench, squat, deadlift or user-chosen top 3) showing top-set load over 12 weeks. `Start / Mid / Current` labels preserved from v1.1.
- **Session count card**: "4 sessions this week, 16 this month."

Removed: any "block progress" widget (blocks are deprecated).

### 6.4 `/history`
Keep v1.1 shipped behavior. Additions:
- Filter by `session_type` (push_upper / pull_upper / squat_lower / hinge_lower / full_body).
- Filter by muscle group.

### 6.5 `/settings` (gym section)
Add:
- **Exercise preferences**: searchable list of all 48+ exercises, each with boost (+1, +2), hold (0), or demote (-1, -2) selector. Demoted exercises are last-pick; boosted are first-pick within slot constraints.
- **Load increment override**: per-exercise override of default 5 lb step.
- **Deload toggle**: force next session to deload.
- **Frequency override**: target sessions per week (default 4, range 3 to 6).

### 6.6 Bottom nav
Unchanged from v1.1: `Gym | Nutrition | Dashboard | More`.

---

## 7) Progression Visibility Rules

Every target shown to the user carries a "why":

- "135 lb, up 5 lb": last session hit 13 reps.
- "130 lb, hold": last session hit 12 reps, beat the rep count first.
- "125 lb, down 5 lb": last session stopped at 10 reps.
- "135 lb, new exercise": no prior data, using seed load.

This text appears inline on each exercise card on `/today` and `/session/[date]`, sourced from the `rationale_text` field.

---

## 8) API Changes

### 8.1 New endpoints

- `POST /api/plan/regenerate`: force-regenerate today's plan. Rejected if any `set_logs` exist for the session.
- `GET /api/plan/today?date=YYYY-MM-DD`: returns session blueprint + all exercises with target load/reps + prior set summary. Replaces current fragmented reads.
- `GET /api/muscle-volume?weeks=1`: weekly running volume per muscle group, for dashboard.
- `PUT /api/exercises/:id/preference`: body `{ score: -2..+2 }`, persists to `user_preference_score`.
- `POST /api/settings/deload`: body `{ enabled: boolean }`, triggers next-session deload.

### 8.2 Modified endpoints
- `GET /api/session/[date]`: response payload gains `top_set_target_load_lb`, `top_set_target_reps`, `back_off_target_load_lb`, `back_off_target_reps`, `rationale_code`, `rationale_text` per exercise.
- `POST /api/plan/init`: defers to new scheduler; old block-init path removed.

### 8.3 Deprecated
- `/api/admin/blocks/*`: keep for 30 days, remove in v2.1.

---

## 9) Acceptance Criteria

System-level tests (all must pass before v2.0 ships):

1. **Volume floor**: for any generated session, every `planned_workouts` row has `sets_target >= 3` and `reps_target_min >= 12`.
2. **Day separation**: for any two consecutive generated sessions, the intersection of their primary compound exercises is empty.
3. **Upper/lower strictness**: no `push_upper` or `pull_upper` session contains an exercise whose `muscle_primary` is in `{quads, hamstrings, glutes, calves}`. No `squat_lower` or `hinge_lower` session contains an exercise whose `muscle_primary` is in `{chest, back, shoulders, biceps, triceps}`.
4. **Compound first**: for any session, the exercise in slot 1 has `role LIKE 'primary_%'`.
5. **Load ordering within primary**: for any primary-role exercise, `back_off_target_load_lb < top_set_target_load_lb`.
6. **Progression logic**: given fixture `set_logs` with prev top set = 135 x 13, next target = 140. Given 135 x 11, next target = 130. Given 135 x 12, next target = 135.
7. **Rationale present**: every `planned_workouts` row has non-null `rationale_code` and non-empty `rationale_text`.
8. **No regeneration after log**: calling `POST /api/plan/regenerate` after any set is logged returns 409.
9. **Weekly minimums**: simulate 5 sessions per week for 4 weeks; every muscle group in Section 3.3 table hits at least its minimum in at least 3 of 4 weeks.
10. **Equipment diversity per session**: every generated 5-slot session has >= 3 distinct `equipment_type` values; at least 1 barbell-family, 1 dumbbell-or-bodyweight, 1 machine-family slot (§3.4).
11. **Equipment diversity per week**: over 5 consecutive generated sessions, each of `{barbell, dumbbell, machine_selectorized, cable}` appears at least twice.
12. **Equipment rotation**: for any muscle group, no two consecutive weeks' primary exercise share the same `equipment_type`.
13. **Bodyweight display**: for any `uses_bodyweight=true` exercise, the session UI renders `bodyweight_lb + added_lb` as the headline number while logging only `added_lb` to `set_logs.load_lb`.
14. **Unilateral semantics**: for any `is_unilateral=true` exercise, prescription and display show "per side"; volume accounting counts per-side reps as one set (not two).

UX-level manual checks:

15. On `/session/[date]` for a primary-role exercise, three rows appear pre-populated: row 1 with top-set load, rows 2 and 3 with back-off load ~10% lower.
16. Every exercise card shows "last session" values.
17. Changing the day type on `/today` updates the session plan immediately and regenerates all exercise cards.
18. Weighted pull-up card shows total system weight, not just added load.
19. Bulgarian split squat card shows "per side" label on both target and prior.

---

## 10) Migration and Rollout

### 10.1 Phases

1. **Phase 0 (data prep, no user-facing change)**: Migration 0020 adds fields, views, and backfills `muscle_primary` + `allowed_day_types` on all 48 exercises. Seeds `seed_load_lb` from latest top set per exercise per user where available, else from conservative defaults table.
2. **Phase 1 (scheduler rewrite, feature-flagged)**: Implement new selection logic in `src/lib/scheduler/v2/`. Feature flag `GYM_V2_ENABLED`. Default off.
3. **Phase 2 (session UI rewrite)**: New `/session/[date]` page behind same flag. Old page preserved under `/session/[date]/legacy`.
4. **Phase 3 (today + dashboard UI)**: Rewrite `/today` hero and `/dashboard` gym section.
5. **Phase 4 (settings expansion)**: Exercise preferences, load increment overrides, deload toggle.
6. **Phase 5 (flip flag, monitor)**: Flip `GYM_V2_ENABLED=true`. Keep legacy reachable for 30 days.
7. **Phase 6 (cleanup)**: Remove legacy, drop deprecated endpoints.

### 10.2 Effort bands (rough, for sizing not commitment)

| Phase | Work | Band |
|-------|------|------|
| 0 | Migration 0020 + equipment tagging + backfill script + seed defaults | 1.5 days |
| 1 | Scheduler v2 (incl. equipment diversity + rotation) + unit tests (90+ tests in existing suite to update) | 3.5 days |
| 2 | Session page UI + API adjustments (incl. total-system-weight display, per-side labels) | 2 days |
| 3 | Today + Dashboard UI | 2 days |
| 4 | Settings expansion | 1 day |
| 5 | Flag flip + monitoring | 0.5 day |
| 6 | Cleanup | 0.5 day |

Total: roughly 11 days of focused work. Split across sessions with tests passing at every phase boundary per Rule 24.

### 10.3 Data safety
No destructive migration. `set_logs` history preserved in full. Block-based sessions remain visible in `/history`. Rollback equals flip flag plus redeploy.

---

## 11) Resolved Decisions (user answers 2026-04-18)

1. **Frequency**: 5 sessions per week, fixed default. Rotation in §3.3.
2. **Bodyweight exercises**: display total system weight (bodyweight + added). Store added load only in `set_logs.load_lb`. UI computes and shows the total using latest `body_stats_daily.weight_lb`. If no bodyweight reading exists, prompt the user on first bodyweight exercise of the session.
3. **Unilateral exercises**: 12 reps per side (24 total movements, 1 logged set). UI labels "per side" on both target and prior. `exercises.is_unilateral` drives this.
4. **Cardio**: out of scope. Existing `cardio_saved_at` flow untouched.
5. **Time-capped sessions**: not in v2.0. No "only 30 minutes" trim logic.
6. **Warm-up sets**: optional "Log warm-up" button on primary-role cards. Sets tagged `is_warmup=true`, excluded from volume totals and from progression calculation.
7. **Rest timer**: v2.1, not required for v2.0.
8. **Equipment variety (new)**: mandatory mix of barbell, dumbbell, machine (selectorized / plate-loaded), cable, and bodyweight across every session and every week. Multi-attachment equipment (cable machines, functional trainers) captured via `equipment_variants`. Full rules in §3.4.

---

## 12) What This Replaces in v1.1

- v1.1 Section 3 navigation: unchanged (bottom nav stays `Gym | Nutrition | Dashboard | More`).
- v1.1 Section 7 Gym Session UI Contract: **replaced** by v2.0 Section 6.2.
- v1.1 "neutral Set #N labels": replaced by explicit "Top set", "Back-off 1", "Back-off 2" labels for primary-role exercises; straight "Set 1/2/3" retained for accessories.
- Migration 0019 rolling scheduler: superseded by v2.0 scheduler in Phase 1. Tables (`planned_workouts`, `muscle_exposures`) kept, extended by migration 0020.
- `getPrescriptionForRole` static map: replaced by data-driven computation in Section 4.4.

End of v2.0 draft. Awaiting user edits and answers to Section 11 open questions.
