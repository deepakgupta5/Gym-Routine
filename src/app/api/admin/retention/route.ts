import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

const RETENTION_JOB_NAME = "retention_set_logs_12m";

export async function POST(req: NextRequest) {
  requireConfig();
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== CONFIG.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const setLogsRes = await client.query(
      `delete from set_logs
       where performed_at < now() - interval '12 months'
       returning id`
    );

    const orphanTopSetRes = await client.query(
      `delete from top_set_history
       where source_set_log_id is null
         and performed_at < now() - interval '12 months'
       returning id`
    );

    const markerRes = await client.query(
      `insert into system_jobs (job_name, last_run_at, last_status, last_detail)
       values ($1, now(), 'ok', $2::jsonb)
       on conflict (job_name) do update set
         last_run_at = excluded.last_run_at,
         last_status = excluded.last_status,
         last_detail = excluded.last_detail
       returning last_run_at`,
      [
        RETENTION_JOB_NAME,
        JSON.stringify({
          deleted_set_logs: setLogsRes.rowCount ?? 0,
          deleted_orphan_top_sets: orphanTopSetRes.rowCount ?? 0,
        }),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      deleted: setLogsRes.rowCount ?? 0,
      deleted_orphan_top_sets: orphanTopSetRes.rowCount ?? 0,
      last_retention_ran_at: markerRes.rows[0]?.last_run_at ?? null,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("retention_failed", err);
    return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
