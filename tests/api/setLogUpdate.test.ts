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

import { type NextRequest } from "next/server";
import { DELETE, PUT } from "../../src/app/api/logs/set/[id]/route";

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/logs/set/set-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PUT /api/logs/set/:id", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
  });

  it("returns 400 for invalid values", async () => {
    const res = await PUT(makePutRequest({ load: -5 }), params("set-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_set_values");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 404 when set log is not found for user", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const res = await PUT(makePutRequest({ load: 155, reps: 8 }), params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("returns 200 for a valid update", async () => {
    const existing = {
      id: "set-1",
      user_id: "user-1",
      session_id: null,
      exercise_id: 1,
      movement_pattern: "Row",
      targeted_primary_muscle: "Back",
      targeted_secondary_muscle: null,
      is_primary: true,
      is_secondary: false,
      set_type: "backoff",
      set_index: 1,
      load: 150,
      reps: 8,
      rpe: null,
      notes: null,
      performed_at: null,
    };

    const updated = { ...existing, load: 160, reps: 7 };

    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [existing] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [updated] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ bias_balance: 0, block_id: null }] })
      .mockResolvedValueOnce({});

    const res = await PUT(makePutRequest({ load: 160, reps: 7 }), params("set-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.updated).toBe("set-1");
  });
});

describe("DELETE /api/logs/set/:id", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
  });

  it("returns 404 when set log is not found", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const res = await DELETE(new Request("http://localhost/api/logs/set/missing") as unknown as NextRequest, params("missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("returns 200 for a valid delete", async () => {
    const existing = {
      id: "set-1",
      user_id: "user-1",
      session_id: null,
      set_type: "backoff",
      performed_at: null,
    };

    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [existing] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: null }] })
      .mockResolvedValueOnce({});

    const res = await DELETE(new Request("http://localhost/api/logs/set/set-1") as unknown as NextRequest, params("set-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe("set-1");
  });
});
