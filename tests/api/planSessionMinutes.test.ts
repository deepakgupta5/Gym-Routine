import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  const syncCompletedWorkoutAndState = vi.fn(async () => undefined);
  const recomputeWeeklyRollup = vi.fn(async () => undefined);
  return { query, release, connect, getDb, syncCompletedWorkoutAndState, recomputeWeeklyRollup };
});

vi.mock("@/lib/db/pg", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/config", () => ({
  CONFIG: { SINGLE_USER_ID: "user-1" },
  requireConfig: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/scheduler/integration", () => ({
  syncCompletedWorkoutAndState: mocks.syncCompletedWorkoutAndState,
}));
vi.mock("@/lib/db/logs", () => ({
  recomputeWeeklyRollup: mocks.recomputeWeeklyRollup,
}));
vi.mock("@/lib/engine/utils", () => ({
  getMondayUtc: vi.fn(() => new Date("2026-04-21T00:00:00Z")),
  toDateString: vi.fn(() => "2026-04-20"),
}));

import { PUT } from "../../src/app/api/plan/session-minutes/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/plan/session-minutes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/plan/session-minutes", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.syncCompletedWorkoutAndState.mockReset();
  });

  it("returns 400 when body is missing session_id", async () => {
    const res = await PUT(makeRequest({ cardio_minutes: 20 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 400 when cardio_minutes is not a non-negative integer", async () => {
    const res = await PUT(makeRequest({ session_id: "sess-1", cardio_minutes: -5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_minutes");
  });

  it("returns 404 when session is not found", async () => {
    mocks.query
      .mockResolvedValueOnce({})                     // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // UPDATE returns 0

    const res = await PUT(makeRequest({ session_id: "sess-1", cardio_minutes: 30 }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("session_not_found");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("updates cardio minutes and syncs state", async () => {
    mocks.query
      .mockResolvedValueOnce({})   // BEGIN
      .mockResolvedValueOnce({     // UPDATE plan_sessions
        rowCount: 1,
        rows: [{
          plan_session_id: "sess-1",
          cardio_minutes: 30,
          cardio_saved_at: "2026-04-21T09:00:00Z",
          date: "2026-04-21",
          performed_at: null,
        }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const res = await PUT(makeRequest({ session_id: "sess-1", cardio_minutes: 30 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.cardio_minutes).toBe(30);
    expect(mocks.syncCompletedWorkoutAndState).toHaveBeenCalledWith(
      expect.anything(), "user-1", "sess-1"
    );
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and releases client on unexpected DB error", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("db down"));

    const res = await PUT(makeRequest({ session_id: "sess-1", cardio_minutes: 0 }));
    expect(res.status).toBe(500);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
