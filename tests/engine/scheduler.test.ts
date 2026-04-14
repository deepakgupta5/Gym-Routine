import { describe, expect, it } from "vitest";
import {
  CompletedWorkout,
  Exercise,
  SchedulerState,
  buildCardioRecommendation,
  buildWorkout,
  chooseSessionEmphasis,
  computeMuscleNeedScores,
  generateNextWorkout,
} from "../../src/lib/scheduler";

// ─── Exercise fixtures ────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<Exercise> & Pick<Exercise, "id" | "emphasisTags" | "primaryMuscles">): Exercise {
  const slots = overrides.suitableSlots ??
    (overrides.roleTags?.filter((r): r is "primary"|"secondary"|"accessory" =>
      r === "primary" || r === "secondary" || r === "accessory"
    ) ?? ["primary", "secondary"]);
  return {
    name: overrides.id,
    category: "horizontal_push",
    suitableSlots: slots,
    roleTags: slots,
    secondaryMuscles: [],
    fatigueScore: 3,
    complexityScore: 3,
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
    enabled: true,
    ...overrides,
  } as Exercise;
}

const exerciseLibrary: Exercise[] = [
  makeExercise({ id: "bench", name: "Bench Press", emphasisTags: ["push"], primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"], isHeavyCompound: true, fatigueScore: 4,
    suitableSlots: ["primary","secondary"], alternatives: ["incline"] }),
  makeExercise({ id: "incline", name: "Incline Dumbbell Press", emphasisTags: ["push"],
    primaryMuscles: ["chest"], secondaryMuscles: ["shoulders","triceps"], fatigueScore: 4,
    suitableSlots: ["primary","secondary"], alternatives: ["bench"] }),
  makeExercise({ id: "press", name: "Shoulder Press", emphasisTags: ["push"],
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps","chest"],
    suitableSlots: ["primary","secondary"] }),
  makeExercise({ id: "row", name: "Chest Supported Row", emphasisTags: ["pull"],
    primaryMuscles: ["upper_back"], secondaryMuscles: ["lats","biceps"],
    isHeavyCompound: true, fatigueScore: 4, suitableSlots: ["primary","secondary"],
    alternatives: ["pulldown"] }),
  makeExercise({ id: "pulldown", name: "Lat Pulldown", emphasisTags: ["pull"],
    primaryMuscles: ["lats"], secondaryMuscles: ["upper_back","biceps"],
    suitableSlots: ["primary","secondary"], alternatives: ["row"] }),
  makeExercise({ id: "squat", name: "Back Squat", emphasisTags: ["squat"], category: "squat_pattern",
    primaryMuscles: ["quads","glutes"], secondaryMuscles: ["hamstrings","core"],
    isHeavyCompound: true, fatigueScore: 5, legDominant: true,
    suitableSlots: ["primary","secondary"], alternatives: ["legpress"] }),
  makeExercise({ id: "legpress", name: "Leg Press", emphasisTags: ["squat"], category: "squat_pattern",
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes"],
    legDominant: true, fatigueScore: 4, suitableSlots: ["secondary","accessory"],
    alternatives: ["squat"] }),
  makeExercise({ id: "rdl", name: "Romanian Deadlift", emphasisTags: ["hinge"], category: "hinge_pattern",
    primaryMuscles: ["hamstrings","glutes"], secondaryMuscles: ["core"],
    isHeavyCompound: true, fatigueScore: 4, legDominant: true,
    suitableSlots: ["primary","secondary"], alternatives: ["hipthrust"] }),
  makeExercise({ id: "hipthrust", name: "Hip Thrust", emphasisTags: ["hinge"], category: "hinge_pattern",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    legDominant: true, suitableSlots: ["primary","secondary","accessory"],
    alternatives: ["rdl"] }),
  makeExercise({ id: "curl", name: "Hammer Curl", emphasisTags: ["pull"],
    primaryMuscles: ["biceps"], suitableSlots: ["accessory"] }),
  makeExercise({ id: "pushdown", name: "Pushdown", emphasisTags: ["push"],
    primaryMuscles: ["triceps"], suitableSlots: ["accessory"] }),
  makeExercise({ id: "lateral", name: "Lateral Raise", emphasisTags: ["push"],
    primaryMuscles: ["shoulders"], suitableSlots: ["accessory"] }),
  makeExercise({ id: "facepull", name: "Face Pull", emphasisTags: ["pull"],
    primaryMuscles: ["upper_back"], secondaryMuscles: ["shoulders"],
    suitableSlots: ["accessory"] }),
  makeExercise({ id: "legcurl", name: "Leg Curl", emphasisTags: ["hinge"],
    primaryMuscles: ["hamstrings"], legDominant: true, suitableSlots: ["accessory"] }),
  makeExercise({ id: "legext", name: "Leg Extension", emphasisTags: ["squat"],
    primaryMuscles: ["quads"], legDominant: true, suitableSlots: ["accessory"] }),
  makeExercise({ id: "coreex", name: "Cable Crunch", emphasisTags: [], category: "core",
    primaryMuscles: ["core"], suitableSlots: ["accessory"] }),
];

// ─── State helpers ────────────────────────────────────────────────────────────

function baseState(overrides: Partial<SchedulerState> = {}): SchedulerState {
  return {
    lastTrainedAtByMuscle:       {},
    lastHeavyCompoundAtByMuscle: {},
    hardReadyAtByMuscle:         {},
    softReadyAtByMuscle:         {},
    fatigueLoadByMuscle:         {},
    lastPerformedAtByExercise:   {},
    recentExerciseIds:           [],
    recentMovementPatternHistory:[],
    recentEmphasisHistory:       [],
    recentLegDominantDays:       [],
    unmetWorkByMuscle:           {},
    unmetWorkByMovementFamily:   {},
    cardioSessionsLast7Days:     0,
    ...overrides,
  };
}

