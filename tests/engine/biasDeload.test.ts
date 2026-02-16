import { describe, expect, it } from "vitest";
import { generateInitialBlock } from "../../src/lib/engine/generateBlock";
import { SESSION_TEMPLATES, SETS_DELOAD, SETS_BASELINE } from "../../src/lib/engine/constants";

const makeExercise = (id: number) => ({
  exercise_id: id,
  name: `Exercise ${id}`,
  movement_pattern: "Test",
  default_targeted_primary_muscle: "Chest",
  default_targeted_secondary_muscle: null,
  equipment_type: "machine",
  load_increment: "5 lb",
  load_increment_lb: 5,
  load_semantic: "normal",
  alt_1_exercise_id: null,
  alt_2_exercise_id: null,
});

const exercises = Array.from({ length: 25 }, (_, i) => makeExercise(i + 1));

describe("bias + deload ordering", () => {
  it("applies deload first, then bias sets, clamped", () => {
    const plan = generateInitialBlock({
      userProfile: {
        start_date: "2026-02-09",
        block_id: "block-1",
        bias_balance: 4,
      },
      exercises,
      blockId: "block-1",
    });

    const week4Mon = SESSION_TEMPLATES.find((t) => t.day === "Mon");
    const week4Date = "2026-03-02"; // week 4 Monday for start_date 2026-02-09
    const key = `${week4Date}::${week4Mon?.day}`;

    const primary = plan.exercises.find(
      (e) => e.session_key === key && e.role === "primary"
    );
    const secondary = plan.exercises.find(
      (e) => e.session_key === key && e.role === "secondary"
    );

    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();

    // Deload baseline then bias (+2 for abs>=4) with clamp
    const expectedPrimary = Math.min(5, SETS_DELOAD.primary + 2);
    const expectedSecondary = Math.min(4, SETS_DELOAD.secondary + 2);

    expect(primary?.prescribed_sets).toBe(expectedPrimary);
    expect(secondary?.prescribed_sets).toBe(expectedSecondary);

    // Non-deload week for comparison
    const week1Date = "2026-02-09";
    const key1 = `${week1Date}::Mon`;
    const primary1 = plan.exercises.find(
      (e) => e.session_key === key1 && e.role === "primary"
    );
    const secondary1 = plan.exercises.find(
      (e) => e.session_key === key1 && e.role === "secondary"
    );

    const expectedPrimary1 = Math.min(5, SETS_BASELINE.primary + 2);
    const expectedSecondary1 = Math.min(4, SETS_BASELINE.secondary + 2);

    expect(primary1?.prescribed_sets).toBe(expectedPrimary1);
    expect(secondary1?.prescribed_sets).toBe(expectedSecondary1);
  });
});
