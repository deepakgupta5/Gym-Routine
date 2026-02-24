import * as XLSX from "xlsx";

export type ParsedRow = {
  date: string;
  weight_lb?: number | null;
  bodyfat_pct?: number | null;
  upper_pct?: number | null;
  lower_pct?: number | null;
};

export type ParseWarnings = {
  skipped_rows: number;
  invalid_date_rows: number;
  invalid_weight_rows: number;
  deduped_dates: number;
};

export type ParseBodyStatsResult = {
  rows: ParsedRow[];
  warnings: ParseWarnings;
};

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseExcelDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function parseHeaderDate(header: string): string | null {
  if (!header) return null;
  const date = parseExcelDate(header);
  return date;
}

function isWideFormat(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return false;
  const first = rows[0];
  return Object.keys(first).some((k) => k === "__EMPTY" || k === "__EMPTY_1");
}

function makeWarnings(): ParseWarnings {
  return {
    skipped_rows: 0,
    invalid_date_rows: 0,
    invalid_weight_rows: 0,
    deduped_dates: 0,
  };
}

export function parseBodyStatsXlsxWithReport(buffer: ArrayBuffer): ParseBodyStatsResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const allRows: ParsedRow[] = [];
  const warnings = makeWarnings();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    if (raw.length === 0) continue;

    if (!isWideFormat(raw)) {
      for (const row of raw) {
        const mapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          mapped[normalizeHeader(key)] = value;
        }

        const date = parseExcelDate(mapped["date"] ?? mapped["day"] ?? mapped["timestamp"]);
        if (!date) {
          warnings.invalid_date_rows += 1;
          warnings.skipped_rows += 1;
          continue;
        }

        const weight = Number(mapped["weightlb"] ?? mapped["weight"] ?? mapped["weightlbs"]);
        if (!Number.isFinite(weight) || weight <= 0) {
          warnings.invalid_weight_rows += 1;
          warnings.skipped_rows += 1;
          continue;
        }

        const bodyfat = Number(mapped["bodyfatpct"] ?? mapped["bodyfat"]);
        const upper = Number(mapped["upperpct"] ?? mapped["upper"]);
        const lower = Number(mapped["lowerpct"] ?? mapped["lower"]);

        allRows.push({
          date,
          weight_lb: weight,
          bodyfat_pct: Number.isFinite(bodyfat) ? bodyfat : null,
          upper_pct: Number.isFinite(upper) ? upper : null,
          lower_pct: Number.isFinite(lower) ? lower : null,
        });
      }
      continue;
    }

    const dateHeaders = new Map<string, string>();
    for (const key of Object.keys(raw[0])) {
      if (key === "__EMPTY" || key === "__EMPTY_1") continue;
      const parsed = parseHeaderDate(key);
      if (parsed) dateHeaders.set(key, parsed);
    }

    const byDate: Record<string, Record<string, unknown>> = {};

    for (const row of raw) {
      const label = row["__EMPTY"] ? String(row["__EMPTY"]).trim() : "";
      const sub = row["__EMPTY_1"] ? String(row["__EMPTY_1"]).trim() : "";

      let metric: string | null = null;
      if (label.toLowerCase() === "weight") metric = "weight";
      else if (label.toLowerCase() === "body fat %") metric = "bodyfat_pct";
      else if (label.toLowerCase() === "left arm") metric = "left_arm";
      else if (label.toLowerCase() === "right arm") metric = "right_arm";
      else if (label.toLowerCase() === "trunk") metric = "trunk";
      else if (label.toLowerCase() === "left leg") metric = "left_leg";
      else if (label.toLowerCase() === "right leg") metric = "right_leg";
      else if (label.toLowerCase() === "body fat" && sub.toLowerCase() === "pounds") {
        metric = null;
      }

      if (!metric) continue;

      for (const [header, date] of dateHeaders.entries()) {
        const value = Number(row[header]);
        if (!Number.isFinite(value)) continue;
        if (!byDate[date]) byDate[date] = {};
        byDate[date][metric] = value;
      }
    }

    for (const [date, metrics] of Object.entries(byDate)) {
      const weight = Number(metrics.weight);
      let bodyfat = Number(metrics.bodyfat_pct);
      if (Number.isFinite(bodyfat) && bodyfat <= 1) {
        bodyfat *= 100;
      }

      const leftArm = Number(metrics.left_arm);
      const rightArm = Number(metrics.right_arm);
      const trunk = Number(metrics.trunk);
      const leftLeg = Number(metrics.left_leg);
      const rightLeg = Number(metrics.right_leg);

      let upperPct: number | null = null;
      let lowerPct: number | null = null;

      if (!Number.isFinite(weight) || weight <= 0) {
        warnings.invalid_weight_rows += 1;
        warnings.skipped_rows += 1;
        continue;
      }

      if (Number.isFinite(leftArm) && Number.isFinite(rightArm) && Number.isFinite(trunk)) {
        upperPct = ((leftArm + rightArm + trunk) / weight) * 100;
      }
      if (Number.isFinite(leftLeg) && Number.isFinite(rightLeg)) {
        lowerPct = ((leftLeg + rightLeg) / weight) * 100;
      }

      allRows.push({
        date,
        weight_lb: weight,
        bodyfat_pct: Number.isFinite(bodyfat) ? bodyfat : null,
        upper_pct: upperPct,
        lower_pct: lowerPct,
      });
    }
  }

  const deduped = new Map<string, ParsedRow>();
  for (const row of allRows) {
    if (deduped.has(row.date)) warnings.deduped_dates += 1;
    deduped.set(row.date, row);
  }

  return {
    rows: Array.from(deduped.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    warnings,
  };
}

export function parseBodyStatsXlsx(buffer: ArrayBuffer): ParsedRow[] {
  return parseBodyStatsXlsxWithReport(buffer).rows;
}
