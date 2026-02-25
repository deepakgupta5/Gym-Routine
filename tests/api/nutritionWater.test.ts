import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));

  const config = {
    SUPABASE_DB_URL: "postgres://example",
    SINGLE_USER_ID: "user-1",
    APP_PASSCODE_HASH: "hash",
    COOKIE_SIGNING_SECRET: "secret",
    ADMIN_SECRET: "admin",
    OPENAI_API_KEY: "",
  };

  const requireConfig = vi.fn();
  const logError = vi.fn();

  return { query, release, connect, getDb, config, requireConfig, logError };
});

vi.mock("@/lib/db/pg", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/config", () => ({ CONFIG: mocks.config, requireConfig: mocks.requireConfig }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));

import { POST } from "../../src/app/api/nutrition/water/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/nutrition/water", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/nutrition/water", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
  });

  it("returns 400 for invalid water", async () => {
    const res = await POST(makeReq({ date: "2026-02-24", water_ml: -10 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_water_ml");
  });

  it("upserts water rollup", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ rollup_date: "2026-02-24", water_ml: 1800, meal_count: 2 }] })
      .mockResolvedValueOnce({});

    const res = await POST(makeReq({ date: "2026-02-24", water_ml: 1800 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.water_ml).toBe(1800);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
