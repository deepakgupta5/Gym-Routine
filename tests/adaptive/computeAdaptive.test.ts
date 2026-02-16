import { describe, expect, it } from "vitest";
import { computeAdaptiveState } from "../../src/lib/adaptive/computeAdaptive";

it("applies bias only on flat/up and segment gate pass", () => {
  const rows = [
    { date: "2026-02-01", weight_lb: 200, upper_pct: 20, lower_pct: 25 },
    { date: "2026-02-15", weight_lb: 200, upper_pct: 19, lower_pct: 25 },
  ];

  const adaptive = computeAdaptiveState(rows as any, 0, {});
  expect(adaptive.weight_gate_pass).toBe(true);
  expect(adaptive.segment_gate_pass).toBe(true);
  expect(adaptive.weight_trend_class).toBe("flat");
  expect(adaptive.bias_delta).toBe(2);
});

it("ignores bias on downtrend", () => {
  const rows = [
    { date: "2026-02-01", weight_lb: 200, upper_pct: 20, lower_pct: 25 },
    { date: "2026-02-15", weight_lb: 195, upper_pct: 19, lower_pct: 24 },
  ];

  const adaptive = computeAdaptiveState(rows as any, 0, {});
  expect(adaptive.weight_trend_class).toBe("down");
  expect(adaptive.bias_delta).toBe(0);
});
