import * as XLSX from "xlsx";

export type ParsedRow = {
  date: string;
  weight_lb?: number | null;
  bodyfat_pct?: number | null;
  upper_pct?: number | null;
  lower_pct?: number | null;
  skeletal_mass?: number | null;
  bodyfat_lb?: number | null;
  bmi?: number | null;
  lean_body_mass_lb?: number | null;
  bmr_kcal?: number | null;
  smi_kg_m2?: number | null;
  left_arm_lb?: number | null;
  right_arm_lb?: number | null;
  trunk_lb?: number | null;
  left_leg_lb?: number | null;
  right_leg_lb?: number | null;
  left_arm_ratio?: number | null;
  right_arm_ratio?: number | null;
  trunk_ratio?: number | null;
  left_leg_ratio?: number | null;
  right_leg_ratio?: number | null;
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

function toFiniteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPercentFromUnknown(value: unknown): number | null {
  const n = toFiniteOrNull(value);
  if (n == null) return null;
  return n <= 1 ? n * 100 : n;
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

        const date = parseExcelDate(mapped.date ?? mapped.day ?? mapped.timestamp);
        if (!date) {
          warnings.invalid_date_rows += 1;
          warnings.skipped_rows += 1;
          continue;
        }

        const weight = toFiniteOrNull(mapped.weightlb ?? mapped.weight ?? mapped.weightlbs);
        if (weight == null || weight <= 0) {
          warnings.invalid_weight_rows += 1;
          warnings.skipped_rows += 1;
          continue;
        }

        const bodyfatPct = toPercentFromUnknown(mapped.bodyfatpct ?? mapped.bodyfat);
        const upperDirect = toFiniteOrNull(mapped.upperpct ?? mapped.upper);
        const lowerDirect = toFiniteOrNull(mapped.lowerpct ?? mapped.lower);

        const leftArmLb = toFiniteOrNull(
          mapped.leftarmlb ?? mapped.leftarmlbs ?? mapped.leftarmpounds ?? mapped.leftarm
        );
        const rightArmLb = toFiniteOrNull(
          mapped.rightarmlb ?? mapped.rightarmlbs ?? mapped.rightarmpounds ?? mapped.rightarm
        );
        const trunkLb = toFiniteOrNull(mapped.trunklb ?? mapped.trunklbs ?? mapped.trunkpounds ?? mapped.trunk);
        const leftLegLb = toFiniteOrNull(
          mapped.leftleglb ?? mapped.leftleglbs ?? mapped.leftlegpounds ?? mapped.leftleg
        );
        const rightLegLb = toFiniteOrNull(
          mapped.rightleglb ?? mapped.rightleglbs ?? mapped.rightlegpounds ?? mapped.rightleg
        );

        const upperDerived =
          leftArmLb != null && rightArmLb != null && trunkLb != null
            ? ((leftArmLb + rightArmLb + trunkLb) / weight) * 100
            : null;
        const lowerDerived =
          leftLegLb != null && rightLegLb != null
            ? ((leftLegLb + rightLegLb) / weight) * 100
            : null;

        allRows.push({
          date,
          weight_lb: weight,
          bodyfat_pct: bodyfatPct,
          upper_pct: upperDirect ?? upperDerived,
          lower_pct: lowerDirect ?? lowerDerived,
          skeletal_mass: toFiniteOrNull(mapped.skeletalmass ?? mapped.skeletalmassindex),
          bodyfat_lb: toFiniteOrNull(
            mapped.bodyfatlb ?? mapped.bodyfatlbs ?? mapped.bodyfatpounds ?? mapped.bodyfatmasslb
          ),
          bmi: toFiniteOrNull(mapped.bmi),
          lean_body_mass_lb: toFiniteOrNull(
            mapped.leanbodymasslb ?? mapped.leanbodymasslbs ?? mapped.leanbodymass
          ),
          bmr_kcal: toFiniteOrNull(mapped.basalmetabolicrate ?? mapped.bmr ?? mapped.bmrkcal),
          smi_kg_m2: toFiniteOrNull(mapped.smi ?? mapped.smikgm2),
          left_arm_lb: leftArmLb,
          right_arm_lb: rightArmLb,
          trunk_lb: trunkLb,
          left_leg_lb: leftLegLb,
          right_leg_lb: rightLegLb,
          left_arm_ratio: toFiniteOrNull(mapped.leftarmratio),
          right_arm_ratio: toFiniteOrNull(mapped.rightarmratio),
          trunk_ratio: toFiniteOrNull(mapped.trunkratio),
          left_leg_ratio: toFiniteOrNull(mapped.leftlegratio),
          right_leg_ratio: toFiniteOrNull(mapped.rightlegratio),
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
    let pendingRatioMetric:
      | "left_arm_ratio"
      | "right_arm_ratio"
      | "trunk_ratio"
      | "left_leg_ratio"
      | "right_leg_ratio"
      | null = null;

    for (const row of raw) {
      const label = row.__EMPTY ? String(row.__EMPTY).trim() : "";
      const sub = row.__EMPTY_1 ? String(row.__EMPTY_1).trim() : "";
      const labelNorm = label.toLowerCase().replace(/\s+/g, " ");
      const subNorm = sub.toLowerCase().replace(/\s+/g, " ");

      let metric: string | null = null;

      if (!labelNorm && !subNorm && pendingRatioMetric) {
        metric = pendingRatioMetric;
        pendingRatioMetric = null;
      } else {
        pendingRatioMetric = null;

        if (labelNorm === "weight") metric = "weight_lb";
        else if (labelNorm === "skeletal mass") metric = "skeletal_mass";
        else if (labelNorm === "body fat" && subNorm === "pounds") metric = "bodyfat_lb";
        else if (labelNorm === "bmi") metric = "bmi";
        else if (labelNorm === "body fat %") metric = "bodyfat_pct";
        else if (labelNorm === "lean body mass" && subNorm === "pounds") metric = "lean_body_mass_lb";
        else if (labelNorm === "basal metabolic rate") metric = "bmr_kcal";
        else if (labelNorm === "smi") metric = "smi_kg_m2";
        else if (labelNorm === "left arm" && subNorm === "pounds") {
          metric = "left_arm_lb";
          pendingRatioMetric = "left_arm_ratio";
        } else if (labelNorm === "right arm" && subNorm === "pounds") {
          metric = "right_arm_lb";
          pendingRatioMetric = "right_arm_ratio";
        } else if (labelNorm === "trunk" && subNorm === "pounds") {
          metric = "trunk_lb";
          pendingRatioMetric = "trunk_ratio";
        } else if (labelNorm === "left leg" && subNorm === "pounds") {
          metric = "left_leg_lb";
          pendingRatioMetric = "left_leg_ratio";
        } else if (labelNorm === "right leg" && subNorm === "pounds") {
          metric = "right_leg_lb";
          pendingRatioMetric = "right_leg_ratio";
        }
      }

      if (!metric) continue;

      for (const [header, date] of dateHeaders.entries()) {
        const value = toFiniteOrNull(row[header]);
        if (value == null) continue;
        if (!byDate[date]) byDate[date] = {};
        byDate[date][metric] = value;
      }
    }

    for (const [date, metrics] of Object.entries(byDate)) {
      const weight = toFiniteOrNull(metrics.weight_lb);
      const bodyfatPct = toPercentFromUnknown(metrics.bodyfat_pct);
      const leftArmLb = toFiniteOrNull(metrics.left_arm_lb);
      const rightArmLb = toFiniteOrNull(metrics.right_arm_lb);
      const trunkLb = toFiniteOrNull(metrics.trunk_lb);
      const leftLegLb = toFiniteOrNull(metrics.left_leg_lb);
      const rightLegLb = toFiniteOrNull(metrics.right_leg_lb);

      let upperPct: number | null = null;
      let lowerPct: number | null = null;

      if (weight == null || weight <= 0) {
        warnings.invalid_weight_rows += 1;
        warnings.skipped_rows += 1;
        continue;
      }

      if (leftArmLb != null && rightArmLb != null && trunkLb != null) {
        upperPct = ((leftArmLb + rightArmLb + trunkLb) / weight) * 100;
      }
      if (leftLegLb != null && rightLegLb != null) {
        lowerPct = ((leftLegLb + rightLegLb) / weight) * 100;
      }

      allRows.push({
        date,
        weight_lb: weight,
        bodyfat_pct: bodyfatPct,
        upper_pct: upperPct,
        lower_pct: lowerPct,
        skeletal_mass: toFiniteOrNull(metrics.skeletal_mass),
        bodyfat_lb: toFiniteOrNull(metrics.bodyfat_lb),
        bmi: toFiniteOrNull(metrics.bmi),
        lean_body_mass_lb: toFiniteOrNull(metrics.lean_body_mass_lb),
        bmr_kcal: toFiniteOrNull(metrics.bmr_kcal),
        smi_kg_m2: toFiniteOrNull(metrics.smi_kg_m2),
        left_arm_lb: leftArmLb,
        right_arm_lb: rightArmLb,
        trunk_lb: trunkLb,
        left_leg_lb: leftLegLb,
        right_leg_lb: rightLegLb,
        left_arm_ratio: toFiniteOrNull(metrics.left_arm_ratio),
        right_arm_ratio: toFiniteOrNull(metrics.right_arm_ratio),
        trunk_ratio: toFiniteOrNull(metrics.trunk_ratio),
        left_leg_ratio: toFiniteOrNull(metrics.left_leg_ratio),
        right_leg_ratio: toFiniteOrNull(metrics.right_leg_ratio),
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
