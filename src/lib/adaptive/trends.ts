import { linearRegressionSlope } from "@/lib/adaptive/regression";

export type TrendClass = "down" | "flat" | "up";

export function classifyWeightTrend(lbsPerWeek: number): TrendClass {
  if (lbsPerWeek <= -0.25) return "down";
  if (lbsPerWeek >= 0.25) return "up";
  return "flat";
}

export function computeWeightTrend(points: Array<{ date: string; value: number }>) {
  if (points.length < 2) {
    return { lbs_per_week: 0, trend_class: "flat" as TrendClass };
  }

  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t0 = new Date(sorted[0].date + "T00:00:00Z").getTime();
  const data = sorted.map((p) => ({
    x: (new Date(p.date + "T00:00:00Z").getTime() - t0) / 86400000,
    y: p.value,
  }));

  const slopePerDay = linearRegressionSlope(data);
  const lbsPerWeek = slopePerDay * 7;

  return { lbs_per_week: lbsPerWeek, trend_class: classifyWeightTrend(lbsPerWeek) };
}
