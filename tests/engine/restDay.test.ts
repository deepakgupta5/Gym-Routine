import { describe, expect, it } from "vitest";
import { insertRestDay } from "../../src/lib/engine/schedule";

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

it("manual rest day shifts that date forward", () => {
  const sessions = [
    makeSession("tue", "2026-02-10", "Tue"),
    makeSession("wed", "2026-02-11", "Wed"),
    makeSession("thu", "2026-02-12", "Thu"),
  ];

  const result = insertRestDay(sessions, "2026-02-11");
  const updatedIds = new Map(result.updated.map((u) => [u.plan_session_id, u.date]));

  expect(updatedIds.get("wed")).toBe("2026-02-12");
  expect(updatedIds.get("thu")).toBe("2026-02-13");
});
