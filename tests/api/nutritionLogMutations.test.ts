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
  const recomputeDailyRollup = vi.fn(async () => ({
    rollup_date: "2026-02-24",
    total_calories: 600,
    total_protein_g: 45,
    total_carbs_g: 50,
    total_fat_g: 20,
    total_fiber_g: 5,
    total_sugar_g: 3,
    total_sodium_mg: 500,
    total_iron_mg: 2,
    total_calcium_mg: 80,
    total_vitamin_d_mcg: 1,
    total_vitamin_c_mg: 1,
    total_potassium_mg: 200,
    water_ml: 0,
    meal_count: 1,
  }));

  return {
    query,
    release,
    connect,
    getDb,
    config,
    requireConfig,
    logError,
    recomputeDailyRollup,
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

vi.mock("@/lib/nutrition/rollups", () => ({
  recomputeDailyRollup: mocks.recomputeDailyRollup,
}));

import { PUT, DELETE } from "../../src/app/api/nutrition/log/[id]/route";

function makePutRequest(body: unknown) {
  return new Request("http://localhost/api/nutrition/log/meal-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const validItem = {
  meal_item_id: "item-1",
  item_name: "Cheese sandwich",
  quantity: 1,
  unit: "serving",
  calories: 420,
  protein_g: 16,
  carbs_g: 42,
  fat_g: 18,
  fiber_g: 3,
  sugar_g: 4,
  sodium_mg: 650,
  iron_mg: 2,
  calcium_mg: 120,
  vitamin_d_mcg: 0,
  vitamin_c_mg: 0,
  potassium_mg: 180,
  source: "manual",
  confidence: null,
  is_user_edited: true,
  sort_order: 1,
};

describe("/api/nutrition/log/:id mutations", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.requireConfig.mockReset();
    mocks.logError.mockReset();
    mocks.recomputeDailyRollup.mockReset();
    mocks.recomputeDailyRollup.mockResolvedValue({
      rollup_date: "2026-02-24",
      total_calories: 600,
      total_protein_g: 45,
      total_carbs_g: 50,
      total_fat_g: 20,
      total_fiber_g: 5,
      total_sugar_g: 3,
      total_sodium_mg: 500,
      total_iron_mg: 2,
      total_calcium_mg: 80,
      total_vitamin_d_mcg: 1,
      total_vitamin_c_mg: 1,
      total_potassium_mg: 200,
      water_ml: 0,
      meal_count: 1,
    });
  });

  it("updates meal and returns rollup", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meal_log_id: "meal-1", meal_date: "2026-02-24" }] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPDATE meal_logs
      .mockResolvedValueOnce({}) // DELETE missing items
      .mockResolvedValueOnce({}) // UPDATE item
      .mockResolvedValueOnce({}); // COMMIT

    const res = await PUT(
      makePutRequest({ meal_type: "breakfast", notes: "edited", items: [validItem] }),
      routeCtx("meal-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.meal_log_id).toBe("meal-1");
    expect(mocks.recomputeDailyRollup).toHaveBeenCalledWith(expect.any(Object), "user-1", "2026-02-24");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for missing meal on update", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await PUT(
      makePutRequest({ meal_type: "breakfast", notes: "edited", items: [validItem] }),
      routeCtx("missing")
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("meal_log_not_found");
  });

  it("deletes meal and returns rollup", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meal_log_id: "meal-1", meal_date: "2026-02-24" }] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // DELETE meal_log
      .mockResolvedValueOnce({}); // COMMIT

    const res = await DELETE(new Request("http://localhost/api/nutrition/log/meal-1", { method: "DELETE" }), routeCtx("meal-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deleted_meal_log_id).toBe("meal-1");
    expect(mocks.recomputeDailyRollup).toHaveBeenCalledWith(expect.any(Object), "user-1", "2026-02-24");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
