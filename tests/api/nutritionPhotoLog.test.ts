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
  const logError = vi.fn();
  const parsePhotoMeal = vi.fn();

  return {
    config,
    requireConfig,
    logError,
    parsePhotoMeal,
  };
});

vi.mock("@/lib/config", () => ({
  CONFIG: mocks.config,
  requireConfig: mocks.requireConfig,
}));

vi.mock("@/lib/logger", () => ({
  logError: mocks.logError,
}));

vi.mock("@/lib/nutrition/photoParse", () => ({
  parsePhotoMeal: mocks.parsePhotoMeal,
}));

import { POST } from "../../src/app/api/nutrition/log-photo/route";

function makeFormReq(formData: FormData) {
  return new Request("http://localhost/api/nutrition/log-photo", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/nutrition/log-photo", () => {
  beforeEach(() => {
    mocks.requireConfig.mockReset();
    mocks.logError.mockReset();
    mocks.parsePhotoMeal.mockReset();
    mocks.config.OPENAI_API_KEY = "";
  });

  it("returns 400 when photo is missing", async () => {
    const fd = new FormData();
    const res = await POST(makeFormReq(fd));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("photo_missing");
  });

  it("returns 503 when OPENAI key is missing", async () => {
    const fd = new FormData();
    fd.append("photo", new File([new Uint8Array([1, 2, 3])], "meal.jpg", { type: "image/jpeg" }));

    const res = await POST(makeFormReq(fd));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("openai_unavailable");
  });

  it("returns parsed photo items", async () => {
    mocks.config.OPENAI_API_KEY = "key";
    mocks.parsePhotoMeal.mockResolvedValue({
      model: "gpt-4o",
      confidence: 0.88,
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
    });

    const fd = new FormData();
    fd.append("photo", new File([new Uint8Array([1, 2, 3])], "meal.jpg", { type: "image/jpeg" }));
    fd.append("meal_date", "2026-02-24");
    fd.append("meal_type", "breakfast");

    const res = await POST(makeFormReq(fd));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.input_mode).toBe("photo");
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBe(1);
    expect(json.items[0].source).toBe("ai");
  });
});
