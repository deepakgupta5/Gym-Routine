// Integration schema tests -- require a real Postgres DB with all migrations applied.
// Run via: npm run test:integration
// CI: .github/workflows/ci.yml job integration_tests (postgres:16 service, bootstrap + migrations)

import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL });

afterAll(() => pool.end());

// -- Table column existence --

describe("exercises table", () => {
  it("has all required columns including suitable_slots array", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'exercises'
    `);
    const cols = new Map(rows.map((r) => [r.column_name, r.data_type]));
    expect(cols.has("exercise_id")).toBe(true);
    expect(cols.has("name")).toBe(true);
    expect(cols.has("muscle_primary")).toBe(true);
    expect(cols.has("suitable_slots")).toBe(true);
    expect(cols.has("user_preference_score")).toBe(true);
    expect(cols.has("load_increment_lb")).toBe(true);
    expect(cols.has("uses_bodyweight")).toBe(true);
    // suitable_slots must be ARRAY (text[]), not scalar text
    expect(cols.get("suitable_slots")).toBe("ARRAY");
  });
});

describe("set_logs table", () => {
  it("has is_warmup column (migration 0034)", async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'set_logs'
    `);
    const cols = new Set(rows.map((r) => r.column_name));
    expect(cols.has("is_warmup")).toBe(true);
    expect(cols.has("exercise_id")).toBe(true);
    expect(cols.has("session_id")).toBe(true);
    expect(cols.has("set_index")).toBe(true);
    expect(cols.has("set_type")).toBe(true);
    // INC-016: set_logs uses exercise_id directly, NOT plan_exercise_id
    expect(cols.has("plan_exercise_id")).toBe(false);
  });
});

describe("plan_sessions table", () => {
  it("has session_blueprint_version column", async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plan_sessions'
        AND column_name = 'session_blueprint_version'
    `);
    expect(rows).toHaveLength(1);
  });
});

describe("plan_exercises table", () => {
  it("uses 'id' as PK, not 'plan_exercise_id'", async () => {
    const { rows } = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plan_exercises'
        AND column_name IN ('id', 'plan_exercise_id')
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).not.toContain("plan_exercise_id");
  });
});

// -- Enum type safety --

describe("session_type_enum", () => {
  it("has all 7 day values and supports ::text cast (S1 regression)", async () => {
    // S1: scheduler used `session_type = any($1::text[])` which fails without ::text cast.
    const { rows } = await pool.query<{ val: string }>(`
      SELECT unnest(enum_range(NULL::session_type_enum))::text AS val
    `);
    const vals = rows.map((r) => r.val);
    expect(vals.sort()).toEqual(["Fri", "Mon", "Sat", "Sun", "Thu", "Tue", "Wed"]);
  });

  it("::text cast works in array comparison (pattern used in scheduler queries)", async () => {
    const { rows } = await pool.query<{ ok: boolean }>(`
      SELECT 'Mon'::session_type_enum::text = any(ARRAY['Mon','Tue']::text[]) AS ok
    `);
    expect(rows[0].ok).toBe(true);
  });
});

describe("plan_role_enum", () => {
  it("contains primary, secondary, accessory", async () => {
    const { rows } = await pool.query<{ val: string }>(`
      SELECT unnest(enum_range(NULL::plan_role_enum))::text AS val
    `);
    const vals = rows.map((r) => r.val);
    expect(vals).toContain("primary");
    expect(vals).toContain("secondary");
    expect(vals).toContain("accessory");
  });
});

// -- Views --

describe("v_weekly_muscle_volume", () => {
  it("exists with expected columns", async () => {
    const { fields } = await pool.query("SELECT * FROM public.v_weekly_muscle_volume LIMIT 0");
    const cols = fields.map((f) => f.name);
    expect(cols).toContain("user_id");
    expect(cols).toContain("muscle_primary");
    expect(cols).toContain("weekly_sets");
  });
});

describe("v_last_top_set_per_exercise", () => {
  it("exists with expected columns", async () => {
    const { fields } = await pool.query("SELECT * FROM public.v_last_top_set_per_exercise LIMIT 0");
    const cols = fields.map((f) => f.name);
    expect(cols).toContain("user_id");
    expect(cols).toContain("exercise_id");
    expect(cols).toContain("last_load");
    expect(cols).toContain("last_reps");
    expect(cols).toContain("set_type");
  });
});

// -- suitable_slots correctness (migration 0035) --

describe("suitable_slots migration 0035", () => {
  it("exercises 8 and 19 are restricted to secondary+accessory", async () => {
    const { rows } = await pool.query<{ exercise_id: number; suitable_slots: string[] }>(`
      SELECT exercise_id, suitable_slots
      FROM public.exercises
      WHERE exercise_id IN (8, 19)
      ORDER BY exercise_id
    `);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.suitable_slots).toEqual(["secondary", "accessory"]);
    }
  });

  it("exercises 20-24 are restricted to accessory only", async () => {
    const { rows } = await pool.query<{ exercise_id: number; suitable_slots: string[] }>(`
      SELECT exercise_id, suitable_slots
      FROM public.exercises
      WHERE exercise_id IN (20, 21, 22, 23, 24)
      ORDER BY exercise_id
    `);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.suitable_slots).toEqual(["accessory"]);
    }
  });

  it("compound exercises 1-7 retain primary in suitable_slots", async () => {
    const { rows } = await pool.query<{ exercise_id: number; suitable_slots: string[] }>(`
      SELECT exercise_id, suitable_slots
      FROM public.exercises
      WHERE exercise_id BETWEEN 1 AND 7
      ORDER BY exercise_id
    `);
    for (const row of rows) {
      expect(row.suitable_slots).toContain("primary");
    }
  });
});
