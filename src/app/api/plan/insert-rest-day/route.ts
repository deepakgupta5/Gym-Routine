import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { insertRestDay, PlanSessionRow } from "@/lib/engine/schedule";
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

    const sessionsRes = await client.query(
      `select plan_session_id,
              date::text as date,
              session_type,
              is_required,
              performed_at,
              week_in_block
       from plan_sessions
       where user_id = $1 and block_id = $2`,
      [userId, blockId]
    );

    const sessions: PlanSessionRow[] = sessionsRes.rows.map((r: any) => ({
      plan_session_id: r.plan_session_id,
      date: r.date,
      session_type: r.session_type,
      is_required: r.is_required,
      performed_at: r.performed_at,
      week_in_block: r.week_in_block,
    }));

    const hadSessionOnRestDate = sessions.some((s) => s.date === restDate);
    const result = insertRestDay(sessions, restDate);

    for (const u of result.updated) {
      await client.query(
        "update plan_sessions set date = $1 where plan_session_id = $2",
        [u.date, u.plan_session_id]
      );
    }

    if (result.dropped.length > 0) {
      await client.query(
        "delete from plan_sessions where plan_session_id = any($1)",
        [result.dropped]
      );
    }

    if (hadSessionOnRestDate) {
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
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      dropped: result.dropped.length,
      skip_recorded: hadSessionOnRestDate,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("insert_rest_day_failed", err, { user_id: userId });
    return NextResponse.json({ error: "insert_rest_day_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
