<!-- DOC-STATUS: FROZEN; generated 2026-07-15; point-in-time audit at HEAD d95aaac -->
# Code Review + PRD v2.0 Conformance -- 2026-07-15

Scope: full codebase review cross-referenced against `docs/gym-prd-v2.0-2026-04-17.md` (rev 5).
HEAD at review: `9c07894`.

---

## Summary

The implementation is in good shape. The core scheduler logic (load computation, rotation,
equipment diversity, deload) is solid and the INC-020/021 fixes from this session are correct.
The main issues are: (1) three deliberate spec deviations that were never written back into the PRD,
(2) one behavioural gap in the forcedDayType path, (3) a minor semantic mismatch in rationale_code,
and (4) the PRD's "Not yet shipped" section being completely stale.

---

## Category 1 -- Real Bugs / Production Risks

### B1: `forcedDayType` bypasses no-repeat rule (PRD Section 4.2 Rule 3)

**File:** `src/lib/scheduler/v2/index.ts` line 362-364

PRD Section 4.2 rule 3: "If the user requested a specific day type via UI override, honor it
**unless it violates 3.2**" (the no-repeat rule).

Code path:
```ts
if (forcedDayType) {
  dayType = forcedDayType;  // deload check skipped -- intentional (OK)
  // no-repeat check ALSO skipped -- not intentional
}
```

The no-repeat guard in `selectDayType` is bypassed entirely when `forcedDayType` is set. A user
can override to push_upper on consecutive days, picking up the same exercises that were loaded
yesterday (since `recentExerciseIds` still applies at the selection layer and will just trigger
the fallback, but the day type itself can repeat).

**Risk:** Low in practice (single-user, conscious choice) but violates the spec. The fix is a
simple soft-warn: after setting `dayType = forcedDayType`, still load `recentExerciseIds` and
log a warning if the forced type was also the previous session's type.

---

### B2: Back-off applies to secondary-role exercises (PRD Section 2.2)

**File:** `src/lib/scheduler/v2/constants.ts` line 47

PRD Section 2.2: back-off sets are specified **only** for "exercises tagged role IN
(primary_compound, primary_push, primary_pull, primary_squat, primary_hinge)."
Accessories get straight sets. Secondary is not listed in either camp.

Code: `secondary: { ..., useBackOff: true }` -- secondary exercises get a back-off set
(top set heavier than sets 2-3).

The PRD uses legacy fine-grained role names (primary_compound, etc.) that the v2 implementation
collapsed into primary/secondary/accessory. Applying back-off to secondary is arguably
correct training science (RDL, Pull-Up secondary compound = back-off makes sense), but it
is a spec deviation. It should be either reconciled into the PRD or explicitly documented
as a v2 role-mapping decision.

**Risk:** None for correctness -- users see better programming. Just a spec gap.

---

## Category 2 -- PRD Spec Deviations (Deliberate, But PRD Not Updated)

These are intentional engineering decisions that diverged from the PRD. Each has code-level
comments justifying the change, but the PRD was never amended. The spec is stale.

### D1: No-repeat window is 2 days (PRD says 7 days)

**PRD Section 3.2:** "Within any rolling 7-day window, no exercise of any role may appear
in two sessions."

**Code** (`index.ts` line 70): `and ps.date >= $2::date - interval '2 days'`

Rationale in code: with a 5-day rotation, the previous push_upper session is 5 days ago.
A 7-day window excludes ALL push_upper accessories on every push_upper day, collapsing
the fallback pool. 2 days preserves variety without starving candidates. Decision D009.

**PRD update needed:** Add a note in Section 3.2 and in Section 0a that the no-repeat
window is 2 days in the live implementation.

---

### D2: Deload session threshold is 8 (PRD says >= 6)

**PRD Section 4.5:** "the user has logged >= 6 sessions in 7 days"

**Code** (`index.ts` line 204): `if (recentSessionCount >= 8) return true;`

Rationale: a 4-session/week user with a rolling 7-day window spanning two calendar weeks
can legitimately show 7-8 sessions without being overtrained. Threshold 6 was triggering
deloads too aggressively.

**PRD update needed:** Section 4.5 and `shouldAutoDeload`'s exported comment should
reflect >= 8, not >= 6.

---

### D3: Equipment rotation window is 7 days (PRD says 14 days)

**PRD Section 4.3 Step 5:** "exclude exercises whose equipment_type matches what was used
for this muscle_primary in the **prior 14 days**."

**Code** (`index.ts` line 155): `and sl.performed_at >= $2::date - interval '7 days'`

Rationale: at 4 sessions/week, the same day type recurs every ~9 days. A 14-day window
blocked all barbell-hamstrings exercises (RDL + Deadlift) for an entire hinge cycle (INC-018,
D020). 7 days allows barbell to re-enter after one hinge cycle.

**PRD update needed:** Section 3.4 and Section 4.3 Step 5 should say 7 days.

---

## Category 3 -- Minor Spec Gaps

### M1: `rationale_code` values don't match PRD's enum

**PRD Section 5.2:** `rationale_code` should be one of
`{rotation, under_exposed_muscle, user_requested, seed_only, equipment_rotation}` --
these describe WHY THE EXERCISE WAS SELECTED.

**Code** (`load.ts`): actual values are `progression`, `hold`, `regression`, `seed_only`,
`bodyweight_seed`, `bodyweight_reps` -- these describe WHY THE LOAD IS WHAT IT IS.

The implementation uses rationale_code for load progression feedback to the user
(which is what PRD Section 7 actually describes). The selection-reason codes from Section 5.2
are never stored. Acceptance criterion #7 ("non-null rationale_code and non-empty
rationale_text") is satisfied, but the intended values are different.

