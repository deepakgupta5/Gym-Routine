import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import {
  incrementUnmetWorkForSkippedExercise,
  syncCompletedWorkoutAndState,
} from "@/lib/scheduler/integration";
import { logError } from "@/lib/logger";

type SkipExerciseBody = {
  session_id?: string;
  exercise_id?: number;
};

type SessionRow = {
  plan_session_id: string;
  block_id: string;
  date: string;
  performed_at: string | null;
};

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as SkipExerciseBody | null;
  if (!body || typeof body.session_id !== "string" || !isPositiveInteger(body.exercise_id)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const exerciseId = Number(body.exercise_id);

  const pool = await getDb();
  const client = await pool.connect();

  // Hoisted so Phase 2 (state sync) can reference the resolved session id
  // after the Phase 1 try block closes.
  let resolvedSessionId: string | null = null;

  try {
    await client.query("BEGIN");

    const profileRes = await client.query<{ block_id: string | null }>(
      `select block_id
       from user_profile
       where user_id = $1`,
      [userId]
    );

    if ((profileRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id;
    if (!blockId) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    const sessionRes = await client.query<SessionRow>(
      `select plan_session_id,
              block_id,
              date::text as date,
              performed_at::text as performed_at
       from plan_sessions
       where user_id = $1
         and block_id = $2
         and plan_session_id = $3`,
      [userId, blockId, body.session_id]
    );

    if ((sessionRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = sessionRes.rows[0];
    resolvedSessionId = session.plan_session_id;
    if (session.performed_at) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "session_already_completed" }, { status: 409 });
    }

    const targetRes = await client.query<{ plan_exercise_id: string }>(
      `select plan_exercise_id
       from plan_exercises
       where plan_session_id = $1
         and exercise_id = $2
         and skipped_at is null`,
      [session.plan_session_id, exerciseId]
    ).catch((error) => {
      if (!isMissingSkippedAtColumn(error)) throw error;
      return client.query<{ plan_exercise_id: string }>(
        `select plan_exercise_id
         from plan_exercises
         where plan_session_id = $1
           and exercise_id = $2`,
        [session.plan_session_id, exerciseId]
      );
    });

    if ((targetRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "exercise_not_in_session" }, { status: 404 });
    }

    const logsRes = await client.query(
      `select 1
       from set_logs
       where user_id = $1
         and session_id = $2
         and exercise_id = $3
       limit 1`,
      [userId, session.plan_session_id, exerciseId]
    );

    if ((logsRes.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      client.release();
      return NextResponse.json({ error: "exercise_already_started" }, { status: 409 });
    }

    await client.query(
      `update plan_exercises
       set skipped_at = now()
       where plan_exercise_id = $1`,
      [targetRes.rows[0]?.plan_exercise_id]
    ).catch((error) => {
      if (!isMissingSkippedAtColumn(error)) throw error;
      return client.query(
        `delete from plan_exercises
         where plan_exercise_id = $1`,
        [targetRes.rows[0]?.plan_exercise_id]
      );
    });

    // Phase 1 complete - commit the core skip so the user is unblocked regardless
    // of what happens in the secondary state-sync phase below.
    await client.query("COMMIT");
    console.log(`[skip-exercise] Phase1 committed: session=${body.session_id} exercise=${body.exercise_id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    logError("skip_exercise_failed", err, {
      user_id: userId,
      session_id: body.session_id,
      exercise_id: body.exercise_id,
    });
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "skip_exercise_failed", detail: msg }, { status: 500 });
  }

  // Phase 2: secondary state sync - runs in its own transaction after the skip
  // is durably committed. A failure here is logged but does NOT return an error
  // to the client; the skip already succeeded.
  try {
    await client.query("BEGIN");
    await incrementUnmetWorkForSkippedExercise(client, userId, exerciseId);
    // resolvedSessionId is guaranteed non-null here (Phase 1 committed successfully)
    await syncCompletedWorkoutAndState(client, userId, resolvedSessionId!);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logError("skip_exercise_state_sync_failed", err, {
      user_id: userId,
      session_id: body.session_id,
      exercise_id: body.exercise_id,
    });
    // Non-fatal: skip is already committed above.
  } finally {
    client.release();
  }

  return NextResponse.json({
    ok: true,
    shifted: 0,
    dropped: 0,
  });
}

function isMissingSkippedAtColumn(error: unknown): error is { code?: string; message?: string } {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string; message?: string };
  return pgError.code === "42703" && String(pgError.message || "").includes("skipped_at");
}
