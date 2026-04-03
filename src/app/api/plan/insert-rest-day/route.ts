import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const body = await req.json().catch(() => ({}));
    const restDate =
      typeof body?.rest_date === "string"
        ? body.rest_date
        : typeof body?.date === "string"
        ? body.date
        : null;

    if (!restDate) {
      return NextResponse.json({ error: "rest_date_required" }, { status: 400 });
    }

    if (body?.dry_run === true) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        shifts: [],
        dropped_count: 0,
      });
    }

    await client.query("BEGIN");

    const profileRes = await client.query(
      "select block_id from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id;
    if (!blockId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    await client.query(
      `delete from plan_sessions
       where user_id = $1
         and block_id = $2
         and date = $3
         and performed_at is null`,
      [userId, blockId, restDate]
    );

    await client.query(
      `update user_profile
       set skipped_dates =
         case
           when $1 = any(skipped_dates) then skipped_dates
           else array_append(skipped_dates, $1)
         end,
         updated_at = now()
       where user_id = $2`,
      [restDate, userId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      updated: 0,
      dropped: 0,
      skip_recorded: true,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("insert_rest_day_failed", err, { user_id: userId });
    return NextResponse.json({ error: "insert_rest_day_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
