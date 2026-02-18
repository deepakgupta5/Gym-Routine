import { describe, expect, it } from "vitest";
import { shiftMissedSessions } from "../../src/lib/engine/schedule";

const makeSession = (
  id: string,
  date: string,
  session_type: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
  required = true,
  performed_at: string | null = null
) => ({
  plan_session_id: id,
  date,
  session_type,
  is_required: required,
  performed_at,
  week_in_block: 1,
});

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function applyUpdates(
  sessions: Array<ReturnType<typeof makeSession>>,
  updated: Array<{ plan_session_id: string; date: string }>
) {
  const map = new Map(sessions.map((s) => [s.plan_session_id, { ...s }]));
  for (const u of updated) {
    const row = map.get(u.plan_session_id);
    if (row) row.date = u.date;
  }
  return Array.from(map.values());
}

describe("shiftMissedSessions", () => {
  it("shifts missed sessions to today or later and avoids consecutive Lower Strength", () => {
    const sessions = [
      makeSession("tue1", "2026-02-10", "Tue"),
      makeSession("mon2", "2026-02-16", "Mon"),
      makeSession("tue2", "2026-02-17", "Tue"),
      makeSession("wed2", "2026-02-18", "Wed"),
    ];

    const result = shiftMissedSessions(sessions, "2026-02-16");
    const final = applyUpdates(sessions, result.updated);

    const moved = final.find((s) => s.plan_session_id === "tue1")!;
    expect(moved.date >= "2026-02-16").toBe(true);

    const tues = final
      .filter((s) => s.session_type === "Tue")
      .map((s) => s.date)
      .sort();

    if (tues.length > 1) {
      const d1 = new Date(`${tues[0]}T00:00:00Z`).getTime();
      const d2 = new Date(`${tues[1]}T00:00:00Z`).getTime();
      expect(Math.abs(d2 - d1)).toBeGreaterThan(24 * 60 * 60 * 1000);
    }
  });

  it("never drops Saturday and never places shifted sessions on Sunday", () => {
    const sessions = [
      makeSession("fri", "2026-02-13", "Fri"),
      makeSession("sat", "2026-02-14", "Sat", true),
      makeSession("mon", "2026-02-16", "Mon"),
    ];

    const result = shiftMissedSessions(sessions, "2026-02-15");
    expect(result.dropped).toEqual([]);

    const final = applyUpdates(sessions, result.updated);
    const movedFri = final.find((s) => s.plan_session_id === "fri")!;
    const movedSat = final.find((s) => s.plan_session_id === "sat")!;

    expect(movedFri.date >= "2026-02-16").toBe(true);
    expect(movedSat.date >= "2026-02-16").toBe(true);

    const hasSunday = final.some(
      (s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 0
    );
    expect(hasSunday).toBe(false);
  });

  it("keeps performed sessions immutable while cascading", () => {
    const sessions = [
      makeSession("missed", "2026-02-14", "Mon"),
      makeSession("done", "2026-02-16", "Tue", true, "2026-02-16T09:00:00Z"),
      makeSession("future", "2026-02-17", "Wed"),
    ];

    const result = shiftMissedSessions(sessions, "2026-02-16");
    const final = applyUpdates(sessions, result.updated);

    const done = final.find((s) => s.plan_session_id === "done")!;
    const missed = final.find((s) => s.plan_session_id === "missed")!;

    expect(done.date).toBe("2026-02-16");
    expect(missed.date > "2026-02-16").toBe(true);
  });

  it("handles Sunday boundary without dropping required Saturday", () => {
    const sessions = [
      makeSession("fri", "2026-02-13", "Fri"),
      makeSession("satRequired", "2026-02-14", "Sat", true, "2026-02-14T08:00:00Z"),
      makeSession("mon", "2026-02-16", "Mon"),
    ];

    const result = shiftMissedSessions(sessions, "2026-02-15");
    const final = applyUpdates(sessions, result.updated);

    expect(result.dropped).toEqual([]);
    const moved = final.find((s) => s.plan_session_id === "fri")!;
    expect(moved.date).toBe("2026-02-16");
    const mon = final.find((s) => s.plan_session_id === "mon")!;
    expect(mon.date).toBe("2026-02-17");
  });

  it("cascades through multiple future sessions with no date collisions", () => {
    const sessions = [
      makeSession("missed1", "2026-02-10", "Mon"),
      makeSession("missed2", "2026-02-11", "Wed"),
      makeSession("future1", "2026-02-16", "Thu"),
      makeSession("future2", "2026-02-17", "Fri"),
      makeSession("future3", "2026-02-18", "Mon"),
    ];

    const result = shiftMissedSessions(sessions, "2026-02-16");
    const final = applyUpdates(sessions, result.updated);

    const uniqueDates = new Set(final.map((s) => s.date));
    expect(uniqueDates.size).toBe(final.length);

    const movedIds = new Set(result.updated.map((u) => u.plan_session_id));
    expect(movedIds.has("missed1")).toBe(true);
    expect(movedIds.has("missed2")).toBe(true);
  });

  it("throws overflow when there is no available slot in guard range", () => {
    const today = "2026-02-16";
    const sessions = [makeSession("missed", "2026-02-10", "Tue")];

    for (let i = 0; i < 130; i++) {
      const date = addDays(today, i);
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      const type = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[day];
      sessions.push(makeSession(`performed-${i}`, date, type, true, `${date}T08:00:00Z`));
    }

    expect(() => shiftMissedSessions(sessions, today)).toThrow("schedule_shift_overflow");
  });
});
