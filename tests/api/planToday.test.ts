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
import { GET } from "../../src/app/api/plan/today/route";

function makeRequest(date?: string) {
  const url = date
    ? `http://localhost/api/plan/today?date=${date}`
    : "http://localhost/api/plan/today";
  return new NextRequest(url);
}

describe("GET /api/plan/today", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
  });

  it("returns 404 when profile is missing", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("profile_not_found");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("returns null session when no session exists for date", async () => {
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await GET(makeRequest("2026-04-21"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.session).toBeNull();
    expect(json.exercises).toEqual([]);
  });

  it("returns session with exercises; skipped_at filter enforced in query", async () => {
    const session = {
      plan_session_id: "sess-1",
      date: "2026-04-21",
      session_type: "push_upper",
      is_required: true,
      is_deload: false,
      cardio_minutes: 0,
      cardio_saved_at: null,
    };
    const exercises = [
      {
        plan_exercise_id: "pe-1",
        exercise_id: 9,
        role: "primary",
        targeted_primary_muscle: "chest",
        targeted_secondary_muscle: null,
        prescribed_sets: 3,
        name: "Bench Press",
        movement_pattern: "horizontal_push",
        equipment_type: "barbell",
      },
    ];

    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "block-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [session] })
      .mockResolvedValueOnce({ rowCount: 1, rows: exercises });

    const res = await GET(makeRequest("2026-04-21"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.session.plan_session_id).toBe("sess-1");
    expect(json.exercises).toHaveLength(1);
    expect(json.exercises[0].name).toBe("Bench Press");

    // Verify the exercise query includes the skipped_at filter
    const exerciseQueryCall = mocks.query.mock.calls[2][0] as string;
    expect(exerciseQueryCall).toContain("skipped_at is null");
  });

  it("returns 500 and releases client on unexpected DB error", async () => {
    mocks.query.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
