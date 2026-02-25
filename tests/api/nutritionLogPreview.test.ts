import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const config = {
    SUPABASE_DB_URL: "postgres://example",
    SINGLE_USER_ID: "user-1",
    APP_PASSCODE_HASH: "hash",
    COOKIE_SIGNING_SECRET: "secret",
    ADMIN_SECRET: "admin",
    OPENAI_API_KEY: "",
  };

  const requireConfig = vi.fn();
  const callOpenAI = vi.fn();
  const buildMealParseSystemPrompt = vi.fn(() => "system");
  const buildMealParseUserPrompt = vi.fn(() => "user");

  return {
    config,
    requireConfig,
    callOpenAI,
    buildMealParseSystemPrompt,
    buildMealParseUserPrompt,
  };
});

vi.mock("@/lib/config", () => ({
  CONFIG: mocks.config,
  requireConfig: mocks.requireConfig,
}));

vi.mock("@/lib/ai/openai", () => ({
  callOpenAI: mocks.callOpenAI,
}));

vi.mock("@/lib/ai/prompts", () => ({
  buildMealParseSystemPrompt: mocks.buildMealParseSystemPrompt,
  buildMealParseUserPrompt: mocks.buildMealParseUserPrompt,
}));

import { POST } from "../../src/app/api/nutrition/log-preview/route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/nutrition/log-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/nutrition/log-preview", () => {
  beforeEach(() => {
    mocks.requireConfig.mockReset();
    mocks.callOpenAI.mockReset();
    mocks.buildMealParseSystemPrompt.mockReset();
    mocks.buildMealParseUserPrompt.mockReset();
    mocks.config.OPENAI_API_KEY = "";
  });

  it("returns 400 when raw input missing", async () => {
    const res = await POST(makeReq({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("missing_raw_input");
  });

  it("returns 422 when key missing", async () => {
    const res = await POST(makeReq({ raw_input: "chicken sandwich" }));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error).toBe("parse_failed_manual_required");
  });

  it("returns parsed items with full nutrient fields", async () => {
    mocks.config.OPENAI_API_KEY = "key";
    mocks.callOpenAI.mockResolvedValue(
      JSON.stringify({
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
            confidence: 0.88,
          },
        ],
      })
    );

    const res = await POST(makeReq({ raw_input: "cheese sandwich and milk" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.ai_model).toBe("gpt-4o-mini");
    expect(typeof json.parse_duration_ms).toBe("number");
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items).toHaveLength(1);

    const item = json.items[0];
    expect(item.item_name).toBe("Cheese sandwich");
    expect(item).toMatchObject({
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
      is_user_edited: false,
    });
  });
});
