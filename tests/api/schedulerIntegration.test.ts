import { beforeEach, describe, expect, it, vi } from "vitest";

const schedulerMocks = vi.hoisted(() => ({
  generateNextWorkout: vi.fn(),
}));

vi.mock("@/lib/scheduler", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/scheduler")>("../../src/lib/scheduler");
  return {
    ...actual,
    generateNextWorkout: schedulerMocks.generateNextWorkout,
  };
});

import {
  ensureWorkoutPlanForDate,
  incrementUnmetWorkForSkippedExercise,
} from "../../src/lib/scheduler/integration";

function makeClient() {
  return {
    query: vi.fn(),
  } as any;
}

describe("scheduler integration", () => {
  beforeEach(() => {
    schedulerMocks.generateNextWorkout.mockReset();
  });

  it("reuses the stored workout for a date instead of regenerating on each load", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          user_id: "user-1",
          start_date: "2026-04-01",
          block_id: "block-1",
          current_block_week: 1,
          progression_state: {},
          skipped_dates: [],
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ plan_session_id: "session-1", session_type: "push" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: "4" }] });

    const result = await ensureWorkoutPlanForDate(client, "user-1", "2026-04-03");

    expect(result).toBe("session-1");
    expect(schedulerMocks.generateNextWorkout).not.toHaveBeenCalled();
  });

  it("generates and stores a new workout when the day was skipped and no stored session exists", async () => {
    const client = makeClient();
    schedulerMocks.generateNextWorkout.mockReturnValue({
      emphasis: "push",
      legDominant: false,
      exercises: [
        { exerciseId: "9", role: "primary", estimatedMinutes: 15 },
        { exerciseId: "12", role: "secondary", estimatedMinutes: 12 },
        { exerciseId: "20", role: "accessory", estimatedMinutes: 8 },
        { exerciseId: "23", role: "accessory", estimatedMinutes: 8 },
        { exerciseId: "25", role: "core", estimatedMinutes: 5 },
      ],
      addCore: true,
      addCardio: true,
      cardioMinutes: 15,
      estimatedMinutes: 63,
    });

    const exerciseRows = [
      {
        exercise_id: 9,
        name: "Bench Press",
        movement_pattern: "horizontal_push",
        default_targeted_primary_muscle: "Chest",
        default_targeted_secondary_muscle: "Shoulders",
        equipment_type: "barbell",
        alt_1_exercise_id: 10,
        alt_2_exercise_id: 11,
      },
      {
        exercise_id: 12,
        name: "Chest Supported Row",
        movement_pattern: "horizontal_pull",
        default_targeted_primary_muscle: "Upper Back",
        default_targeted_secondary_muscle: "Lats",
        equipment_type: "machine",
        alt_1_exercise_id: 13,
        alt_2_exercise_id: 14,
      },
      {
        exercise_id: 20,
        name: "Pushdown",
        movement_pattern: "arms",
        default_targeted_primary_muscle: "Triceps",
        default_targeted_secondary_muscle: null,
        equipment_type: "cable",
        alt_1_exercise_id: 21,
        alt_2_exercise_id: null,
      },
      {
        exercise_id: 23,
        name: "Face Pull",
        movement_pattern: "back_accessory",
        default_targeted_primary_muscle: "Shoulders",
        default_targeted_secondary_muscle: "Upper Back",
        equipment_type: "cable",
        alt_1_exercise_id: null,
        alt_2_exercise_id: null,
      },
      {
        exercise_id: 25,
        name: "Cable Crunch",
        movement_pattern: "core",
        default_targeted_primary_muscle: "Core",
        default_targeted_secondary_muscle: null,
        equipment_type: "cable",
        alt_1_exercise_id: null,
        alt_2_exercise_id: null,
      },
    ];

    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          user_id: "user-1",
          start_date: "2026-04-01",
          block_id: "block-1",
          current_block_week: 1,
          progression_state: {},
          skipped_dates: ["2026-04-03"],
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })   // INSERT blocks (ensureSchedulerProfile)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })   // SELECT plan_sessions (date check - no existing)
      .mockResolvedValueOnce({ rows: exerciseRows })       // loadExerciseRows
      .mockResolvedValueOnce({ rows: [] })                 // loadCompletedWorkoutsForScheduler (plan_sessions)
      .mockResolvedValueOnce({ rows: [{ plan_session_id: "session-new" }] }) // INSERT plan_sessions
      .mockResolvedValueOnce({ rows: [] })                 // loadLatestPerformanceByExercise (top_set_history)
      .mockResolvedValue({ rows: [] });                    // INSERT plan_exercises x5 (catchall)

    const result = await ensureWorkoutPlanForDate(client, "user-1", "2026-04-03");

    expect(result).toBe("session-new");
    expect(schedulerMocks.generateNextWorkout).toHaveBeenCalledTimes(1);
  });

  it("increases unmet work when an exercise is skipped", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            exercise_id: 9,
            name: "Bench Press",
            movement_pattern: "horizontal_push",
            default_targeted_primary_muscle: "Chest",
            default_targeted_secondary_muscle: "Shoulders",
            equipment_type: "barbell",
            alt_1_exercise_id: 10,
            alt_2_exercise_id: 11,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          user_id: "user-1",
          start_date: "2026-04-01",
          block_id: "block-1",
          current_block_week: 1,
          progression_state: {
            unmetWorkByMuscle: {
              chest: 1,
            },
          },
          skipped_dates: [],
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await incrementUnmetWorkForSkippedExercise(client, "user-1", 9);

    const updateCall = client.query.mock.calls[3];
    const payload = JSON.parse(updateCall[1][0]);

    expect(payload.unmetWorkByMuscle.chest).toBe(2);
  });
});
