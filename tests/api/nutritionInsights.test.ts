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

  return {
    query,
    release,
    connect,
    getDb,
    config,
    requireConfig,
    logError,
  };
});

vi.mock("@/lib/db/pg", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/config", () => ({
  CONFIG: mocks.config,
  requireConfig: mocks.requireConfig,
}));

vi.mock("@/lib/logger", () => ({
  logError: mocks.logError,
}));

import { GET } from "../../src/app/api/nutrition/insights/route";

function makeReq(url: string) {
  return { nextUrl: new URL(url) } as any;
}

describe("GET /api/nutrition/insights", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.requireConfig.mockReset();
    mocks.logError.mockReset();
  });

  it("returns 400 for invalid date", async () => {
    const res = await GET(makeReq("http://localhost/api/nutrition/insights?date=2026-2-1"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_date");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns empty array when no rollup exists", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeReq("http://localhost/api/nutrition/insights?date=2026-02-24"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.date).toBe("2026-02-24");
    expect(json.insights).toEqual([]);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("upserts deterministic rule-based insights and returns rows", async () => {
    let callCount = 0;
    mocks.query.mockImplementation(async () => {
      callCount += 1;

      if (callCount === 1) {
        return {
          rowCount: 1,
          rows: [
            {
              total_protein_g: 90,
              total_fiber_g: 10,
              total_sugar_g: 50,
              total_iron_mg: 4,
              total_vitamin_d_mcg: 7,
              water_ml: 1500,
            },
          ],
        };
      }

      if (callCount === 2) {
        return { rowCount: 1, rows: [{ target_protein_g: 160 }] };
      }

      if (callCount === 9) {
        return {
          rowCount: 2,
          rows: [
            {
              insight_id: "i1",
              insight_type: "deficiency_alert",
              generated_at: "2026-02-24T10:00:00.000Z",
              recommendation_text: "Protein is low",
              is_dismissed: false,
              context_json: { metric: "protein_g" },
            },
            {
              insight_id: "i2",
              insight_type: "supplement",
              generated_at: "2026-02-24T10:01:00.000Z",
              recommendation_text: "Vitamin D is low",
              is_dismissed: false,
              context_json: { metric: "vitamin_d_mcg" },
            },
          ],
        };
      }

      return { rowCount: 1, rows: [] };
    });

    const res = await GET(makeReq("http://localhost/api/nutrition/insights?date=2026-02-24"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.date).toBe("2026-02-24");
    expect(Array.isArray(json.insights)).toBe(true);
    expect(json.insights.length).toBe(2);

    const upsertCalls = mocks.query.mock.calls.filter((c) => String(c[0]).includes("INSERT INTO nutrition_insights"));
    expect(upsertCalls.length).toBeGreaterThanOrEqual(5);
    expect(callCount).toBe(9);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
