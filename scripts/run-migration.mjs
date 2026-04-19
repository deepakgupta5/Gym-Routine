// One-off migration runner for 0020_v2_data_model.sql
// Usage: node scripts/run-migration.mjs

import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../supabase/migrations/0020_v2_data_model.sql");
const sql = readFileSync(sqlPath, "utf8");

// Connection URL from env - set SUPABASE_DB_URL before running
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("Error: SUPABASE_DB_URL env var is required");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database.");

  try {
    await client.query("BEGIN");
    console.log("Executing migration 0020...");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migration 0020 committed successfully.");

    // Verify: check new columns exist
    const check = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'exercises'
        AND column_name IN ('seed_load_lb','muscle_primary','allowed_day_types','is_unilateral','uses_bodyweight','equipment_variants')
      ORDER BY column_name;
    `);
    console.log("New exercises columns:", check.rows.map((r) => r.column_name));

    // Verify exercise count with muscle_primary filled
    const countCheck = await client.query(`
      SELECT count(*) AS total,
             count(muscle_primary) AS with_muscle_primary,
             count(seed_load_lb) AS with_seed_load
      FROM public.exercises;
    `);
    console.log("Exercise counts:", countCheck.rows[0]);

    // Verify plan_exercises new columns
    const peCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plan_exercises'
        AND column_name IN ('top_set_target_load_lb','top_set_target_reps','back_off_target_load_lb','rationale_code','rationale_text')
      ORDER BY column_name;
    `);
    console.log("New plan_exercises columns:", peCheck.rows.map((r) => r.column_name));

    // Verify session_type_enum has new values
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::session_type_enum))::text AS v
      WHERE unnest(enum_range(NULL::session_type_enum))::text LIKE '%_upper%'
         OR unnest(enum_range(NULL::session_type_enum))::text LIKE '%_lower%'
         OR unnest(enum_range(NULL::session_type_enum))::text = 'full_body';
    `);
    console.log("New session_type_enum values:", enumCheck.rows.map((r) => r.v));

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration FAILED, rolled back:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
