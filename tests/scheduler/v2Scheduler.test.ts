import { describe, expect, it } from "vitest";
import { selectDayType } from "../../src/lib/scheduler/v2/select";
import { computeLoad, roundTo5 } from "../../src/lib/scheduler/v2/load";
import { roundToIncrement } from "../../src/lib/engine/progression";
import type { V2DayType, V2ExerciseRow, V2LastTopSet } from "../../src/lib/scheduler/v2/types";
import { V2_ROTATION, WEEKLY_MAX_SETS } from "../../src/lib/scheduler/v2/constants";
import { shouldAutoDeload } from "../../src/lib/scheduler/v2/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<V2ExerciseRow> = {}): V2ExerciseRow {
  return {
    exercise_id: 1,
    name: "Bench Press",
    muscle_primary: "chest",
    muscle_secondary: ["shoulders", "triceps"],
    equipment_type: "barbell",
    equipment_variants: null,
    is_unilateral: false,
    uses_bodyweight: false,
    seed_load_lb: 135,
    allowed_day_types: ["push_upper"],
    forbidden_day_types: [],
    suitable_slots: ["primary", "secondary"],
    user_preference_score: 0,
    load_increment_lb: 5,
    fatigue_score: 4,
    is_enabled: true,
    ...overrides,
  };
}

function makeLastTopSet(overrides: Partial<V2LastTopSet> = {}): V2LastTopSet {
  return {
    exercise_id: 1,
    last_load: 135,
    last_reps: 10,
    performed_at: "2026-04-14T00:00:00Z",
    ...overrides,
  };
}

// --- selectDayType -----------------------------------------------------------

// Arbitrary mid-week date (Wednesday) for gate tests
const WED = "2026-06-10"; // getUTCDay() = 3
// Monday -- before Wednesday gate
const MON = "2026-06-08"; // getUTCDay() = 1

// All muscles satisfied at their exact WEEKLY_MIN_SETS targets -- no override fires.
const satisfiedVolume = new Map([
  ["chest", 12], ["shoulders", 12], ["triceps", 8],
  ["back", 14],  ["biceps", 8],
  ["quads", 12], ["glutes", 12],
  ["hamstrings", 10], ["calves", 8],
  ["core", 6],
]);

// Build a volume map with all muscles satisfied EXCEPT the ones in `overrides`.
function volumeWith(overrides: Record<string, number>): Map<string, number> {
  return new Map([...satisfiedVolume, ...Object.entries(overrides)]);
}

describe("selectDayType -- pure rotation (no deficits)", () => {
  it("starts at push_upper when no history", () => {
    expect(selectDayType([], satisfiedVolume, WED)).toBe("push_upper");
  });

  it("advances to next in rotation after push_upper", () => {
    expect(selectDayType(["push_upper"], satisfiedVolume, WED)).toBe("squat_lower");
  });

  it("advances correctly through full rotation", () => {
    const results: V2DayType[] = [];
    let history: V2DayType[] = [];
    for (let i = 0; i < V2_ROTATION.length * 2; i++) {
      const next = selectDayType(history, satisfiedVolume, WED);
      results.push(next);
      history = [...history, next];
    }
    // Second cycle must equal first
    expect(results.slice(0, V2_ROTATION.length)).toEqual(results.slice(V2_ROTATION.length));
  });

  it("wraps around after full_body back to push_upper", () => {
    expect(
      selectDayType(
        ["push_upper", "squat_lower", "pull_upper", "hinge_lower", "full_body"],
        satisfiedVolume,
        WED
      )
    ).toBe("push_upper");
  });

  it("only considers the last entry, not all history", () => {
    expect(selectDayType(["push_upper", "squat_lower", "pull_upper"], satisfiedVolume, WED)).toBe("hinge_lower");
  });

  it("resets to push_upper if last entry is an unrecognised type", () => {
    expect(selectDayType(["unknown_type" as V2DayType], satisfiedVolume, WED)).toBe("push_upper");
  });
});