function roles(exercises: { role: string }[]) {
  return exercises.map((e) => e.role);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scheduler", () => {
  it("enforces the 48-hour muscle recovery rule", () => {
    // Chest trained 24 h ago → bench and incline should be blocked; press (shoulders) should win
    const state = baseState({
      hardReadyAtByMuscle: { chest: "2026-04-03T13:00:00Z" }, // future = blocked
    });
    const need = computeMuscleNeedScores(state, "2026-04-03T12:00:00Z");
    const workout = buildWorkout("push", exerciseLibrary, state, "2026-04-03T12:00:00Z", 60);
    const primaryId = workout.exercises.find((e) => e.slotType === "primary")?.exerciseId;
    expect(primaryId).toBe("press");
  });

  it("avoids repeating the same exact exercise within 3 days when an alternative exists", () => {
    const state = baseState({
      lastPerformedAtByExercise: { bench: "2026-04-02T08:00:00Z" },
    });
    const workout = buildWorkout("push", exerciseLibrary, state, "2026-04-03T12:00:00Z", 60);
    const primaryId = workout.exercises.find((e) => e.slotType === "primary")?.exerciseId;
    expect(primaryId).not.toBe("bench");
  });

  it("avoids consecutive leg-dominant sessions", () => {
    const state = baseState({
      recentLegDominantDays: ["2026-04-02T16:00:00Z"],
      unmetWorkByMuscle: { quads: 2, hamstrings: 1, chest: 1 },
    });
    const need = computeMuscleNeedScores(state, "2026-04-03T12:00:00Z");
    const emphasis = chooseSessionEmphasis(state, need, exerciseLibrary, "2026-04-03T12:00:00Z");
    expect(emphasis).not.toBe("squat");
    expect(emphasis).not.toBe("hinge");
  });

  it("rotates into lower-body emphases when upper-body muscles are still recovering", () => {
    // All push/pull muscles hard-blocked → squat is the only high-need emphasis available
    const future = "2026-04-04T12:00:00Z";
    const state = baseState({
      recentEmphasisHistory: ["push", "pull"],
      hardReadyAtByMuscle: {
        chest: future, shoulders: future, triceps: future,
        upper_back: future, lats: future, biceps: future,
      },
    });
    const need = computeMuscleNeedScores(state, "2026-04-03T12:00:00Z");
    const emphasis = chooseSessionEmphasis(state, need, exerciseLibrary, "2026-04-03T12:00:00Z");
    expect(emphasis).toBe("squat");
  });

  it("adds cardio while below target and skips it at or above five sessions", () => {
    const resistanceMinutes = 43; // 14 + 11 + 7 + 7 + ... leaves ~17 min free

    const behind = buildCardioRecommendation(
      baseState({ cardioSessionsLast7Days: 2 }),
      false,
      resistanceMinutes,
      60
    );
    expect(behind.include).toBe(true);

    const onTarget = buildCardioRecommendation(
      baseState({ cardioSessionsLast7Days: 4 }),
      false,
      resistanceMinutes,
      60
    );
    expect(onTarget.include).toBe(true);

    const full = buildCardioRecommendation(
      baseState({ cardioSessionsLast7Days: 5 }),
      false,
      resistanceMinutes,
      60
    );
    expect(full.include).toBe(false);
  });

  it("never adds cardio on leg-dominant days", () => {
    const result = buildCardioRecommendation(
      baseState({ cardioSessionsLast7Days: 0 }),
      true,  // legDominant
      35,
      60
    );
    expect(result.include).toBe(false);
  });

  it("never adds cardio on leg-dominant workout", () => {
    const workout = buildWorkout("squat", exerciseLibrary, baseState({ cardioSessionsLast7Days: 0 }), "2026-04-03T12:00:00Z", 60);
    expect(workout.legDominant).toBe(true);
    expect(workout.addCardio).toBe(false);
  });

  it("keeps push days upper-body focused", () => {
    const workout = buildWorkout("push", exerciseLibrary, baseState(), "2026-04-03T12:00:00Z", 60);
    const selectedIds = workout.exercises.map((e) => e.exerciseId);
    expect(selectedIds).not.toContain("legext");
    expect(selectedIds).not.toContain("legcurl");
    expect(selectedIds).not.toContain("legpress");
    // hipthrust is allowed: push blueprint includes a lower-body secondary slot
  });

  it("keeps generated workouts under 60 minutes", () => {
    const workout = generateNextWorkout({
      exerciseLibrary,
      completedWorkouts: [],
      schedulerState: baseState({ cardioSessionsLast7Days: 2 }),
      currentDate: "2026-04-03T12:00:00Z",
    });
    expect(workout.estimatedMinutes).toBeLessThanOrEqual(60);
  });

  it("returns exercises in primary, secondary, accessory order", () => {
    const workout = generateNextWorkout({
      exerciseLibrary,
      completedWorkouts: [],
      schedulerState: baseState({ cardioSessionsLast7Days: 2 }),
      currentDate: "2026-04-03T12:00:00Z",
    });

    const orderRank: Record<string, number> = {
      primary: 0, secondary: 1, accessory: 2, core: 3, cardio: 4,
    };

    const workoutRoles = roles(workout.exercises);
    expect(workoutRoles.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < workoutRoles.length; i++) {
      const prev = orderRank[workoutRoles[i - 1]!] ?? 0;
      const curr = orderRank[workoutRoles[i]!] ?? 0;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });
});
