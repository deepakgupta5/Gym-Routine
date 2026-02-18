import { describe, expect, it } from "vitest";
import { computeBlockProgressFromSessions } from "../../src/lib/engine/block";
import { normalizePrimaryLiftMap, rotatePrimaryLiftMap } from "../../src/lib/engine/rotation";

const makeSession = (
  id: string,
  week: number,
  date: string,
  session_type: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat",
  required: boolean,
  performed: boolean
) => ({
  plan_session_id: id,
  date,
  session_type,
  is_required: required,
  performed_at: performed ? date + "T10:00:00Z" : null,
  week_in_block: week,
});

describe("block progress", () => {
  it("requires Saturday to complete a week", () => {
    const sessions = [
      makeSession("m", 1, "2026-02-09", "Mon", true, true),
      makeSession("t", 1, "2026-02-10", "Tue", true, true),
      makeSession("w", 1, "2026-02-11", "Wed", true, true),
      makeSession("th", 1, "2026-02-12", "Thu", true, true),
      makeSession("f", 1, "2026-02-13", "Fri", true, true),
      makeSession("s", 1, "2026-02-14", "Sat", true, false),
    ];

    const progress = computeBlockProgressFromSessions(sessions as any);
    expect(progress.currentBlockWeek).toBe(1);
    expect(progress.blockComplete).toBe(false);
  });

  it("marks block complete when all required weeks are performed", () => {
    const sessions: any[] = [];
    let id = 1;
    for (let week = 1; week <= 8; week++) {
      sessions.push(makeSession(`m${id++}`, week, "2026-02-01", "Mon", true, true));
      sessions.push(makeSession(`t${id++}`, week, "2026-02-02", "Tue", true, true));
      sessions.push(makeSession(`w${id++}`, week, "2026-02-03", "Wed", true, true));
      sessions.push(makeSession(`th${id++}`, week, "2026-02-04", "Thu", true, true));
      sessions.push(makeSession(`f${id++}`, week, "2026-02-05", "Fri", true, true));
    }

    const progress = computeBlockProgressFromSessions(sessions as any);
    expect(progress.blockComplete).toBe(true);
    expect(progress.currentBlockWeek).toBe(8);
  });
});

describe("rotation", () => {
  it("rotates primary lift map to next catalog entries", () => {
    const base = normalizePrimaryLiftMap({});
    const rotated = rotatePrimaryLiftMap(base);
    expect(rotated.UPPER_PUSH).not.toBe(base.UPPER_PUSH);
    expect(rotated.UPPER_PULL).not.toBe(base.UPPER_PULL);
    expect(rotated.LOWER_SQUAT).not.toBe(base.LOWER_SQUAT);
    expect(rotated.LOWER_HINGE).not.toBe(base.LOWER_HINGE);
  });
});
