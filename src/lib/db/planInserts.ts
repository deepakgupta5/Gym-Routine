import { PlanExerciseInput, SessionInput } from "@/lib/engine/types";
import { sessionKey } from "@/lib/engine/utils";

export async function upsertPlanSessionsReturnMap(
  client: any,
  userId: string,
  blockId: string,
  sessions: SessionInput[]
): Promise<Map<string, string>> {
  if (sessions.length === 0) return new Map();

  const values: string[] = [];
  const params: any[] = [];
  let i = 1;

  for (const s of sessions) {
    params.push(
      userId,
      blockId,
      s.week_in_block,
      s.date,
      s.session_type,
      s.is_required,
      s.is_deload,
      s.cardio_minutes ?? 0,
      s.conditioning_minutes ?? 0
    );
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
    );
  }

  const insertSql = `
    insert into plan_sessions
      (user_id, block_id, week_in_block, date, session_type, is_required, is_deload, cardio_minutes, conditioning_minutes)
    values
      ${values.join(",")}
    on conflict (user_id, block_id, session_type, date) do nothing
    returning plan_session_id, date, session_type
  `;

  await client.query(insertSql, params);

  const selectSql = `
    select plan_session_id, date::text as date, session_type
    from plan_sessions
    where user_id = $1 and block_id = $2
  `;
  const all = await client.query(selectSql, [userId, blockId]);

  const map = new Map<string, string>();
  for (const r of all.rows) {
    map.set(sessionKey({ date: r.date, session_type: r.session_type }), r.plan_session_id);
  }

  for (const s of sessions) {
    const k = sessionKey(s);
    if (!map.has(k)) {
      throw new Error(`plan_session_id_missing_for_${k}`);
    }
  }

  return map;
}

export async function insertPlanExercisesIdempotent(
  client: any,
  sessionIdByKey: Map<string, string>,
  exercises: PlanExerciseInput[]
) {
  if (exercises.length === 0) return;

  const values: string[] = [];
  const params: any[] = [];
  let i = 1;

  for (const e of exercises) {
    const planSessionId = sessionIdByKey.get(e.session_key);
    if (!planSessionId) throw new Error(`unknown_session_key_${e.session_key}`);

    params.push(
      planSessionId,
      e.exercise_id,
      e.targeted_primary_muscle,
      e.targeted_secondary_muscle ?? null,
      e.role,
      e.prescribed_sets,
      e.prescribed_reps_min,
      e.prescribed_reps_max,
      e.prescribed_load,
      e.backoff_percent ?? null,
      e.rest_seconds,
      e.tempo,
      e.previous_performance_id ?? null,
      e.prev_load ?? null,
      e.prev_reps ?? null,
      e.prev_performed_at ?? null,
      e.prev_estimated_1rm ?? null
    );

    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
    );
  }

  const sql = `
    insert into plan_exercises
      (plan_session_id, exercise_id, targeted_primary_muscle, targeted_secondary_muscle,
       role, prescribed_sets, prescribed_reps_min, prescribed_reps_max, prescribed_load,
       backoff_percent, rest_seconds, tempo,
       previous_performance_id, prev_load, prev_reps, prev_performed_at, prev_estimated_1rm)
    values
      ${values.join(",")}
    on conflict (plan_session_id, exercise_id) do nothing
  `;

  await client.query(sql, params);
}
