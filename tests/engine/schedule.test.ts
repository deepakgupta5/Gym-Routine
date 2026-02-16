import { describe, expect, it } from "vitest";
import { shiftMissedSessions } from "../../src/lib/engine/schedule";

const makeSession = (
  id: string,
  date: string,
  session_type: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
  required = true
) => ({
  plan_session_id: id,
  date,
  session_type,
  is_required: required,
  performed_at: null,
  week_in_block: 1,
});

function applyUpdates(sessions: any[], updated: Array<{ plan_session_id: string; date: string }>) {
  const map = new Map(sessions.map((s) => [s.plan_session_id, { ...s }]));
  for (const u of updated) {
    const row = map.get(u.plan_session_id);
    if (row) row.date = u.date;
  }
  return Array.from(map.values());
}

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
    const d1 = new Date(tues[0] + "T00:00:00Z").getTime();
    const d2 = new Date(tues[1] + "T00:00:00Z").getTime();
    expect(Math.abs(d2 - d1)).toBeGreaterThan(24 * 60 * 60 * 1000);
  }
});

it("drops optional Saturday if shift would land on Sunday", () => {
  const sessions = [
    makeSession("fri", "2026-02-13", "Fri"),
    makeSession("sat", "2026-02-14", "Sat", false),
  ];

  const result = shiftMissedSessions(sessions, "2026-02-15");
  expect(result.dropped.includes("sat")).toBe(true);

  const final = applyUpdates(sessions, result.updated);
  const moved = final.find((s) => s.plan_session_id === "fri")!;
  expect(moved.date).toBe("2026-02-14");
});