describe("selectDayType -- under-exposure override", () => {
  it("overrides to pull_upper on Wednesday when back is under minimum", () => {
    // back min=14, logged=4 => deficit 10; all other muscles satisfied.
    // Rotation from squat_lower would give pull_upper; override independently picks it too.
    // Use hinge_lower last so rotation would give full_body -- confirms override fires.
    const volume = volumeWith({ back: 4 });
    expect(selectDayType(["hinge_lower"], volume, WED)).toBe("pull_upper");
  });

  it("does not override on Monday when deficit fraction <= 50%", () => {
    // back min=14, logged=8 => deficit=6, fraction=0.43 (<50%)
    // Monday is before Wednesday gate, large-deficit exception does not apply.
    // Rotation from hinge_lower -> full_body (pure rotation).
    const volume = volumeWith({ back: 8 });
    expect(selectDayType(["hinge_lower"], volume, MON)).toBe("full_body");
  });

  it("fires override on Monday when any deficit > 50% (large-deficit exception)", () => {
    // back min=14, logged=0 => deficit=14, fraction=1.0 (>50%) => gate lifted.
    // pull_upper total deficit = back(14) + biceps(8) = 22.
    // All other muscles satisfied, so pull_upper is the only deficient day type.
    const volume = volumeWith({ back: 0, biceps: 0 });
    expect(selectDayType(["hinge_lower"], volume, MON)).toBe("pull_upper");
  });

  it("picks highest total-deficit day type when multiple are under minimum", () => {
    // push_upper deficit: chest(12-0=12) + shoulders(12-0=12) + triceps(8-0=8) = 32
    // pull_upper deficit: back(14-4=10) + biceps(8-0=8) = 18
    // push_upper wins
    const volume = volumeWith({ chest: 0, shoulders: 0, triceps: 0, back: 4, biceps: 0 });
    expect(selectDayType(["hinge_lower"], volume, WED)).toBe("push_upper");
  });

  it("uses alphabetical tiebreak when two day types have equal deficit", () => {
    // push_upper deficit: chest=12 => 12
    // pull_upper deficit: back=12 => 12 (tie)
    // alphabetical: pull_upper < push_upper => pull_upper wins tiebreak
    const volume = volumeWith({ chest: 0, back: 2 }); // back deficit=12, chest deficit=12
    expect(selectDayType(["hinge_lower"], volume, WED)).toBe("pull_upper");
  });

  it("returns to pure rotation once all muscles meet minimum", () => {
    // rotation from squat_lower -> pull_upper
    expect(selectDayType(["squat_lower"], satisfiedVolume, WED)).toBe("pull_upper");
  });
});

// --- selectExercisesForSession (forbidden_day_types) -------------------------

import { selectExercisesForSession } from "../../src/lib/scheduler/v2/select";

describe("selectExercisesForSession -- forbidden_day_types", () => {
  it("never selects an exercise whose forbidden_day_types includes the session day type", () => {
    // Build a minimal all-exercises pool: one exercise forbidden for push_upper,
    // one allowed. Both have identical scores/equipment so selection should
    // always pick the allowed one.
    const forbidden = makeExercise({
      exercise_id: 10,
      name: "Forbidden Push",
      allowed_day_types: ["push_upper"],
      forbidden_day_types: ["push_upper"],
      muscle_primary: "chest",
      equipment_type: "barbell",
      suitable_slots: ["primary"],
    });
    const allowed = makeExercise({
      exercise_id: 11,
      name: "Allowed Push",
      allowed_day_types: ["push_upper"],
      forbidden_day_types: [],
      muscle_primary: "chest",
      equipment_type: "barbell",
      suitable_slots: ["primary"],
    });

    const result = selectExercisesForSession({
      dayType: "push_upper",
      all: [forbidden, allowed],
      recentExerciseIds: new Set(),
      recentEquipmentByMuscle: new Map(),
      lastTopSets: new Map(),
      userId: "user-test",
      isoDate: WED,
    });

    const selectedIds = result.map((r) => r.exercise.exercise_id);
    expect(selectedIds).not.toContain(10); // forbidden exercise must never appear
  });
});

// --- selectExercisesForSession -- equipment rotation (PRD Section 3.4) -------

