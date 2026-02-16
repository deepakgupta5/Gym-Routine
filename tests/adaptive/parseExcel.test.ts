import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBodyStatsXlsx, parseBodyStatsXlsxWithReport } from "../../src/lib/adaptive/parseExcel";

describe("parseBodyStatsXlsx", () => {
  it("parses tidy headers", () => {
    const data = [
      { Date: "2026-02-01", Weight_lb: 200, Upper_pct: 20, Lower_pct: 25 },
      { Date: "2026-02-15", Weight_lb: 199, Upper_pct: 19, Lower_pct: 25 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const rows = parseBodyStatsXlsx(buf);
    expect(rows.length).toBe(2);
    expect(rows[0].weight_lb).toBe(200);
  });

  it("parses wide format with date headers", () => {
    const rows = [
      {
        __EMPTY: "Weight",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 189.8,
        "23-Nov-24": 190,
      },
      {
        __EMPTY: "Body Fat %",
        __EMPTY_1: null,
        "9-Nov-24": 0.25,
        "23-Nov-24": 0.24,
      },
      {
        __EMPTY: "Left Arm",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 9,
        "23-Nov-24": 9.2,
      },
      {
        __EMPTY: "Right Arm",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 9,
        "23-Nov-24": 9.1,
      },
      {
        __EMPTY: "Trunk",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 80,
        "23-Nov-24": 81,
      },
      {
        __EMPTY: "Left Leg",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 30,
        "23-Nov-24": 30.5,
      },
      {
        __EMPTY: "Right Leg",
        __EMPTY_1: "Pounds",
        "9-Nov-24": 30,
        "23-Nov-24": 30.4,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const parsed = parseBodyStatsXlsx(buf);
    expect(parsed.length).toBe(2);
    expect(parsed[0].weight_lb).toBe(189.8);
    expect(parsed[0].bodyfat_pct).toBeCloseTo(25);
    expect(parsed[0].upper_pct).toBeGreaterThan(0);
    expect(parsed[0].lower_pct).toBeGreaterThan(0);
  });

  it("reports warnings for invalid rows and duplicate dates", () => {
    const data = [
      { Date: "2026-02-01", Weight_lb: 200 },
      { Date: "bad-date", Weight_lb: 199 },
      { Date: "2026-02-02", Weight_lb: "n/a" },
      { Date: "2026-02-01", Weight_lb: 201 },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const parsed = parseBodyStatsXlsxWithReport(buf);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].weight_lb).toBe(201);
    expect(parsed.warnings.invalid_date_rows).toBe(1);
    expect(parsed.warnings.invalid_weight_rows).toBe(1);
    expect(parsed.warnings.skipped_rows).toBe(2);
    expect(parsed.warnings.deduped_dates).toBe(1);
  });
});
