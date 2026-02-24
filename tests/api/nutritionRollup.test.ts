import { describe, expect, it, vi } from "vitest";
import { recomputeDailyRollup } from "../../src/lib/nutrition/rollups";

describe("recomputeDailyRollup", () => {
  it("sums meal items and upserts daily rollup", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            total_calories: "1200",
            total_protein_g: "95",
            total_carbs_g: "110",
            total_fat_g: "35",
            total_fiber_g: "20",
            total_sugar_g: "15",
            total_sodium_mg: "900",
            total_iron_mg: "7",
            total_calcium_mg: "500",
            total_vitamin_d_mcg: "8",
            total_vitamin_c_mg: "55",
            total_potassium_mg: "1800",
            meal_count: "2",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            rollup_date: "2026-02-24",
            total_calories: 1200,
            total_protein_g: 95,
            total_carbs_g: 110,
            total_fat_g: 35,
            total_fiber_g: 20,
            total_sugar_g: 15,
            total_sodium_mg: 900,
            total_iron_mg: 7,
            total_calcium_mg: 500,
            total_vitamin_d_mcg: 8,
            total_vitamin_c_mg: 55,
            total_potassium_mg: 1800,
            water_ml: 0,
            meal_count: 2,
          },
        ],
      });

    const client = { query } as any;
    const result = await recomputeDailyRollup(client, "user-1", "2026-02-24");

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual(["user-1", "2026-02-24"]);
    expect(String(query.mock.calls[1][0])).toContain("INSERT INTO daily_nutrition_rollups");
    expect(query.mock.calls[1][1][0]).toBe("user-1");
    expect(query.mock.calls[1][1][1]).toBe("2026-02-24");
    expect(query.mock.calls[1][1][14]).toBe("2");

    expect(result.rollup_date).toBe("2026-02-24");
    expect(result.total_calories).toBe(1200);
    expect(result.total_protein_g).toBe(95);
    expect(result.meal_count).toBe(2);
  });

  it("returns zero totals when no meals exist", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            total_calories: "0",
            total_protein_g: "0",
            total_carbs_g: "0",
            total_fat_g: "0",
            total_fiber_g: "0",
            total_sugar_g: "0",
            total_sodium_mg: "0",
            total_iron_mg: "0",
            total_calcium_mg: "0",
            total_vitamin_d_mcg: "0",
            total_vitamin_c_mg: "0",
            total_potassium_mg: "0",
            meal_count: "0",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            rollup_date: "2026-02-25",
            total_calories: 0,
            total_protein_g: 0,
            total_carbs_g: 0,
            total_fat_g: 0,
            total_fiber_g: 0,
            total_sugar_g: 0,
            total_sodium_mg: 0,
            total_iron_mg: 0,
            total_calcium_mg: 0,
            total_vitamin_d_mcg: 0,
            total_vitamin_c_mg: 0,
            total_potassium_mg: 0,
            water_ml: 0,
            meal_count: 0,
          },
        ],
      });

    const client = { query } as any;
    const result = await recomputeDailyRollup(client, "user-1", "2026-02-25");

    expect(result.total_calories).toBe(0);
    expect(result.total_protein_g).toBe(0);
    expect(result.meal_count).toBe(0);
  });

  it("propagates database errors", async () => {
    const client = {
      query: vi.fn().mockRejectedValueOnce(new Error("db_down")),
    } as any;

    await expect(recomputeDailyRollup(client, "user-1", "2026-02-25")).rejects.toThrow("db_down");
  });
});