describe("selectExercisesForSession -- equipment rotation", () => {
  // Build a minimal pool: two chest primary exercises that differ only in
  // equipment_type (barbell vs dumbbell). Both allowed for push_upper.
  function makeChestExercise(id: number, equipment: string): V2ExerciseRow {
    return makeExercise({
      exercise_id: id,
      name: `Chest ${equipment}`,
      allowed_day_types: ["push_upper"],
      forbidden_day_types: [],
      muscle_primary: "chest",
      equipment_type: equipment,
      suitable_slots: ["primary"],
      seed_load_lb: 135,
    });
  }

  it("primary slot picks the non-recently-used equipment type", () => {
    const barbell  = makeChestExercise(20, "barbell");
    const dumbbell = makeChestExercise(21, "dumbbell");

    // Barbell was used for chest in the last 14 days
    const recentEquipmentByMuscle = new Map([
      ["chest", new Set(["barbell"])],
    ]);

    const result = selectExercisesForSession({
      dayType: "push_upper",
      all: [barbell, dumbbell],
      recentExerciseIds: new Set(),
      recentEquipmentByMuscle,
      lastTopSets: new Map(),
      userId: "user-test",
      isoDate: WED,
    });

    // The primary slot (result[0]) should prefer dumbbell over barbell.
    // Later slots may fall back to barbell (only 2 exercises in this minimal pool)
    // because soft-exclusion yields when no alternative exists.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].exercise.exercise_id).toBe(21); // dumbbell selected for primary
    expect(result[0].exercise.equipment_type).toBe("dumbbell");
  });

  it("falls back to using the recent equipment if no other option exists", () => {
    const barbell = makeChestExercise(22, "barbell");

    // Only barbell available for chest, but barbell was used recently
    const recentEquipmentByMuscle = new Map([
      ["chest", new Set(["barbell"])],
    ]);

    const result = selectExercisesForSession({
      dayType: "push_upper",
      all: [barbell],
      recentExerciseIds: new Set(),
      recentEquipmentByMuscle,
      lastTopSets: new Map(),
      userId: "user-test",
      isoDate: WED,
    });

    const selectedIds = result.map((r) => r.exercise.exercise_id);
    // Soft exclusion: barbell chest still selected because no alternative exists
    expect(selectedIds).toContain(22);
  });

  it("does not filter muscles not in recentEquipmentByMuscle", () => {
    const barbell  = makeChestExercise(23, "barbell");
    const dumbbell = makeChestExercise(24, "dumbbell");

    // No chest entry in the map at all
    const result = selectExercisesForSession({
      dayType: "push_upper",
      all: [barbell, dumbbell],
      recentExerciseIds: new Set(),
      recentEquipmentByMuscle: new Map(), // empty -- no restrictions
      lastTopSets: new Map(),
      userId: "user-test",
      isoDate: WED,
    });

    // Both are eligible; either can be selected (no rotation filter)
    expect(result.length).toBeGreaterThan(0);
  });
});

// --- roundTo5 ----------------------------------------------------------------

describe("roundTo5", () => {
  it("rounds to nearest 5", () => {
    expect(roundTo5(137)).toBe(135);
    expect(roundTo5(138)).toBe(140);
    expect(roundTo5(135)).toBe(135);
    expect(roundTo5(0)).toBe(0);
  });
});

// ─── computeLoad ──────────────────────────────────────────────────────────────

