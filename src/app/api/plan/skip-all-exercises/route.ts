import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import {
  incrementUnmetWorkForSkippedExercise,
  syncCompletedWorkoutAndState,
} from "@/lib/scheduler/integration";
import { logError } from "@/lib/logger";

type SkipAllExercisesBody = {
  session_id?: string;
};

type SessionRow = {
  plan_session_id: string;
  block_id: string;
  date: string;
};

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as SkipAllExercisesBody | null;
  if (!body || typeof body.session_id !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    // Phase 1: validate and commit the bulk skip atomically.
    await client.query("BEGIN");

    const profileRes = await client.query<{ block_id: string | null }>(
      `select block_id from user_profile where user_id = $1`,
      [userId]
    );
    if ((profileRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id;
    if (!blockId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    const sessionRes = await client.query<SessionRow>(
      `select plan_session_id, block_id, date::text as date
       from plan_sessions
       where user_id = $1 and block_id = $2 and plan_session_id = $3`,
      [userId, blockId, body.session_id]
    );
    if ((sessionRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = sessionRes.rows[0];

    // Reject if any exercise in this session already has set logs (already started).
    const startedRes = await client.query<{ exercise_id: number }>(
      `select distinct sl.exercise_id
       from set_logs sl
       join plan_exercises pe on pe.exercise_id = sl.exercise_id
         and pe.plan_session_id = $1
       where sl.user_id = $2 and sl.session_id = $1`,
      [session.plan_session_id, userId]
    );
    if ((startedRes.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "some_exercises_already_started", detail: "Cannot bulk-skip after logging sets." },
        { status: 409 }
      );
    }

    // Skip all unskipped exercises in one statement; collect their exercise_ids
    // for the state-sync phase.
    const skippedRes = await client.query<{ exercise_id: number }>(
      `update plan_exercises
       set skipped_at = now()
       where plan_session_id = $1 and skipped_at is null
       returning exercise_id`,
      [session.plan_session_id]
    );

    const skippedExerciseIds = skippedRes.rows.map((r) => Number(r.exercise_id));

    await client.query("COMMIT");

    // Phase 2: secondary state sync per skipped exercise. Non-fatal.
    try {
      await client.query("BEGIN");
      for (const exerciseId of skippedExerciseIds) {
        await incrementUnmetWorkForSkippedExercise(client, userId, exerciseId);
      }
      await syncCompletedWorkoutAndState(client, userId, session.plan_session_id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logError("skip_all_exercises_state_sync_failed", err, {
        user_id: userId,
        session_id: body.session_id,
        skipped_count: skippedExerciseIds.length,
      });
    }

    return NextResponse.json({ ok: true, skipped_count: skippedExerciseIds.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logError("skip_all_exercises_failed", err, {
      user_id: userId,
      session_id: body.session_id,
    });
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "skip_all_exercises_failed", detail: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
