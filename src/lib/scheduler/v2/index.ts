// v2 scheduler entry point
// Called from integration.ts when GYM_V2_ENABLED=true

import type { PoolClient } from "pg";
import { V2_ROTATION, V2_BLUEPRINT_VERSION, PRESCRIPTION } from "./constants";
import { selectDayType, selectExercisesForSession } from "./select";
import type { V2DayType, V2ExerciseRow, V2LastTopSet, V2SelectedExercise } from "./types";

// ─── DB queries ────────────────────────────────────────────────────────────────

async function loadV2Exercises(client: PoolClient): Promise<V2ExerciseRow[]> {
  const res = await client.query<V2ExerciseRow>(
    `select
       e.exercise_id,
       e.name,
       coalesce(e.muscle_primary, 'unknown') as muscle_primary,
       coalesce(e.muscle_secondary, ARRAY[]::text[]) as muscle_secondary,
       e.equipment_type,
       e.equipment_variants,
       coalesce(e.is_unilateral, false) as is_unilateral,
       coalesce(e.uses_bodyweight, false) as uses_bodyweight,
       e.seed_load_lb,
       coalesce(e.allowed_day_types, ARRAY[]::text[]) as allowed_day_types,
       coalesce(e.suitable_slots, ARRAY['primary','secondary','accessory']) as suitable_slots,
       coalesce(e.user_preference_score, 0) as user_preference_score,
       coalesce(e.load_increment_lb, 5) as load_increment_lb,
       coalesce(e.fatigue_score, 3) as fatigue_score,
       coalesce(e.is_enabled, true) as is_enabled
     from exercises e
     order by e.exercise_id asc`
  );
  return res.rows;
}

async function loadRecentPrimaryExerciseIds(
  client: PoolClient,
  userId: string,
  isoDate: string
): Promise<Set<number>> {
  // Pull exercise IDs used as primary or secondary in plan_exercises
  // linked to plan_sessions within the last 7 days (excluding today)
  const res = await client.query<{ exercise_id: number }>(
    `select distinct pe.exercise_id
     from plan_exercises pe
     join plan_sessions ps on ps.plan_session_id = pe.plan_session_id
     where ps.user_id = $1
       and ps.date >= $2::date - interval '7 days'
       and ps.date < $2::date
       and pe.role in ('primary', 'secondary')`,
    [userId, isoDate]
  );
  return new Set(res.rows.map((r) => Number(r.exercise_id)));
}

async function loadLastTopSets(
  client: PoolClient,
  userId: string,
  exerciseIds: number[]
): Promise<Map<number, V2LastTopSet>> {
  if (exerciseIds.length === 0) return new Map();

  const res = await client.query<{
    exercise_id: number;
    last_load: string;
    last_reps: number;
    performed_at: string;
  }>(
    `select user_id, exercise_id, last_load, last_reps, performed_at
     from v_last_top_set_per_exercise
     where user_id = $1
       and exercise_id = any($2::int[])`,
    [userId, exerciseIds]
  );

  return new Map(
    res.rows.map((r) => [
      Number(r.exercise_id),
      {
        exercise_id: Number(r.exercise_id),
        last_load: Number(r.last_load),
        last_reps: Number(r.last_reps),
        performed_at: r.performed_at,
      },
    ])
  );
}

async function loadRecentV2DayTypes(
  client: PoolClient,
  userId: string,
  isoDate: string
): Promise<V2DayType[]> {
  const res = await client.query<{ session_type: string }>(
    `select session_type
     from plan_sessions
     where user_id = $1
       and date < $2::date
       and session_type = any($3::text[])
     order by date asc
     limit 10`,
    [userId, isoDate, V2_ROTATION]
  );
  return res.rows
    .map((r) => r.session_type as V2DayType)
    .filter((t) => (V2_ROTATION as readonly string[]).includes(t));
}

// ─── Session insertion ──────────────────────────────────────────────────────────

async function insertV2Session(
  client: PoolClient,
  params: {
    userId: string;
    blockId: string;
    blockWeek: number;
    isoDate: string;
    dayType: V2DayType;
    exercises: V2SelectedExercise[];
  }
): Promise<string | null> {
  const sessionRes = await client.query<{ plan_session_id: string }>(
    `insert into plan_sessions
      (user_id, block_id, week_in_block, date, session_type,
       is_required, is_deload, cardio_minutes, session_blueprint_version)
     values ($1, $2, $3, $4, $5, true, false, 0, $6)
     returning plan_session_id`,
    [
      params.userId,
      params.blockId,
      params.blockWeek,
      params.isoDate,
      params.dayType,
      V2_BLUEPRINT_VERSION,
    ]
  );

  const sessionId = sessionRes.rows[0]?.plan_session_id;
  if (!sessionId) return null;

  for (const ex of params.exercises) {
    const p = PRESCRIPTION[ex.role];
    await client.query(
      `insert into plan_exercises
        (plan_session_id, exercise_id, targeted_primary_muscle, targeted_secondary_muscle,
         role, prescribed_sets, prescribed_reps_min, prescribed_reps_max, prescribed_load,
         backoff_percent, rest_seconds, tempo, next_target_load,
         top_set_target_load_lb, top_set_target_reps,
         back_off_target_load_lb, back_off_target_reps,
         per_side_reps, equipment_variant, rationale_code, rationale_text)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        sessionId,
        ex.exercise.exercise_id,
        ex.exercise.muscle_primary,
        ex.exercise.muscle_secondary[0] ?? null,
        ex.role,
        p.sets,
        p.repsMin,
        p.repsMax,
        ex.topSetLoad,              // prescribed_load = top set load
        p.useBackOff ? (1 - 0.9) : null, // backoff_percent
        ex.restSeconds,
        "3-1-1-0",
        ex.topSetLoad,              // next_target_load (same as top set, for v1 compat)
        ex.topSetLoad,              // top_set_target_load_lb
        ex.topSetReps,
        ex.backOffLoad,             // back_off_target_load_lb
        ex.backOffReps,
        ex.per_side_reps,
        ex.equipment_variant,
        ex.rationale_code,
        ex.rationale_text,
      ]
    );
  }

  return sessionId;
}

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Generate a v2 session plan for the given date.
 * Returns the new plan_session_id, or null if generation fails.
 */
export async function ensureWorkoutPlanForDateV2(
  client: PoolClient,
  userId: string,
  isoDate: string,
  blockId: string,
  blockWeek: number
): Promise<string | null> {
  // 1. Select day type from rotation
  const recentDayTypes = await loadRecentV2DayTypes(client, userId, isoDate);
  const dayType = selectDayType(recentDayTypes);

  // 2. Load exercises and recent history
  const allExercises = await loadV2Exercises(client);
  const recentExerciseIds = await loadRecentPrimaryExerciseIds(client, userId, isoDate);

  // 3. Load last top sets for load computation
  const exerciseIds = allExercises.map((e) => e.exercise_id);
  const lastTopSets = await loadLastTopSets(client, userId, exerciseIds);

  // 4. Select exercises for each slot
  const selected = selectExercisesForSession({
    dayType,
    all: allExercises,
    recentExerciseIds,
    lastTopSets,
    userId,
    isoDate,
  });

  if (selected.length === 0) return null;

  // 5. Insert the session
  return insertV2Session(client, {
    userId,
    blockId,
    blockWeek,
    isoDate,
    dayType,
    exercises: selected,
  });
}
