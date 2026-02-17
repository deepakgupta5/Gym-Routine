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

vi.mock("@/lib/db/logs", () => ({
  getWeekStartFromTimestamp: vi.fn(() => "2026-02-16"),
  recomputeSessionPerformed: vi.fn(async () => undefined),
  recomputeWeeklyRollup: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/blockState", () => ({
  updateCurrentBlockWeek: vi.fn(async () => undefined),
}));

vi.mock("@/lib/engine/progression", () => ({
  estimate1RM: vi.fn(() => 100),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { POST } from "../../src/app/api/logs/set/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/logs/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/logs/set", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid field types", async () => {
    const res = await POST(
      makeRequest({
        exercise_id: 1,
        set_type: "top",
        set_index: 1,
        load: "200",
        reps: 5,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
  });

  it("returns 400 for out-of-range values", async () => {
    const res = await POST(
      makeRequest({
        exercise_id: 1,
        set_type: "top",
        set_index: 1,
        load: -10,
        reps: 5,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_set_values");
    expect(json.detail).toContain("load");
  });

  it("returns 200 for a valid set payload", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ bias_balance: 0, block_id: null }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            exercise_id: 1,
            movement_pattern: "Row",
            default_targeted_primary_muscle: "Back",
            default_targeted_secondary_muscle: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "set-1",
            performed_at: "2026-02-17T00:00:00.000Z",
            session_id: null,
            set_type: "backoff",
            exercise_id: 1,
            load: 155,
            reps: 8,
          },
        ],
      })
      .mockResolvedValueOnce({});

    const res = await POST(
      makeRequest({
        exercise_id: 1,
        set_type: "backoff",
        set_index: 1,
        load: 155,
        reps: 8,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.inserted).toBe(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
