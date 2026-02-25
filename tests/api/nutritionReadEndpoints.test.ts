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

import { GET as getWeek } from "../../src/app/api/nutrition/week/route";
import { GET as getHistory } from "../../src/app/api/nutrition/history/route";

function makeReq(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof getWeek>[0];
}

describe("nutrition week/history read APIs", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
  });

  it("returns sparse but stable week shape", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await getWeek(makeReq("http://localhost/api/nutrition/week?weekStart=2026-02-23"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.week_start).toBe("2026-02-23");
    expect(Array.isArray(json.days)).toBe(true);
    expect(json.days).toHaveLength(7);
    expect(json.days[0]).toMatchObject({
      date: expect.any(String),
      target_calories: expect.any(Number),
      total_calories: expect.any(Number),
      adherence_pct: expect.any(Number),
    });
  });

  it("returns history summary shape", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            date: "2026-02-24",
            meal_count: 2,
            total_calories: 1700,
            total_protein_g: 130,
            is_training_day: true,
            target_calories: 2200,
          },
        ],
      });

    const res = await getHistory(makeReq("http://localhost/api/nutrition/history?from=2026-02-01&to=2026-02-24&page=1&pageSize=30") as Parameters<typeof getHistory>[0]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total_days).toBe(1);
    expect(Array.isArray(json.days)).toBe(true);
    expect(json.days[0]).toMatchObject({
      date: "2026-02-24",
      meal_count: 2,
      total_calories: 1700,
      total_protein_g: 130,
      target_calories: 2200,
      adherence_pct: expect.any(Number),
    });
  });
});
