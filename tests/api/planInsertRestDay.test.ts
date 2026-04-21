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

import { POST } from "../../src/app/api/plan/insert-rest-day/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/plan/insert-rest-day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/plan/insert-rest-day", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
  });

  it("returns 400 when rest_date is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("rest_date_required");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns ok: true with dry_run without touching DB", async () => {
    const res = await POST(makeRequest({ rest_date: "2026-04-22", dry_run: true }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("deletes the session and appends date to skipped_dates", async () => {
    mocks.query
      .mockResolvedValueOnce({})                                          // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "b1" }] }) // profile
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })                   // DELETE session
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })                   // UPDATE skipped_dates
      .mockResolvedValueOnce({});                                         // COMMIT

    const res = await POST(makeRequest({ rest_date: "2026-04-22" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.skip_recorded).toBe(true);

    // Verify the UPDATE set skipped_dates used the correct date
    const updateCall = mocks.query.mock.calls[3][0] as string;
    expect(updateCall).toContain("skipped_dates");
    expect(mocks.query.mock.calls[3][1][0]).toBe("2026-04-22");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and returns 500 on DB error", async () => {
    mocks.query
      .mockResolvedValueOnce({})                                          // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ block_id: "b1" }] }) // profile
      .mockRejectedValueOnce(new Error("constraint violation"));           // DELETE fails

    const res = await POST(makeRequest({ rest_date: "2026-04-22" }));
    expect(res.status).toBe(500);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
