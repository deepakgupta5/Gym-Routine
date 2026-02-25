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
  const ensureNutritionProfile = vi.fn();
  const syncTrainingDay = vi.fn();

  return {
    query,
    release,
    connect,
    getDb,
    config,
    requireConfig,
    logError,
    ensureNutritionProfile,
    syncTrainingDay,
  };
});

vi.mock("@/lib/db/pg", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/config", () => ({ CONFIG: mocks.config, requireConfig: mocks.requireConfig }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));
vi.mock("@/lib/nutrition/profile", () => ({ ensureNutritionProfile: mocks.ensureNutritionProfile }));
vi.mock("@/lib/nutrition/syncTrainingDay", () => ({ syncTrainingDay: mocks.syncTrainingDay }));

import { GET } from "../../src/app/api/nutrition/today/route";

function makeReq(url: string) {
  return { nextUrl: new URL(url) } as Parameters<typeof GET>[0];
}

describe("GET /api/nutrition/today", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.ensureNutritionProfile.mockReset();
    mocks.syncTrainingDay.mockReset();
  });

  it("returns water target/current/remaining fields", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            is_training_day: true,
            target_calories: 2200,
            target_protein_g: 160,
            target_carbs_g: 200,
            target_fat_g: 70,
            target_fiber_g: 30,
            target_sugar_g_max: 45,
            target_sodium_mg_max: 2300,
            target_iron_mg: 8,
            target_vitamin_d_mcg: 15,
            target_water_ml: 3000,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            total_calories: 1500,
            total_protein_g: 120,
            total_carbs_g: 100,
            total_fat_g: 50,
            total_fiber_g: 20,
            total_sugar_g: 25,
            total_sodium_mg: 1400,
            total_iron_mg: 5,
            total_vitamin_d_mcg: 8,
            water_ml: 1200,
            meal_count: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeReq("http://localhost/api/nutrition/today?date=2026-02-25"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goals.target_water_ml).toBe(3000);
    expect(json.totals.water_ml).toBe(1200);
    expect(json.deltas.water_remaining_ml).toBe(1800);
  });

  it("returns sparse fallback water fields when goals/rollup are missing", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeReq("http://localhost/api/nutrition/today?date=2026-02-25"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goals.target_water_ml).toBe(3000);
    expect(json.totals.water_ml).toBe(0);
    expect(json.deltas.water_remaining_ml).toBe(3000);
  });
});
