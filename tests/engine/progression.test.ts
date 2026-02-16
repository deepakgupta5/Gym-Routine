import { describe, expect, it } from "vitest";
import { computeNextTopSetLoad, roundToIncrement } from "../../src/lib/engine/progression";

describe("roundToIncrement", () => {
  it("rounds to nearest increment", () => {
    expect(roundToIncrement(102.4, 2.5)).toBe(102.5);
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
  });
});

describe("computeNextTopSetLoad", () => {
  it("increases when reps >= 6", () => {
    const next = computeNextTopSetLoad({
      last_prescribed_load: 100,
      last_performed_reps: 6,
      cap_pct: 0.03,
      increment: 2.5,
      load_semantic: "normal",
    });
    expect(next).toBe(102.5);
  });

  it("holds when reps 4-5", () => {
    const next = computeNextTopSetLoad({
      last_prescribed_load: 100,
      last_performed_reps: 5,
      cap_pct: 0.03,
      increment: 2.5,
    });
    expect(next).toBe(100);
  });

  it("decreases by one increment when reps < 4", () => {
    const next = computeNextTopSetLoad({
      last_prescribed_load: 100,
      last_performed_reps: 3,
      cap_pct: 0.03,
      increment: 5,
    });
    expect(next).toBe(95);
  });

  it("handles assistance semantics", () => {
    const down = computeNextTopSetLoad({
      last_prescribed_load: 70,
      last_performed_reps: 6,
      cap_pct: 0.03,
      increment: 5,
      load_semantic: "assistance",
    });
    const up = computeNextTopSetLoad({
      last_prescribed_load: 70,
      last_performed_reps: 3,
      cap_pct: 0.03,
      increment: 5,
      load_semantic: "assistance",
    });
    expect(down).toBe(65);
    expect(up).toBe(75);
  });
});
