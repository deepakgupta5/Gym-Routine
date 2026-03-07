import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  return { query, release, connect, getDb };
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
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("shifts skipped exercise forward and deletes it from current session", async () => {
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
        rows: [{ plan_exercise_id: "pe-1", role: "secondary" }],
      }) // target
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // logs check
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { plan_session_id: "session-1", date: "2026-03-07", session_type: "Mon" },
          { plan_session_id: "session-2", date: "2026-03-08", session_type: "Tue" },
        ],
      }) // upcoming sessions
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            plan_exercise_id: "pe-1",
            plan_session_id: "session-1",
            exercise_id: 11,
            role: "secondary",
            targeted_primary_muscle: "Back",
            targeted_secondary_muscle: null,
            prescribed_sets: 3,
            prescribed_reps_min: 8,
            prescribed_reps_max: 12,
            prescribed_load: 100,
            backoff_percent: null,
            rest_seconds: 120,
            tempo: "2-0-2",
            previous_performance_id: null,
            prev_load: null,
            prev_reps: null,
            prev_performed_at: null,
            prev_estimated_1rm: null,
            next_target_load: null,
          },
          {
            plan_exercise_id: "pe-2",
            plan_session_id: "session-2",
            exercise_id: 22,
            role: "secondary",
            targeted_primary_muscle: "Back",
            targeted_secondary_muscle: null,
            prescribed_sets: 3,
            prescribed_reps_min: 8,
            prescribed_reps_max: 12,
            prescribed_load: 110,
            backoff_percent: null,
            rest_seconds: 120,
            tempo: "2-0-2",
            previous_performance_id: null,
            prev_load: null,
            prev_reps: null,
            prev_performed_at: null,
            prev_estimated_1rm: null,
            next_target_load: null,
          },
        ],
      }) // role rows chain
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update dst row with src data
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // delete first row
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
    expect(json.shifted).toBe(1);
    expect(json.dropped).toBe(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
