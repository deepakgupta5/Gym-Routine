import { describe, expect, it } from "vitest";
import { selectDayType } from "../../src/lib/scheduler/v2/select";
import { computeLoad, roundTo5 } from "../../src/lib/scheduler/v2/load";
import type { V2DayType, V2ExerciseRow, V2LastTopSet } from "../../src/lib/scheduler/v2/types";
import { V2_ROTATION } from "../../src/lib/scheduler/v2/constants";

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

// ─── selectDayType ────────────────────────────────────────────────────────────

describe("selectDayType", () => {
  it("starts at push_upper when no history", () => {
    expect(selectDayType([])).toBe("push_upper");
  });

  it("advances to next in rotation after push_upper", () => {
    expect(selectDayType(["push_upper"])).toBe("squat_lower");
  });

  it("advances correctly through full rotation", () => {
    const results: V2DayType[] = [];
    let history: V2DayType[] = [];
    for (let i = 0; i < V2_ROTATION.length * 2; i++) {
      const next = selectDayType(history);
      results.push(next);
      history = [...history, next];
    }
    // After one full rotation, the second cycle must equal the first
    expect(results.slice(0, V2_ROTATION.length)).toEqual(results.slice(V2_ROTATION.length));
  });

  it("wraps around after full_body back to push_upper", () => {
    expect(selectDayType(["push_upper", "squat_lower", "pull_upper", "hinge_lower", "full_body"])).toBe("push_upper");
  });

  it("only considers the last entry, not all history", () => {
    // Even if history contains many entries, only the last one drives the next pick
    expect(selectDayType(["push_upper", "squat_lower", "pull_upper"])).toBe("hinge_lower");
  });

  it("resets to push_upper if last entry is an unrecognised type", () => {
    expect(selectDayType(["unknown_type" as V2DayType])).toBe("push_upper");
  });
});

// ─── roundTo5 ─────────────────────────────────────────────────────────────────

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
    expect(result.backOffLoad).toBe(roundTo5(result.topSetLoad * 0.9));
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
});
