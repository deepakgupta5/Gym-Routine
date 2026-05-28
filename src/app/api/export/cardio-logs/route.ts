import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export async function GET() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const profileRes = await client.query(
      "select block_id from user_profile where user_id = $1",
      [userId]
    );
    const blockId = profileRes.rows[0]?.block_id;

    if (!blockId) {
      return NextResponse.json({ error: "no_active_block" }, { status: 404 });
    }

    const res = await client.query(
      `select
         ps.date::text as date,
         ps.session_type,
         ps.cardio_minutes,
         ps.cardio_saved_at::text as cardio_saved_at,
         ps.performed_at::text as performed_at,
         count(sl.id) as total_sets
       from plan_sessions ps
       left join set_logs sl
         on sl.session_id = ps.plan_session_id and sl.user_id = ps.user_id
       where ps.user_id = $1 and ps.block_id = $2
         and (ps.cardio_saved_at is not null or ps.performed_at is not null)
       group by ps.plan_session_id, ps.date, ps.session_type,
                ps.cardio_minutes, ps.cardio_saved_at, ps.performed_at
       order by ps.date asc`,
      [userId, blockId]
    );

    const headers = ["date", "session_type", "cardio_minutes", "cardio_saved_at", "performed_at", "total_sets"];

    function escapeCSV(value: string | number | null | undefined) {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const csvLines = [headers.join(",")];
    for (const row of res.rows) {
      csvLines.push([
        escapeCSV(row.date),
        escapeCSV(row.session_type),
        escapeCSV(row.cardio_minutes),
        escapeCSV(row.cardio_saved_at),
        escapeCSV(row.performed_at),
        escapeCSV(row.total_sets),
      ].join(","));
    }

    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="cardio-logs-${blockId}.csv"`,
      },
    });
  } catch (err) {
    logError("export_cardio_logs_failed", err, { user_id: userId });
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
