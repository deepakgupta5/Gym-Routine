import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  const incrementUnmetWorkForSkippedExercise = vi.fn();
  const syncCompletedWorkoutAndState = vi.fn();
  return { query, release, connect, getDb, incrementUnmetWorkForSkippedExercise, syncCompletedWorkoutAndState };
});

vi.mock("@/lib/db/pg", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/config", () => ({
  CONFIG: {
    SUPABASE_DB_URL: "postgres://example",
    SINGLE_USER_ID: "user-1",
    APP_PASSCODE_HASH: "hash",
    COOKIE_SIGNING_SECRET: "secret",
    ADMIN_SECRET: "admin",
  },
  requireConfig: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/scheduler/integration", () => ({
  incrementUnmetWorkForSkippedExercise: mocks.incrementUnmetWorkForSkippedExercise,
  syncCompletedWorkoutAndState: mocks.syncCompletedWorkoutAndState,
}));

import { POST } from "../../src/app/api/plan/skip-exercise/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/plan/skip-exercise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plan/skip-exercise", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.incrementUnmetWorkForSkippedExercise.mockReset();
    mocks.syncCompletedWorkoutAndState.mockReset();
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("marks the exercise skipped and updates scheduler state", async () => {
    mocks.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] }) // profile
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            plan_session_id: "session-1",
            block_id: "block-1",
            date: "2026-03-07",
            performed_at: null,
          },
        ],
      }) // session
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ plan_exercise_id: "pe-1" }],
      }) // target
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // logs check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark skipped
      .mockResolvedValueOnce({}); // COMMIT

    const res = await POST(
      makeRequest({
        session_id: "session-1",
        exercise_id: 11,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.shifted).toBe(0);
    expect(json.dropped).toBe(0);
    expect(mocks.incrementUnmetWorkForSkippedExercise).toHaveBeenCalledWith(expect.anything(), "user-1", 11);
    expect(mocks.syncCompletedWorkoutAndState).toHaveBeenCalledWith(expect.anything(), "user-1", "session-1");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
