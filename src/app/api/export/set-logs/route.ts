import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

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
         sl.performed_at::text as performed_at,
         e.name as exercise_name,
         sl.set_type,
         sl.set_index,
         sl.load::text as load,
         sl.reps,
         sl.rpe::text as rpe,
         sl.notes
       from set_logs sl
       join exercises e on e.exercise_id = sl.exercise_id
       where sl.user_id = $1 and sl.session_id in (
         select plan_session_id from plan_sessions where block_id = $2
       )
       order by sl.performed_at asc, sl.exercise_id asc, sl.set_index asc`,
      [userId, blockId]
    );

    const rows = res.rows as Array<{
      performed_at: string;
      exercise_name: string;
      set_type: string;
      set_index: number;
      load: string;
      reps: number;
      rpe: string | null;
      notes: string | null;
    }>;

    const headers = ["performed_at", "exercise_name", "set_type", "set_index", "load", "reps", "rpe", "notes"];

    function escapeCSV(value: string | number | null | undefined) {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const csvLines = [headers.join(",")];
    for (const row of rows) {
      csvLines.push(
        [
          escapeCSV(row.performed_at),
          escapeCSV(row.exercise_name),
          escapeCSV(row.set_type),
          escapeCSV(row.set_index),
          escapeCSV(row.load),
          escapeCSV(row.reps),
          escapeCSV(row.rpe),
          escapeCSV(row.notes),
        ].join(",")
      );
    }

    const csv = csvLines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="set-logs-${blockId}.csv"`,
      },
    });
  } finally {
    client.release();
  }
}
