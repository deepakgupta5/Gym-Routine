import { describe, expect, it } from "vitest";
import { computeWeightTrend, classifyWeightTrend } from "../../src/lib/adaptive/trends";

describe("weight trend", () => {
  it("classifies weight trend correctly", () => {
    expect(classifyWeightTrend(-0.5)).toBe("down");
    expect(classifyWeightTrend(0.0)).toBe("flat");
    expect(classifyWeightTrend(0.5)).toBe("up");
  });

  it("computes regression slope with irregular spacing", () => {
    const points = [
      { date: "2026-02-01", value: 200 },
      { date: "2026-02-05", value: 199 },
      { date: "2026-02-12", value: 198 },
    ];

    const trend = computeWeightTrend(points);
    expect(trend.lbs_per_week).toBeLessThan(0);
    expect(trend.trend_class).toBe("down");
  });
});
