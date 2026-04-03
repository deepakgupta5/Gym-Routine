import { describe, expect, it } from "vitest";
import {
  CompletedWorkout,
  Exercise,
  PlannedWorkoutExercise,
  SchedulerState,
  buildWorkout,
  choosePrimaryExercise,
  chooseSessionEmphasis,
  generateNextWorkout,
  shouldAddCardio,
} from "../../src/lib/scheduler";

const exerciseLibrary: Exercise[] = [
  {
    id: "bench",
    name: "Bench Press",
    emphasisTags: ["push"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    isHeavyCompound: true,
    legDominant: false,
    alternatives: ["incline"],
  },
  {
    id: "incline",
    name: "Incline Dumbbell Press",
    emphasisTags: ["push"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: ["bench"],
  },
  {
    id: "press",
    name: "Shoulder Press",
    emphasisTags: ["push"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "chest"],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
  {
    id: "row",
    name: "Chest Supported Row",
    emphasisTags: ["pull"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["lats", "biceps"],
    isHeavyCompound: true,
    legDominant: false,
    alternatives: ["pulldown"],
  },
  {
    id: "pulldown",
    name: "Lat Pulldown",
    emphasisTags: ["pull"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["upper_back", "biceps"],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: ["row"],
  },
  {
    id: "squat",
    name: "Back Squat",
    emphasisTags: ["squat"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    isHeavyCompound: true,
    legDominant: true,
    alternatives: ["legpress"],
  },
  {
    id: "legpress",
    name: "Leg Press",
    emphasisTags: ["squat"],
    roleTags: ["secondary", "accessory"],
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    isHeavyCompound: false,
    legDominant: true,
    alternatives: ["squat"],
  },
  {
    id: "rdl",
    name: "Romanian Deadlift",
    emphasisTags: ["hinge"],
    roleTags: ["primary", "secondary"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["core"],
    isHeavyCompound: true,
    legDominant: true,
    alternatives: ["hipthrust"],
  },
  {
    id: "hipthrust",
    name: "Hip Thrust",
    emphasisTags: ["hinge"],
    roleTags: ["primary", "secondary", "accessory"],
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    isHeavyCompound: false,
    legDominant: true,
    alternatives: ["rdl"],
  },
  {
    id: "curl",
    name: "Hammer Curl",
    emphasisTags: ["pull"],
    roleTags: ["accessory"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
  {
    id: "pushdown",
    name: "Pushdown",
    emphasisTags: ["push"],
    roleTags: ["accessory"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
  {
    id: "lateral",
    name: "Lateral Raise",
    emphasisTags: ["push"],
    roleTags: ["accessory"],
    primaryMuscles: ["shoulders"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
  {
    id: "facepull",
    name: "Face Pull",
    emphasisTags: ["pull"],
    roleTags: ["accessory"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["shoulders"],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
  {
    id: "legcurl",
    name: "Leg Curl",
    emphasisTags: ["hinge"],
    roleTags: ["accessory"],
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: true,
    alternatives: [],
  },
  {
    id: "legext",
    name: "Leg Extension",
    emphasisTags: ["squat"],
    roleTags: ["accessory"],
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: true,
    alternatives: [],
  },
  {
    id: "core",
    name: "Cable Crunch",
    emphasisTags: ["mixed"],
    roleTags: ["core"],
    primaryMuscles: ["core"],
    secondaryMuscles: [],
    isHeavyCompound: false,
    legDominant: false,
    alternatives: [],
  },
];

function baseState(overrides: Partial<SchedulerState> = {}): SchedulerState {
  return {
    lastTrainedAtByMuscle: {},
    lastHeavyCompoundAtByMuscle: {},
    lastPerformedAtByExercise: {},
    recentEmphasisHistory: [],
    recentLegDominantDays: [],
    unmetWorkByMuscle: {},
    cardioSessionsLast7Days: 0,
    ...overrides,
  };
}

function roles(exercises: PlannedWorkoutExercise[]) {
  return exercises.map((exercise) => exercise.role);
}

describe("scheduler", () => {
  it("enforces the 48-hour muscle recovery rule", () => {
    const result = choosePrimaryExercise(
      "2026-04-03T12:00:00Z",
      "push",
      exerciseLibrary,
      baseState({
        lastTrainedAtByMuscle: {
          chest: "2026-04-02T12:30:00Z",
        },
      })
    );

    expect(result?.id).toBe("press");
  });

  it("avoids repeating the same exact exercise within 3 days when an alternative exists", () => {
    const result = choosePrimaryExercise(
      "2026-04-03T12:00:00Z",
      "push",
      exerciseLibrary,
      baseState({
        lastPerformedAtByExercise: {
          bench: "2026-04-02T08:00:00Z",
        },
      })
    );

    expect(result?.id).toBe("incline");
  });

  it("avoids consecutive leg-dominant sessions", () => {
    const emphasis = chooseSessionEmphasis(
      "2026-04-03T12:00:00Z",
      exerciseLibrary,
      [],
      baseState({
        recentLegDominantDays: ["2026-04-02T16:00:00Z"],
        unmetWorkByMuscle: {
          quads: 2,
          hamstrings: 1,
          chest: 1,
        },
      })
    );

    expect(emphasis).not.toBe("squat");
    expect(emphasis).not.toBe("hinge");
  });

  it("rotates into lower-body emphases instead of alternating push and pull forever", () => {
    const emphasis = chooseSessionEmphasis(
      "2026-04-03T12:00:00Z",
      exerciseLibrary,
      [
        {
          completedAt: "2026-04-01T12:00:00Z",
          emphasis: "push",
          legDominant: false,
          completedExerciseIds: ["bench"],
          skippedExerciseIds: [],
          cardioCompleted: false,
        },
        {
          completedAt: "2026-04-02T12:00:00Z",
          emphasis: "pull",
          legDominant: false,
          completedExerciseIds: ["row"],
          skippedExerciseIds: [],
          cardioCompleted: false,
        },
      ],
      baseState({
        recentEmphasisHistory: ["push", "pull"],
        lastTrainedAtByMuscle: {
          chest: "2026-04-01T12:00:00Z",
          upper_back: "2026-04-02T12:00:00Z",
        },
      })
    );

    expect(emphasis).toBe("squat");
  });

  it("adds cardio while below target, allows it in range, and blocks it at five sessions", () => {
    const selectedExercises: PlannedWorkoutExercise[] = [
      { exerciseId: "press", role: "primary", estimatedMinutes: 15 },
      { exerciseId: "row", role: "secondary", estimatedMinutes: 12 },
      { exerciseId: "pushdown", role: "accessory", estimatedMinutes: 8 },
      { exerciseId: "facepull", role: "accessory", estimatedMinutes: 8 },
    ];

    expect(shouldAddCardio("2026-04-03T12:00:00Z", false, selectedExercises, [], baseState({ cardioSessionsLast7Days: 2 }))).toBe(true);
    expect(
      shouldAddCardio(
        "2026-04-03T12:00:00Z",
        false,
        selectedExercises,
        [
          {
            completedAt: "2026-04-01T08:00:00Z",
            emphasis: "push",
            legDominant: false,
            completedExerciseIds: ["bench"],
            skippedExerciseIds: [],
            cardioCompleted: true,
          },
        ],
        baseState({ cardioSessionsLast7Days: 4 })
      )
    ).toBe(true);
    expect(shouldAddCardio("2026-04-03T12:00:00Z", false, selectedExercises, [], baseState({ cardioSessionsLast7Days: 5 }))).toBe(false);
  });

  it("skips cardio on non-leg days when a cardio session happened in the last 48 hours and target is already met", () => {
    const selectedExercises: PlannedWorkoutExercise[] = [
      { exerciseId: "press", role: "primary", estimatedMinutes: 15 },
      { exerciseId: "row", role: "secondary", estimatedMinutes: 12 },
      { exerciseId: "pushdown", role: "accessory", estimatedMinutes: 8 },
      { exerciseId: "facepull", role: "accessory", estimatedMinutes: 8 },
      { exerciseId: "curl", role: "accessory", estimatedMinutes: 8 },
    ];

    const completedWorkouts: CompletedWorkout[] = [
      {
        completedAt: "2026-04-02T12:00:00Z",
        emphasis: "push",
        legDominant: false,
        completedExerciseIds: ["bench"],
        skippedExerciseIds: [],
        cardioCompleted: true,
      },
    ];

    expect(
      shouldAddCardio(
        "2026-04-03T12:00:00Z",
        false,
        selectedExercises,
        completedWorkouts,
        baseState({ cardioSessionsLast7Days: 3 })
      )
    ).toBe(false);
  });

  it("never adds cardio on leg-dominant days", () => {
    const workout = buildWorkout(
      "2026-04-03T12:00:00Z",
      "squat",
      exerciseLibrary,
      [],
      baseState({ cardioSessionsLast7Days: 0 })
    );

    expect(workout.legDominant).toBe(true);
    expect(workout.addCardio).toBe(false);
  });

  it("fills upper-body days with three accessories when enough valid options exist", () => {
    const workout = buildWorkout(
      "2026-04-03T12:00:00Z",
      "push",
      exerciseLibrary,
      [],
      baseState()
    );

    const accessoryCount = workout.exercises.filter((exercise) => exercise.role === "accessory").length;
    expect(accessoryCount).toBe(3);
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

  it("always returns exercises in primary, secondary, accessory, core order", () => {
    const workout = generateNextWorkout({
      exerciseLibrary,
      completedWorkouts: [],
      schedulerState: baseState({ cardioSessionsLast7Days: 2 }),
      currentDate: "2026-04-03T12:00:00Z",
    });

    const orderRank = {
      primary: 0,
      secondary: 1,
      accessory: 2,
      core: 3,
      cardio: 4,
    } as const;

    const workoutRoles = roles(workout.exercises);
    expect(workoutRoles.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < workoutRoles.length; index += 1) {
      expect(orderRank[workoutRoles[index - 1]]).toBeLessThanOrEqual(orderRank[workoutRoles[index]]);
    }
  });
});
