import { describe, expect, it } from "vitest";
import { computeRollupFromSets } from "../../src/lib/db/rollups";

describe("computeRollupFromSets", () => {
  it("aggregates sets, reps, tonnage, and top sets by muscle", () => {
    const rows = [
      {
        performed_at: "2026-02-09T10:00:00Z",
        load: 100,
        reps: 5,
        set_type: "top" as const,
        targeted_primary_muscle: "Quads",
      },
      {
        performed_at: "2026-02-09T10:05:00Z",
        load: 90,
        reps: 6,
        set_type: "backoff" as const,
        targeted_primary_muscle: "Quads",
      },
      {
        performed_at: "2026-02-09T10:10:00Z",
        load: 50,
        reps: 10,
        set_type: "straight" as const,
        targeted_primary_muscle: "Back",
      },
    ];

    const rollup = computeRollupFromSets(rows);
    expect(rollup.total_sets).toBe(3);
    expect(rollup.total_reps).toBe(21);
    expect(rollup.total_tonnage).toBe(100 * 5 + 90 * 6 + 50 * 10);
    expect(rollup.sets_by_muscle.Quads).toBe(2);
    expect(rollup.sets_by_muscle.Back).toBe(1);
    expect(rollup.top_sets_count).toBe(1);
    expect(rollup.top_sets_by_muscle.Quads).toBe(1);
  });
});
