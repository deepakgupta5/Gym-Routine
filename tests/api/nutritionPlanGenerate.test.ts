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
  const callOpenAI = vi.fn();
  const buildMealPlanSystemPrompt = vi.fn(() => "system");

  return {
    query,
    release,
    connect,
    getDb,
    config,
    requireConfig,
    logError,
    callOpenAI,
    buildMealPlanSystemPrompt,
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

vi.mock("@/lib/ai/openai", () => ({
  callOpenAI: mocks.callOpenAI,
}));

vi.mock("@/lib/ai/prompts", () => ({
  buildMealPlanSystemPrompt: mocks.buildMealPlanSystemPrompt,
}));

import { POST } from "../../src/app/api/nutrition/plan/generate/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/nutrition/plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    plan_date: "2026-03-01",
    day_type: "auto",
    target_calories: 2200,
    target_protein_g: 160,
    constraints: {
      allowed_proteins: ["chicken", "shrimp", "eggs", "dairy", "plant"],
      forbidden_proteins: ["fish", "beef", "lamb", "pork", "goat"],
    },
    ...overrides,
  };
}

describe("POST /api/nutrition/plan/generate", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.requireConfig.mockReset();
    mocks.logError.mockReset();
    mocks.callOpenAI.mockReset();
    mocks.buildMealPlanSystemPrompt.mockReset();
    mocks.config.OPENAI_API_KEY = "";
  });

  it("returns 400 for invalid constraints", async () => {
    const res = await POST(makeRequest(validBody({ day_type: "bad" })));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_constraints");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 400 when allowed and forbidden proteins overlap", async () => {
    const res = await POST(
      makeRequest(
        validBody({
          constraints: {
            allowed_proteins: ["chicken", "fish"],
            forbidden_proteins: ["fish", "beef", "lamb", "pork", "goat"],
          },
        })
      )
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_constraints");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 503 when OPENAI key is missing", async () => {
    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("openai_unavailable");
    expect(mocks.callOpenAI).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 422 when AI plan contains forbidden proteins", async () => {
    mocks.config.OPENAI_API_KEY = "key";
    mocks.callOpenAI.mockResolvedValue(
      JSON.stringify({
        meals: [
          {
            meal_type: "lunch",
            description: "Grilled fish with salad",
            items: [{ name: "fish" }],
            total_calories: 600,
            total_protein_g: 40,
            total_carbs_g: 50,
            total_fat_g: 20,
          },
          {
            meal_type: "dinner",
            description: "Chicken bowl",
            items: [{ name: "chicken" }],
            total_calories: 700,
            total_protein_g: 50,
            total_carbs_g: 60,
            total_fat_g: 20,
          },
        ],
      })
    );

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error).toBe("forbidden_protein_in_plan");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
