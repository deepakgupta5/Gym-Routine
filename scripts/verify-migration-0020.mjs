import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const connectionString =
  process.env.SUPABASE_DB_URL ||
  "SUPABASE_DB_URL_REDACTED";

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. New exercises columns
  const exCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises'
      AND column_name IN ('seed_load_lb','muscle_primary','muscle_secondary','allowed_day_types',
                          'forbidden_day_types','user_preference_score','equipment_variants',
                          'is_unilateral','uses_bodyweight')
    ORDER BY column_name;
  `);
  console.log("exercises new columns:", exCols.rows.map(r => `${r.column_name}(${r.data_type})`).join(", "));

  // 2. Backfill coverage
  const fill = await client.query(`
    SELECT count(*) AS total,
           count(muscle_primary) AS with_muscle_primary,
           count(seed_load_lb) AS with_seed_load,
           count(allowed_day_types) AS with_allowed_day_types
    FROM public.exercises;
  `);
  console.log("backfill coverage:", fill.rows[0]);

  // 3. Sample equipment_type values
  const etypes = await client.query(`
    SELECT equipment_type, count(*) AS n
    FROM public.exercises
    GROUP BY equipment_type ORDER BY n DESC;
  `);
  console.log("equipment_type distribution:");
  etypes.rows.forEach(r => console.log(`  ${r.equipment_type}: ${r.n}`));

  // 4. Sample unilateral / bodyweight flags
  const flags = await client.query(`
    SELECT name, is_unilateral, uses_bodyweight
    FROM public.exercises
    WHERE is_unilateral = true OR uses_bodyweight = true
    ORDER BY exercise_id;
  `);
  console.log("unilateral/bodyweight exercises:");
  flags.rows.forEach(r => console.log(`  ${r.name}: unilateral=${r.is_unilateral}, bodyweight=${r.uses_bodyweight}`));

  // 5. plan_exercises new columns
  const peCols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_exercises'
      AND column_name IN ('top_set_target_load_lb','top_set_target_reps','back_off_target_load_lb',
                          'back_off_target_reps','per_side_reps','equipment_variant',
                          'rationale_code','rationale_text')
    ORDER BY column_name;
  `);
  console.log("plan_exercises new columns:", peCols.rows.map(r => r.column_name).join(", "));

  // 6. plan_sessions new column
  const psCols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_sessions'
      AND column_name = 'session_blueprint_version';
  `);
  console.log("plan_sessions session_blueprint_version:", psCols.rows.length > 0 ? "EXISTS" : "MISSING");

  // 7. session_type_enum values
  const enumVals = await client.query(`
    SELECT e.enumlabel AS v
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'session_type_enum'
    ORDER BY e.enumsortorder;
  `);
  console.log("session_type_enum values:", enumVals.rows.map(r => r.v).join(", "));

  // 8. Views exist
  const views = await client.query(`
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name IN ('v_weekly_muscle_volume','v_last_top_set_per_exercise')
    ORDER BY table_name;
  `);
  console.log("views:", views.rows.map(r => r.table_name).join(", ") || "NONE");

  await client.end();
  console.log("\nVerification complete.");
}

main().catch(err => { console.error(err); process.exit(1); });
