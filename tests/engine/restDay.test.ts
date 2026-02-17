import { expect, it } from "vitest";
import { insertRestDay } from "../../src/lib/engine/schedule";

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

it("does nothing when no session exists on chosen rest date", () => {
  const sessions = [
    makeSession("mon", "2026-02-09", "Mon"),
    makeSession("wed", "2026-02-11", "Wed"),
  ];

  const result = insertRestDay(sessions, "2026-02-10");
  expect(result.updated).toEqual([]);
  expect(result.dropped).toEqual([]);
});

it("does not move a performed session and cascades to next slot", () => {
  const sessions = [
    makeSession("restTarget", "2026-02-10", "Tue"),
    makeSession("done", "2026-02-11", "Wed", true, "2026-02-11T08:00:00Z"),
    makeSession("thu", "2026-02-12", "Thu"),
  ];

  const result = insertRestDay(sessions, "2026-02-10");
  const updatedById = new Map(result.updated.map((u) => [u.plan_session_id, u.date]));

  expect(updatedById.get("restTarget")).toBe("2026-02-12");
  expect(updatedById.get("thu")).toBe("2026-02-13");
  expect(updatedById.has("done")).toBe(false);
});

it("keeps dates valid when rest-day cascade crosses Sunday", () => {
  const sessions = [
    makeSession("fri", "2026-02-13", "Fri"),
    makeSession("satOptional", "2026-02-14", "Sat", false),
    makeSession("mon", "2026-02-16", "Mon"),
  ];

  const result = insertRestDay(sessions, "2026-02-13");
  const updatedById = new Map(result.updated.map((u) => [u.plan_session_id, u.date]));

  expect(result.dropped).toEqual([]);
  expect(updatedById.get("fri")).toBe("2026-02-14");

  const satMoved = updatedById.get("satOptional");
  expect(typeof satMoved).toBe("string");
  const satDay = new Date(`${satMoved}T00:00:00Z`).getUTCDay();
  expect(satDay).not.toBe(0);

  const dates = [
    updatedById.get("fri") || "2026-02-14",
    satMoved || "",
    updatedById.get("mon") || "2026-02-16",
  ];
  expect(new Set(dates).size).toBe(dates.length);
});
