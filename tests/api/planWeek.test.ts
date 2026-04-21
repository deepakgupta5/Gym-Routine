import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  return { query, release, connect, getDb };
});

vi.mock("@/lib/db/pg", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/config", () => ({
  CONFIG: { SINGLE_USER_ID: "user-1" },
  requireConfig: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/engine/exerciseImages", () => ({
  getExerciseImageUrl: vi.fn(() => null),
}));

import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/plan/week/route";

function makeRequest(weekStart?: string) {
  const url = weekStart
    ? `http://localhost/api/plan/week?weekStart=${weekStart}`
    : "http://localhost/api/plan/week";
  return new NextRequest(url);
}

describe("GET /api/plan/week", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
  });

  it("returns 400 for invalid weekStart", async () => {
    const res = await GET(makeRequest("not-a-date"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_weekStart");
  });

  it("returns 404 when profile is missing", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await GET(makeRequest("2026-04-21"));
    expect(res.status).toBe(404);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("returns empty sessions and exercises when none scheduled for week", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeRequest("2026-04-21"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.sessions).toEqual([]);
    expect(json.exercises).toEqual([]);
    expect(json.week_start).toBe("2026-04-21");
  });

  it("returns sessions with exercises; skipped_at filter enforced in query", async () => {
    const sessions = [{ plan_session_id: "sess-1", date: "2026-04-21", session_type: "push_upper" }];
    const exercises = [
      { plan_exercise_id: "pe-1", plan_session_id: "sess-1", exercise_id: 9, role: "primary",
        targeted_primary_muscle: "chest", targeted_secondary_muscle: null, name: "Bench Press",
        movement_pattern: "horizontal_push", equipment_type: "barbell" },
    ];

    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: sessions })
      .mockResolvedValueOnce({ rowCount: 1, rows: exercises });

    const res = await GET(makeRequest("2026-04-21"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.sessions).toHaveLength(1);
    expect(json.exercises).toHaveLength(1);

    // Verify the exercise query included skipped_at is null
    const exerciseQueryCall = mocks.query.mock.calls[2][0] as string;
    expect(exerciseQueryCall).toContain("skipped_at is null");
  });

  it("returns 500 and releases client on unexpected DB error", async () => {
    mocks.query.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(makeRequest("2026-04-21"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
