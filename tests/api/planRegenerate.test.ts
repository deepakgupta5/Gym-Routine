import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/pg", () => ({
  getDb: vi.fn(async () => ({ connect: vi.fn() })),
}));
vi.mock("@/lib/config", () => ({
  CONFIG: { SINGLE_USER_ID: "user-1", GYM_V2_ENABLED: true },
  requireConfig: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

import { POST } from "../../src/app/api/plan/regenerate/route";

describe("POST /api/plan/regenerate", () => {
  it("returns 400 when v2 is enabled (prevents v1 block overwriting v2 sessions)", async () => {
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("regenerate_disabled_in_v2");
  });
});
