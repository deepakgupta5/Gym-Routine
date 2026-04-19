import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, "../supabase/migrations/0021_fix_missing_session_type_enum_values.sql"), "utf8");

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("Error: SUPABASE_DB_URL env var is required");
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// Note: ALTER TYPE ADD VALUE cannot run inside a transaction block in PG < 12.
// Execute statements individually.
const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
for (const stmt of stmts) {
  await client.query(stmt + ";");
}
console.log("Migration 0021 applied.");

const r = await client.query(`
  SELECT string_agg(e.enumlabel::text, ', ' ORDER BY e.enumsortorder) AS vals
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'session_type_enum'
`);
console.log("session_type_enum:", r.rows[0].vals);

await client.end();
