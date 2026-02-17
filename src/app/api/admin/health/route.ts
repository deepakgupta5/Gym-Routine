import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { computeBlockProgress } from "@/lib/db/blockState";

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
      "select user_id, block_id, current_block_week, bias_balance, adaptive_enabled from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const profile = profileRes.rows[0];
    const blockId = profile.block_id ?? null;

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

    const currentWeekSessions = blockId
      ? await client.query(
          `select count(*)::int as count
           from plan_sessions
           where user_id = $1 and block_id = $2 and week_in_block = $3`,
          [userId, blockId, profile.current_block_week]
        )
      : { rows: [{ count: 0 }] };

    const pendingAdaptive = blockId
      ? await client.query(
          `select pending_bias_balance, pending_cardio_rule, pending_reason, pending_computed_at, pending_applied
           from blocks
           where block_id = $1`,
          [blockId]
        )
      : { rows: [] };

    const blockProgress = blockId
      ? await computeBlockProgress(client, userId, blockId)
      : null;

    return NextResponse.json({
      ok: true,
      user_profile: profile,
      plan_sessions: sessions.rows[0].count,
      plan_exercises: exercises.rows[0].count,
      plan_sessions_current_block: sessionsCurrent.rows[0].count,
      plan_exercises_current_block: exercisesCurrent.rows[0].count,
      current_week_session_count: currentWeekSessions.rows[0].count,
      pending_adaptive: pendingAdaptive.rows[0] ?? null,
      block_progress: blockProgress,
    });
  } finally {
    client.release();
  }
}
