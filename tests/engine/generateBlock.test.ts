import { describe, expect, it } from "vitest";
import { generateInitialBlock } from "../../src/lib/engine/generateBlock";

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

const input = {
  userProfile: { start_date: "2026-02-09", block_id: "block-1" },
  exercises,
  blockId: "block-1",
};

describe("generateInitialBlock", () => {
  it("is deterministic given identical inputs", () => {
    const plan1 = generateInitialBlock(input);
    const plan2 = generateInitialBlock(input);
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2));
  });

  it("enforces max 6 exercises per session", () => {
    const plan = generateInitialBlock(input);
    const counts = new Map<string, number>();
    for (const ex of plan.exercises) {
      counts.set(ex.session_key, (counts.get(ex.session_key) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it("has no duplicate exercises within a session", () => {
    const plan = generateInitialBlock(input);
    const bySession = new Map<string, Set<number>>();
    for (const ex of plan.exercises) {
      if (!bySession.has(ex.session_key)) {
        bySession.set(ex.session_key, new Set());
      }
      const set = bySession.get(ex.session_key)!;
      expect(set.has(ex.exercise_id)).toBe(false);
      set.add(ex.exercise_id);
    }
  });

  it("marks deload weeks correctly", () => {
    const plan = generateInitialBlock(input);
    for (const s of plan.sessions) {
      const shouldDeload = s.week_in_block === 4 || s.week_in_block === 8;
      expect(s.is_deload).toBe(shouldDeload);
    }
  });

  it("maps week dates correctly", () => {
    const plan = generateInitialBlock(input);
    const week1Mon = plan.sessions.find(
      (s) => s.week_in_block === 1 && s.session_type === "Mon"
    );
    const week2Mon = plan.sessions.find(
      (s) => s.week_in_block === 2 && s.session_type === "Mon"
    );
    expect(week1Mon?.date).toBe("2026-02-09");
    expect(week2Mon?.date).toBe("2026-02-16");
  });
});
