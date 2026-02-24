import { computeWeightTrend, TrendClass } from "@/lib/adaptive/trends";

export type BodyStatRow = {
  date: string;
  weight_lb?: number | string | null;
  bodyfat_pct?: number | string | null;
  upper_pct?: number | string | null;
  lower_pct?: number | string | null;
};

export type AdaptiveState = {
  weight_points_last_30d: Array<{ date: string; value: number }>;
  bf_points_last_30d: Array<{ date: string; value: number }>;
  segment_points_last_30d: Array<{ date: string; upper: number; lower: number }>;
  weight_gate_pass: boolean;
  bf_gate_pass: boolean;
  segment_gate_pass: boolean;
  weight_trend_lbs_per_week: number;
  weight_trend_class: TrendClass;
  segment_delta_pp: { upper: number; lower: number } | null;
  segment_signal: "upper_down" | "lower_down" | "both_down" | "none";
  bias_delta: number;
  updated_bias_balance: number;
  neutral_streak: number;
  flat_streak: number;
  pending_cardio_rule: { mode: "force_cardio"; sessions: number; minutes: number } | null;
  adaptive_enabled: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function spanDays(points: Array<{ date: string }>) {
  if (points.length < 2) return 0;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = new Date(sorted[0].date + "T00:00:00Z").getTime();
  const end = new Date(sorted[sorted.length - 1].date + "T00:00:00Z").getTime();
  return Math.round((end - start) / 86400000);
}

function lastNDays(rows: BodyStatRow[], days: number) {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const maxDate = new Date(sorted[sorted.length - 1].date + "T00:00:00Z").getTime();
  const start = maxDate - days * 86400000;
  return sorted.filter((r) => new Date(r.date + "T00:00:00Z").getTime() >= start);
}

function computeSegmentSignal(points: Array<{ date: string; upper: number; lower: number }>) {
  if (points.length < 2) {
    return { delta: null, signal: "none" as const };
  }
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const deltaUpper = last.upper - first.upper;
  const deltaLower = last.lower - first.lower;

  const upperDown = deltaUpper < 0;
  const lowerDown = deltaLower < 0;

  let signal: "upper_down" | "lower_down" | "both_down" | "none" = "none";
  if (upperDown && lowerDown) signal = "both_down";
  else if (upperDown) signal = "upper_down";
  else if (lowerDown) signal = "lower_down";

  return { delta: { upper: deltaUpper, lower: deltaLower }, signal };
}

export function computeAdaptiveState(
  rows: BodyStatRow[],
  biasBalance: number,
  biasState?: { neutral_streak?: number; flat_streak?: number }
): AdaptiveState {
  const window = lastNDays(rows, 30);

  const weightPoints = window
    .map((r) => ({ date: r.date, value: toNumber(r.weight_lb) }))
    .filter((r): r is { date: string; value: number } => r.value !== null);

  const bfPoints = window
    .map((r) => ({ date: r.date, value: toNumber(r.bodyfat_pct) }))
    .filter((r): r is { date: string; value: number } => r.value !== null);

  const segmentPoints = window
    .map((r) => ({
      date: r.date,
      upper: toNumber(r.upper_pct),
      lower: toNumber(r.lower_pct),
    }))
    .filter(
      (r): r is { date: string; upper: number; lower: number } =>
        r.upper !== null && r.lower !== null
    );

  const weightGatePass =
    weightPoints.length >= 2 && spanDays(weightPoints) >= 10;
  const bfGatePass = bfPoints.length >= 2 && spanDays(bfPoints) >= 10;
  const segmentGatePass =
    segmentPoints.length >= 2 && spanDays(segmentPoints) >= 10;

  const weightTrend = computeWeightTrend(weightPoints);
  const segment = computeSegmentSignal(segmentPoints);

  let biasDelta = 0;
  if (weightTrend.trend_class !== "down" && segmentGatePass) {
    if (segment.signal === "upper_down") biasDelta = 2;
    else if (segment.signal === "lower_down") biasDelta = -2;
    else biasDelta = 0;
  }

  let neutralStreak = biasState?.neutral_streak ?? 0;
  let flatStreak = biasState?.flat_streak ?? 0;

  if (weightTrend.trend_class === "flat") flatStreak += 1;
  else flatStreak = 0;

  let updatedBiasBalance = biasBalance;

  const biasSign = Math.sign(biasBalance);
  const deltaSign = Math.sign(biasDelta);

  const neutralOrReversal =
    biasDelta === 0 || (biasSign !== 0 && deltaSign !== 0 && biasSign !== deltaSign);

  if (neutralOrReversal) {
    neutralStreak += 1;
    if (neutralStreak >= 2) {
      updatedBiasBalance = clamp(biasBalance - biasSign, -4, 4);
      neutralStreak = 0;
    }
  } else {
    neutralStreak = 0;
    updatedBiasBalance = clamp(biasBalance + biasDelta, -4, 4);
  }

  const pendingCardioRule: AdaptiveState["pending_cardio_rule"] =
    weightTrend.trend_class === "up"
      ? { mode: "force_cardio", sessions: 3, minutes: 30 }
      : weightTrend.trend_class === "flat" && flatStreak >= 2
      ? { mode: "force_cardio", sessions: 4, minutes: 30 }
      : null;

  return {
    weight_points_last_30d: weightPoints,
    bf_points_last_30d: bfPoints,
    segment_points_last_30d: segmentPoints,
    weight_gate_pass: weightGatePass,
    bf_gate_pass: bfGatePass,
    segment_gate_pass: segmentGatePass,
    weight_trend_lbs_per_week: weightTrend.lbs_per_week,
    weight_trend_class: weightTrend.trend_class,
    segment_delta_pp: segment.delta,
    segment_signal: segment.signal,
    bias_delta: biasDelta,
    updated_bias_balance: updatedBiasBalance,
    neutral_streak: neutralStreak,
    flat_streak: flatStreak,
    pending_cardio_rule: pendingCardioRule,
    adaptive_enabled: weightGatePass,
  };
}
