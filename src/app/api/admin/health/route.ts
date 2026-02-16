import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  requireConfig();
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== CONFIG.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const userId = CONFIG.SINGLE_USER_ID;

    await client.query("select 1 from user_profile limit 1");
    await client.query("select 1 from blocks limit 1");

    const profileRes = await client.query(
      "select user_id, block_id, current_block_week from user_profile where user_id = $1",
      [userId]
    );
    const profile = profileRes.rows[0] ?? null;
    const blockId = profile?.block_id ?? null;

    const sessions = await client.query(
      "select count(*)::int as count from plan_sessions where user_id = $1",
      [userId]
    );

    const exercises = await client.query(
      `select count(*)::int as count
       from plan_exercises pe
       join plan_sessions ps on ps.plan_session_id = pe.plan_session_id
       where ps.user_id = $1`,
      [userId]
    );

    const sessionsCurrent = blockId
      ? await client.query(
          "select count(*)::int as count from plan_sessions where user_id = $1 and block_id = $2",
          [userId, blockId]
        )
      : { rows: [{ count: 0 }] };

    const exercisesCurrent = blockId
      ? await client.query(
          `select count(*)::int as count
           from plan_exercises pe
           join plan_sessions ps on ps.plan_session_id = pe.plan_session_id
           where ps.user_id = $1 and ps.block_id = $2`,
          [userId, blockId]
        )
      : { rows: [{ count: 0 }] };

    return NextResponse.json({
      ok: true,
      user_profile: profile,
      plan_sessions: sessions.rows[0].count,
      plan_exercises: exercises.rows[0].count,
      plan_sessions_current_block: sessionsCurrent.rows[0].count,
      plan_exercises_current_block: exercisesCurrent.rows[0].count,
    });
  } finally {
    client.release();
  }
}
