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
  const ensureNutritionProfile = vi.fn(async () => undefined);
  const syncTrainingDay = vi.fn(async () => undefined);
  const recomputeDailyRollup = vi.fn(async () => ({
    rollup_date: "2026-02-24",
    total_calories: 500,
    total_protein_g: 40,
    total_carbs_g: 45,
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

  const callOpenAI = vi.fn();
  const buildMealParseSystemPrompt = vi.fn(() => "system");
  const buildMealParseUserPrompt = vi.fn(() => "user");

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
    recomputeDailyRollup,
    callOpenAI,
    buildMealParseSystemPrompt,
    buildMealParseUserPrompt,
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

vi.mock("@/lib/nutrition/profile", () => ({
  ensureNutritionProfile: mocks.ensureNutritionProfile,
}));

vi.mock("@/lib/nutrition/syncTrainingDay", () => ({
  syncTrainingDay: mocks.syncTrainingDay,
}));

vi.mock("@/lib/nutrition/rollups", () => ({
  recomputeDailyRollup: mocks.recomputeDailyRollup,
}));

vi.mock("@/lib/ai/openai", () => ({
  callOpenAI: mocks.callOpenAI,
}));

vi.mock("@/lib/ai/prompts", () => ({
  buildMealParseSystemPrompt: mocks.buildMealParseSystemPrompt,
  buildMealParseUserPrompt: mocks.buildMealParseUserPrompt,
}));

import { POST } from "../../src/app/api/nutrition/log/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/nutrition/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function manualItem() {
  return {
    item_name: "Chicken salad",
    quantity: 1,
    unit: "serving",
    calories: 500,
    protein_g: 40,
    carbs_g: 45,
    fat_g: 20,
    fiber_g: 5,
    sugar_g: 3,
    sodium_mg: 500,
    iron_mg: 2,
    calcium_mg: 80,
    vitamin_d_mcg: 1,
    vitamin_c_mg: 1,
    potassium_mg: 200,
    source: "manual",
    confidence: null,
    is_user_edited: true,
    sort_order: 1,
  };
}

describe("POST /api/nutrition/log", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.requireConfig.mockReset();
    mocks.logError.mockReset();
    mocks.ensureNutritionProfile.mockReset();
    mocks.syncTrainingDay.mockReset();
    mocks.recomputeDailyRollup.mockReset();
    mocks.callOpenAI.mockReset();
    mocks.buildMealParseSystemPrompt.mockReset();
    mocks.buildMealParseUserPrompt.mockReset();

    mocks.config.OPENAI_API_KEY = "";

    mocks.recomputeDailyRollup.mockResolvedValue({
      rollup_date: "2026-02-24",
      total_calories: 500,
      total_protein_g: 40,
      total_carbs_g: 45,
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

  it("returns 400 for invalid date", async () => {
    const res = await POST(
      makeRequest({
        meal_type: "auto",
        save_mode: "manual",
        items: [manualItem()],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_date");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid manual item fields", async () => {
    const bad = { ...manualItem(), calories: -10 };

    const res = await POST(
      makeRequest({
        meal_date: "2026-02-24",
        meal_type: "auto",
        save_mode: "manual",
        items: [bad],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_item_fields");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 409 when direct ai_parse save is attempted", async () => {
    const res = await POST(
      makeRequest({
        meal_date: "2026-02-24",
        meal_type: "auto",
        save_mode: "ai_parse",
        raw_input: "had chicken sandwich and salad",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("review_required_use_preview");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("saves manual meal and recomputes rollup", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meal_log_id: "meal-1" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await POST(
      makeRequest({
        meal_date: "2026-02-24",
        meal_type: "auto",
        save_mode: "manual",
        notes: "post-workout",
        items: [manualItem()],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.meal_log_id).toBe("meal-1");
    expect(json.input_mode).toBe("manual");
    expect(json.ai_model).toBeNull();
    expect(json.items_saved).toBe(1);

    expect(mocks.ensureNutritionProfile).toHaveBeenCalledTimes(1);
    expect(mocks.syncTrainingDay).toHaveBeenCalledWith(expect.any(Object), "user-1", "2026-02-24");
    expect(mocks.recomputeDailyRollup).toHaveBeenCalledWith(expect.any(Object), "user-1", "2026-02-24");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });


  it("saves reviewed AI items after user edits", async () => {
    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meal_log_id: "meal-review-1" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await POST(
      makeRequest({
        meal_date: "2026-02-24",
        meal_type: "auto",
        save_mode: "ai_reviewed",
        raw_input: "cheese sandwich and milk",
        items: [
          {
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
            source: "ai",
            confidence: 0.88,
            is_user_edited: true,
            sort_order: 1,
          },
        ],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.input_mode).toBe("text");
    expect(json.ai_model).toBe("gpt-4o-mini");
    expect(json.ai_confidence).toBeCloseTo(0.88, 2);
    expect(json.items_saved).toBe(1);
  });

  it("still rejects direct ai_parse save even when OPENAI_API_KEY is set", async () => {
    mocks.config.OPENAI_API_KEY = "key";

    const res = await POST(
      makeRequest({
        meal_date: "2026-02-24",
        meal_type: "auto",
        save_mode: "ai_parse",
        raw_input: "2 egg omelette and toast",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("review_required_use_preview");
    expect(mocks.callOpenAI).not.toHaveBeenCalled();
  });
});