**Impact:** UI displays load-progression rationale (correct, matches Section 7). Selection
rationale (rotation, under_exposed_muscle) is not stored anywhere. Low risk.

---

### M2: `full_body` session applies same 3-group equipment constraint as 5-slot sessions

**PRD Section 3.4:** "If day type is `full_body` (3 slots), minimum drops to
**2 distinct equipment types**" and the barbell rule becomes "barbell OR specialty_bar OR dumbbell."

**Code** (`constants.ts` EQUIPMENT_GROUPS + `requiredEquipmentTypes`): the same 3 required groups
(barbell_family, dumbbell_family, machine_family) are applied unconditionally, regardless of
session slot count.

For full_body (3 slots + 3 groups), `requiredEquipmentTypes` fires with all 3 groups required
from slot 0 (3 slots remaining = 3 unfulfilled groups). If any one group has zero candidates
(e.g., no machine exercise allowed in full_body), the constraint is released
(`unfulfilledGroups.length > slotsRemaining` -> return null).

**Impact:** full_body tries for a barbell + dumbbell + machine combination instead of PRD's
relaxed 2-group minimum. In practice the safety valve (null return) prevents hard failures.
The constraint is stricter than spec but has a soft fallback.

---

### M3: Exercise ranking does not implement "longest-ago use" dimension

**PRD Section 4.3 Step 6b:** "Rank remaining by... (b) longest-ago use."

**Code** (`select.ts` `scoreOne`): recency is binary -- recently-used exercises get -200 penalty;
all fresh exercises are scored identically on this dimension.

There is no gradation by how many days ago an exercise was last performed. The deterministic
hash tiebreaker (`deterministicPick`) produces stable order within the fresh pool, which
achieves variety without explicit recency scoring.

**Impact:** Negligible. The no-repeat filter already excludes recent exercises from the fresh
pool. "Longest-ago use" ranking within the fresh pool would add marginal variety.

---

## Category 4 -- Stale PRD Documentation

The PRD Section 0a "Not yet shipped" table lists 7 items. All 7 are actually shipped:

| PRD "Not yet shipped" | Actual status |
|---|---|
| Dashboard weekly volume bars (Sec 6.3) | CLOSED W8 -- commit `76e9888` (2026-06-10) |
| /api/muscle-volume endpoint (Sec 8.1) | CLOSED W8 -- same commit |
| Settings frequency override (Sec 6.5) | CLOSED W12 -- commit `535c1d3` (2026-06-10) |
| Deload auto-trigger rule (Sec 4.5) | CLOSED W10 -- commit `535c1d3` (2026-06-10) |
| Equipment rotation week-over-week (Sec 3.4) | CLOSED D020 -- INC-018 fix (2026-06-30) |
| /history muscle-group filter (Sec 6.4) | CLOSED W9 -- commit `5ea9fc9` (2026-06-10) |
| Warm-up set logging (Sec 11.6) | CLOSED W13 -- migration 0034 (2026-06-10) |

Also stale: PRD Section 14 says Netlify is the primary deployment platform. The tracker
records Netlify as idle; Vercel (`deepak-gym-tracker.vercel.app`) is primary as of D015.

---

## Acceptance Criteria Status (PRD Section 9)

| # | Criterion | Status |
|---|---|---|
| 1 | Volume floor: sets >= 3, reps_min >= 12 | PASS -- PRESCRIPTION floors enforced |
| 2 | Day separation: consecutive primaries don't overlap | PASS -- no-repeat filter (2-day window) |
| 3 | Upper/lower strictness | PASS -- `allowed_day_types` + `forbidden_day_types` filters |
| 4 | Compound first: slot 1 = primary role | PASS -- SLOT_ROLES[*][0] = "primary" |
| 5 | Load ordering: back_off < top_set for primaries | PASS -- BACK_OFF_PERCENT=0.9 < 1.0 |
| 6 | Progression logic | PASS -- INC-020 fix; Number() coercion applied |
| 7 | Rationale present (non-null) | PASS -- but values differ from PRD enum (see M1) |
| 8 | No regen after log | PASS -- integration.ts guards on set_logs |
| 9 | Weekly minimums hit | PASS -- WEEKLY_MIN_SETS enforced by selectDayType |
| 10 | Equipment diversity per session (>= 3 types) | PASS with caveat -- 3 groups enforced, safety valve if impossible |
| 11 | Equipment diversity per week | PARTIAL -- EQUIPMENT_GROUPS checks per-session; week-level count not independently verified |
| 12 | Equipment rotation (no same equip consecutive weeks) | PASS -- loadLastEquipmentByMuscle with 7-day window |
| 13 | Bodyweight display (total = bw + added) | PASS -- ExerciseCard + bodyweight_mode flag |
| 14 | Unilateral semantics | PASS -- per_side_reps flag, "per side" labeling in ExerciseCard |

---

## Action List (ranked)

| Priority | Action |
|---|---|
| P1 | Update PRD Section 3.2: no-repeat window = 2 days (not 7); add D009 reference |
| P1 | Update PRD Section 4.5: deload session threshold = 8 (not 6) |
| P1 | Update PRD Section 4.3 Step 5 + Section 3.4: equipment rotation window = 7 days (not 14) |
| P1 | Update PRD Section 0a: move all 7 "Not yet shipped" items to "Shipped" table |
| P2 | Fix B1: add soft no-repeat check when forcedDayType is used (log warning, don't block) |
| P2 | Update PRD Section 5.2: rationale_code is load-progression code, not selection code |
| P2 | Update PRD Section 14: Vercel is primary deployment, Netlify is idle |
| P3 | Document secondary back-off decision in PRD Section 2.2 (currently not addressed) |
| P3 | Update PRD Section 3.4 full_body equipment rule to match code (3 groups, with safety valve) |