describe("computeLoad", () => {
  it("uses seed load when no prior history", () => {
    const result = computeLoad(makeExercise({ seed_load_lb: 135 }), "primary", undefined);
    expect(result.topSetLoad).toBe(135);
    expect(result.rationale_code).toBe("seed_only");
  });

  it("uses 0 when no seed and no prior history", () => {
    const result = computeLoad(makeExercise({ seed_load_lb: null }), "primary", undefined);
    expect(result.topSetLoad).toBe(0);
  });

  it("progresses load when last reps hit top of range", () => {
    // primary repsMax = 13; last_reps = 13 => progress
    const result = computeLoad(
      makeExercise({ load_increment_lb: 5 }),
      "primary",
      makeLastTopSet({ last_load: 135, last_reps: 13 })
    );
    expect(result.topSetLoad).toBe(140);
    expect(result.rationale_code).toBe("progression");
  });

  it("regresses load when last reps fell below min", () => {
    // primary repsMin = 12; last_reps = 8 => regress
    const result = computeLoad(
      makeExercise({ load_increment_lb: 5 }),
      "primary",
      makeLastTopSet({ last_load: 135, last_reps: 8 })
    );
    expect(result.topSetLoad).toBe(130);
    expect(result.rationale_code).toBe("regression");
  });

  it("holds load when last reps are in range", () => {
    // primary repsMin=12, repsMax=13; last_reps=12 => hold
    const result = computeLoad(
      makeExercise(),
      "primary",
      makeLastTopSet({ last_load: 135, last_reps: 12 })
    );
    expect(result.topSetLoad).toBe(135);
    expect(result.rationale_code).toBe("hold");
  });

  it("computes back-off load at 90% for primary (useBackOff=true)", () => {
    const result = computeLoad(makeExercise(), "primary", undefined);
    // Use roundToIncrement to match the implementation (load_increment_lb=5 default)
    expect(result.backOffLoad).toBe(roundToIncrement(result.topSetLoad * 0.9, 5));
  });

  it("uses straight sets for accessory (backOffLoad = topSetLoad)", () => {
    const result = computeLoad(makeExercise(), "accessory", undefined);
    expect(result.backOffLoad).toBe(result.topSetLoad);
  });

  it("never goes below zero", () => {
    const result = computeLoad(
      makeExercise({ load_increment_lb: 10, seed_load_lb: 0 }),
      "primary",
      makeLastTopSet({ last_load: 5, last_reps: 1 }) // below min -> regress
    );
    expect(result.topSetLoad).toBeGreaterThanOrEqual(0);
  });

  it("bodyweight: no prior history -> load=0, code=bodyweight_seed, bodyweight_mode=true", () => {
    const ex = makeExercise({ uses_bodyweight: true, seed_load_lb: 0 });
    const result = computeLoad(ex, "primary", undefined);
    expect(result.topSetLoad).toBe(0);
    expect(result.rationale_code).toBe("bodyweight_seed");
    expect(result.bodyweight_mode).toBe(true);
  });

  it("bodyweight: prior load=0, reps in range -> rep-only hold, code=bodyweight_reps", () => {
    const ex = makeExercise({ uses_bodyweight: true, seed_load_lb: 0 });
    const result = computeLoad(ex, "primary", makeLastTopSet({ last_load: 0, last_reps: 12 }));
    expect(result.topSetLoad).toBe(0);
    expect(result.rationale_code).toBe("bodyweight_reps");
    expect(result.bodyweight_mode).toBe(true);
  });

  it("bodyweight: prior load>0 (e.g. weight belt) -> normal progression applies, bodyweight_mode=false", () => {
    const ex = makeExercise({ uses_bodyweight: true, seed_load_lb: 0, load_increment_lb: 5 });
    const result = computeLoad(ex, "primary", makeLastTopSet({ last_load: 25, last_reps: 13 }));
    // last_reps 13 = repsMax for primary -> progress by 5
    expect(result.topSetLoad).toBe(30);
    expect(result.rationale_code).toBe("progression");
    expect(result.bodyweight_mode).toBe(false);
  });

  it("back-off uses roundToIncrement with 2.5 lb increment (e.g. OHP)", () => {
    const ex = makeExercise({ load_increment_lb: 2.5, seed_load_lb: 95 });
    const result = computeLoad(ex, "primary", undefined);
    expect(result.backOffLoad).toBe(roundToIncrement(result.topSetLoad * 0.9, 2.5));
  });
});

// --- shouldAutoDeload (PRD Section 4.5) ---

describe("shouldAutoDeload", () => {
  const emptyVolume = new Map<string, number>();

  it("returns false when volume is empty and session count is 0", () => {
    expect(shouldAutoDeload(emptyVolume, 0)).toBe(false);
  });

  it("returns false when all muscles are below their max and session count < 6", () => {
    const volume = new Map([
      ["chest",      WEEKLY_MAX_SETS.chest - 1],
      ["back",       WEEKLY_MAX_SETS.back  - 1],
      ["shoulders",  WEEKLY_MAX_SETS.shoulders - 1],
    ]);
    expect(shouldAutoDeload(volume, 5)).toBe(false);
  });

  it("fires condition A when any muscle exceeds its WEEKLY_MAX_SETS", () => {
    const volume = new Map([
      ["chest", WEEKLY_MAX_SETS.chest + 1],
    ]);
    expect(shouldAutoDeload(volume, 0)).toBe(true);
  });

  it("exactly at max does not fire (strictly greater required)", () => {
    const volume = new Map([["chest", WEEKLY_MAX_SETS.chest]]);
    expect(shouldAutoDeload(volume, 0)).toBe(false);
  });

  it("fires condition B when session count reaches 6", () => {
    expect(shouldAutoDeload(emptyVolume, 6)).toBe(true);
  });

  it("fires condition B when session count exceeds 6", () => {
    expect(shouldAutoDeload(emptyVolume, 7)).toBe(true);
  });

  it("does not fire when session count is exactly 5", () => {
    expect(shouldAutoDeload(emptyVolume, 5)).toBe(false);
  });

  it("ignores muscle keys not in WEEKLY_MAX_SETS (e.g. conditioning)", () => {
    const volume = new Map([["conditioning", 999]]);
    expect(shouldAutoDeload(volume, 0)).toBe(false);
  });
});
