export type SetLogRow = {
  performed_at: string;
  load: number;
  reps: number;
  set_type: "top" | "backoff" | "straight" | "accessory";
  targeted_primary_muscle: string;
};

export type RollupResult = {
  total_sets: number;
  total_reps: number;
  total_tonnage: number;
  sets_by_muscle: Record<string, number>;
  tonnage_by_muscle: Record<string, number>;
  top_sets_by_muscle: Record<string, number>;
  top_sets_count: number;
};

export function computeRollupFromSets(rows: SetLogRow[]): RollupResult {
  const sets_by_muscle: Record<string, number> = {};
  const tonnage_by_muscle: Record<string, number> = {};
  const top_sets_by_muscle: Record<string, number> = {};

  let total_sets = 0;
  let total_reps = 0;
  let total_tonnage = 0;
  let top_sets_count = 0;

  for (const row of rows) {
    total_sets += 1;
    total_reps += row.reps;
    total_tonnage += row.load * row.reps;

    const key = row.targeted_primary_muscle || "Unknown";
    sets_by_muscle[key] = (sets_by_muscle[key] || 0) + 1;
    tonnage_by_muscle[key] = (tonnage_by_muscle[key] || 0) + row.load * row.reps;

    if (row.set_type === "top") {
      top_sets_count += 1;
      top_sets_by_muscle[key] = (top_sets_by_muscle[key] || 0) + 1;
    }
  }

  return {
    total_sets,
    total_reps,
    total_tonnage,
    sets_by_muscle,
    tonnage_by_muscle,
    top_sets_by_muscle,
    top_sets_count,
  };
}

// Date helpers consolidated in @/lib/dates — re-export for backward compat.
export { getWeekStartDateUtc, getWeekRangeUtc } from "@/lib/dates";
