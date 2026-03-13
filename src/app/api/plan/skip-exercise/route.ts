import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
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

type PlanExerciseRole = "primary" | "secondary" | "accessory";

type ExerciseRow = {
  plan_exercise_id: string;
  plan_session_id: string;
  exercise_id: number;
  role: PlanExerciseRole;
  targeted_primary_muscle: string;
  targeted_secondary_muscle: string | null;
  prescribed_sets: number;
  prescribed_reps_min: number;
  prescribed_reps_max: number;
  prescribed_load: string | number;
  backoff_percent: string | number | null;
  rest_seconds: number;
  tempo: string;
  previous_performance_id: string | null;
  prev_load: string | number | null;
  prev_reps: number | null;
  prev_performed_at: string | null;
  prev_estimated_1rm: string | number | null;
  next_target_load: string | number | null;
};

type SessionExerciseRow = {
  plan_session_id: string;
  exercise_id: number;
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

  const pool = await getDb();
  const client = await pool.connect();

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
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id;
    if (!blockId) {
      await client.query("ROLLBACK");
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
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = sessionRes.rows[0];
    if (session.performed_at) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "session_already_completed" }, { status: 409 });
    }

    const targetRes = await client.query<{ plan_exercise_id: string; role: PlanExerciseRole }>(
      `select plan_exercise_id, role
       from plan_exercises
       where plan_session_id = $1 and exercise_id = $2`,
      [session.plan_session_id, body.exercise_id]
    );

    if ((targetRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "exercise_not_in_session" }, { status: 404 });
    }

    const target = targetRes.rows[0];

    const logsRes = await client.query(
      `select 1
       from set_logs
       where user_id = $1
         and session_id = $2
         and exercise_id = $3
       limit 1`,
      [userId, session.plan_session_id, body.exercise_id]
    );

    if ((logsRes.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "exercise_already_started" }, { status: 409 });
    }

    const upcomingSessionsRes = await client.query<{ plan_session_id: string; date: string; session_type: string }>(
      `select plan_session_id,
              date::text as date,
              session_type
       from plan_sessions
       where user_id = $1
         and block_id = $2
         and performed_at is null
         and date >= $3
       order by date asc, session_type asc`,
      [userId, blockId, session.date]
    );

    if ((upcomingSessionsRes.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_upcoming_sessions" }, { status: 400 });
    }

    const upcomingSessionIds = upcomingSessionsRes.rows.map((r) => r.plan_session_id);

    const sessionExercisesRes = await client.query<SessionExerciseRow>(
      `select plan_session_id, exercise_id
       from plan_exercises
       where plan_session_id = any($1::uuid[])`,
      [upcomingSessionIds]
    );

    const exerciseIdsBySession = new Map<string, Set<number>>();
    for (const row of sessionExercisesRes.rows) {
      const set = exerciseIdsBySession.get(row.plan_session_id) ?? new Set<number>();
      set.add(Number(row.exercise_id));
      exerciseIdsBySession.set(row.plan_session_id, set);
    }

    const roleRowsRes = await client.query<ExerciseRow>(
      `select pe.plan_exercise_id,
              pe.plan_session_id,
              pe.exercise_id,
              pe.role,
              pe.targeted_primary_muscle,
              pe.targeted_secondary_muscle,
              pe.prescribed_sets,
              pe.prescribed_reps_min,
              pe.prescribed_reps_max,
              pe.prescribed_load,
              pe.backoff_percent,
              pe.rest_seconds,
              pe.tempo,
              pe.previous_performance_id,
              pe.prev_load,
              pe.prev_reps,
              pe.prev_performed_at::text as prev_performed_at,
              pe.prev_estimated_1rm,
              pe.next_target_load
       from plan_exercises pe
       join plan_sessions ps on ps.plan_session_id = pe.plan_session_id
       where pe.plan_session_id = any($1::uuid[])
         and pe.role = $2
       order by ps.date asc, ps.session_type asc, pe.exercise_id asc`,
      [upcomingSessionIds, target.role]
    );

    const rowsBySession = new Map<string, ExerciseRow[]>();
    for (const row of roleRowsRes.rows) {
      const list = rowsBySession.get(row.plan_session_id) ?? [];
      list.push(row);
      rowsBySession.set(row.plan_session_id, list);
    }

    const currentRows = rowsBySession.get(session.plan_session_id) ?? [];
    const slotIndex = currentRows.findIndex((r) => r.plan_exercise_id === target.plan_exercise_id);
    if (slotIndex < 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "exercise_slot_not_found" }, { status: 409 });
    }

    const chain: ExerciseRow[] = [];
    for (const s of upcomingSessionsRes.rows) {
      const roleRows = rowsBySession.get(s.plan_session_id) ?? [];
      if (slotIndex < roleRows.length) {
        chain.push(roleRows[slotIndex]);
      }
    }

    if (chain.length === 0 || chain[0].plan_exercise_id !== target.plan_exercise_id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "exercise_chain_not_found" }, { status: 409 });
    }

    const initial = chain[0];
    let carry = initial;
    const replacements: Array<{ dstId: string; src: ExerciseRow }> = [];

    for (const s of upcomingSessionsRes.rows) {
      if (s.plan_session_id === session.plan_session_id) continue;
      const roleRows = rowsBySession.get(s.plan_session_id) ?? [];
      if (slotIndex >= roleRows.length) continue;

      const dst = roleRows[slotIndex];
      const sessionExerciseIds = exerciseIdsBySession.get(s.plan_session_id) ?? new Set<number>();
      const duplicateInSession =
        sessionExerciseIds.has(carry.exercise_id) && carry.exercise_id !== dst.exercise_id;

      // If this session already has the carried exercise, try the next session.
      if (duplicateInSession) continue;

      replacements.push({ dstId: dst.plan_exercise_id, src: carry });

      sessionExerciseIds.delete(dst.exercise_id);
      sessionExerciseIds.add(carry.exercise_id);
      exerciseIdsBySession.set(s.plan_session_id, sessionExerciseIds);

      carry = dst;
    }

    for (const replacement of replacements) {
      const src = replacement.src;
      await client.query(
        `update plan_exercises
         set exercise_id = $2,
             targeted_primary_muscle = $3,
             targeted_secondary_muscle = $4,
             prescribed_sets = $5,
             prescribed_reps_min = $6,
             prescribed_reps_max = $7,
             prescribed_load = $8,
             backoff_percent = $9,
             rest_seconds = $10,
             tempo = $11,
             previous_performance_id = $12,
             prev_load = $13,
             prev_reps = $14,
             prev_performed_at = $15,
             prev_estimated_1rm = $16,
             next_target_load = $17
         where plan_exercise_id = $1`,
        [
          replacement.dstId,
          src.exercise_id,
          src.targeted_primary_muscle,
          src.targeted_secondary_muscle,
          src.prescribed_sets,
          src.prescribed_reps_min,
          src.prescribed_reps_max,
          src.prescribed_load,
          src.backoff_percent,
          src.rest_seconds,
          src.tempo,
          src.previous_performance_id,
          src.prev_load,
          src.prev_reps,
          src.prev_performed_at,
          src.prev_estimated_1rm,
          src.next_target_load,
        ]
      );
    }

    await client.query(
      `delete from plan_exercises
       where plan_exercise_id = $1`,
      [initial.plan_exercise_id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      shifted: replacements.length,
      dropped: 1,
      role: target.role,
      slot_index: slotIndex,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("skip_exercise_failed", err, {
      user_id: userId,
      session_id: body.session_id,
      exercise_id: body.exercise_id,
    });
    return NextResponse.json({ error: "skip_exercise_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
