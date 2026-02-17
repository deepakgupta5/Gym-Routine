import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { shiftMissedSessions, PlanSessionRow } from "@/lib/engine/schedule";
import { logError } from "@/lib/logger";

function todayUtcString() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const body = await req.json().catch(() => ({}));
    const today = typeof body?.today === "string" ? body.today : todayUtcString();

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

    const result = shiftMissedSessions(sessions, today);

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

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      dropped: result.dropped.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("plan_shift_failed", err, { user_id: userId });
    return NextResponse.json({ error: "plan_shift_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
