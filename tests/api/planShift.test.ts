import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  const shiftMissedSessions = vi.fn();
  return { query, release, connect, getDb, shiftMissedSessions };
});

vi.mock("@/lib/db/pg", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/config", () => ({
  CONFIG: { SINGLE_USER_ID: "user-1" },
  requireConfig: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/engine/schedule", () => ({
  shiftMissedSessions: mocks.shiftMissedSessions,
}));

import { POST } from "../../src/app/api/plan/shift/route";

function makeRequest(body?: unknown) {
  return new Request("http://localhost/api/plan/shift", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

describe("POST /api/plan/shift", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.shiftMissedSessions.mockReset();
  });

  it("returns 404 when profile is missing", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("shifts and drops sessions, returns counts", async () => {
    mocks.query
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] }) // profile
      .mockResolvedValueOnce({    // sessions query
        rowCount: 2,
        rows: [
          { plan_session_id: "s1", date: "2026-04-19", session_type: "push_upper", is_required: true, performed_at: null, week_in_block: 1 },
          { plan_session_id: "s2", date: "2026-04-20", session_type: "pull_upper", is_required: true, performed_at: null, week_in_block: 1 },
        ],
      })
      .mockResolvedValueOnce({})  // UPDATE s1 date
      .mockResolvedValueOnce({})  // COMMIT
      .mockResolvedValue({});

    mocks.shiftMissedSessions.mockReturnValue({
      updated: [{ plan_session_id: "s1", date: "2026-04-22" }],
      dropped: ["s2"],
    });

    const res = await POST(makeRequest({ today: "2026-04-21" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(1);
    expect(json.dropped).toBe(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
