import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const getDb = vi.fn(async () => ({ connect }));
  const parse = vi.fn();
  const computeAdaptive = vi.fn();
  return { query, release, connect, getDb, parse, computeAdaptive };
});

vi.mock("@/lib/db/pg", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/config", () => ({
  CONFIG: {
    SUPABASE_DB_URL: "postgres://example",
    SINGLE_USER_ID: "user-1",
    APP_PASSCODE_HASH: "hash",
    COOKIE_SIGNING_SECRET: "secret",
    ADMIN_SECRET: "admin",
  },
  requireConfig: vi.fn(),
}));

vi.mock("@/lib/adaptive/parseExcel", () => ({
  parseBodyStatsXlsxWithReport: mocks.parse,
}));

vi.mock("@/lib/adaptive/computeAdaptive", () => ({
  computeAdaptiveState: mocks.computeAdaptive,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { POST } from "../../src/app/api/body-stats/upload/route";

function makeUploadRequest(file: File) {
  const form = new FormData();
  form.append("file", file);

  return new Request("http://localhost/api/body-stats/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/body-stats/upload", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
    mocks.getDb.mockClear();
    mocks.parse.mockReset();
    mocks.computeAdaptive.mockReset();
  });

  it("returns 413 when file exceeds 5MB", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "Body Stats.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const res = await POST(makeUploadRequest(oversized));
    const json = await res.json();

    expect(res.status).toBe(413);
    expect(json.error).toBe("file_too_large");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns 200 for valid parsed rows", async () => {
    mocks.parse.mockReturnValue({
      rows: [
        { date: "2026-02-01", weight_lb: 200, bodyfat_pct: 22, upper_pct: 19, lower_pct: 24 },
        { date: "2026-02-02", weight_lb: 199, bodyfat_pct: 22, upper_pct: 19, lower_pct: 24 },
      ],
      warnings: { skipped_rows: 0, invalid_date_rows: 0, invalid_weight_rows: 0, deduped_dates: 0 },
    });

    mocks.computeAdaptive.mockReturnValue({
      adaptive_enabled: true,
      weight_gate_pass: true,
      bf_gate_pass: true,
      segment_gate_pass: false,
      weight_trend_class: "Flat",
      weight_trend_lbs_per_week: 0,
      segment_signal: null,
      segment_delta_pp: null,
      bias_delta: 0,
      neutral_streak: 1,
      flat_streak: 1,
      updated_bias_balance: 0,
      pending_cardio_rule: null,
    });

    mocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ bias_balance: 0, block_id: "block-1", adaptive_enabled: false }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ pending_reason: null }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { date: "2026-02-01", weight_lb: 200, bodyfat_pct: 22, upper_pct: 19, lower_pct: 24 },
          { date: "2026-02-02", weight_lb: 199, bodyfat_pct: 22, upper_pct: 19, lower_pct: 24 },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const file = new File([new Uint8Array([1, 2, 3])], "Body Stats.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const res = await POST(makeUploadRequest(file));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rows_upserted).toBe(2);
    expect(json.pending_at_next_regeneration).toBe(false);
  });
});
