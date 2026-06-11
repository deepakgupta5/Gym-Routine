// v2 scheduler entry point
// Called from integration.ts when GYM_V2_ENABLED=true

import type { PoolClient } from "pg";
import { V2_ROTATION, V2_BLUEPRINT_VERSION, PRESCRIPTION, BACK_OFF_PERCENT, WEEKLY_MAX_SETS } from "./constants";
import { selectDayType, selectExercisesForSession } from "./select";
import type { V2DayType, V2ExerciseRow, V2LastTopSet, V2SelectedExercise } from "./types";
import { roundToIncrement } from "@/lib/engine/progression";

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
       coalesce(e.forbidden_day_types, ARRAY[]::text[]) as forbidden_day_types,
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
  // Pull exercise IDs used in any role in plan_exercises
  // linked to plan_sessions within the last 2 days (excluding today).
  //
  // Why 2 days, not 7:
  //   The scheduler uses a 5-day rotation (push_upper -> squat_lower ->
  //   pull_upper -> hinge_lower -> full_body). The previous push_upper session
  //   is therefore 5 days ago. With a 7-day window, those exercises are inside
  //   the exclusion window, so ALL push_upper accessories (core + day-type-specific)
  //   are in recentIds on every push_upper session. The internal fallback in
  //   candidatesForSlot (keep pool if filter empties it) restores them, then
  //   scoring assigns the same -200 penalty to every candidate -- so core
  //   exercises still win by their +40 preference score, repeating identically.
  //
  //   With 2 days: only yesterday's + day-before's exercises are excluded.
  //   Day-type-specific accessories from 5 days ago are fresh candidates,
  //   the strict no-repeat filter passes them, and the fallback never fires.
  //   Core exercises (#25, #43, #44 used in every session) are excluded for
  //   2 days then return to the fresh pool, maintaining variety without
  //   starving the candidate set.
  //
  //   Tradeoff accepted (D009 in DECISION_LOG_GYM.md): the same exercise may
  //   appear across two push_upper sessions separated by 5 days. That is
  //   acceptable for a fixed 5-day rotation -- the user sees variety day-to-day.
  const res = await client.query<{ exercise_id: number }>(
    `select distinct pe.exercise_id
     from plan_exercises pe
     join plan_sessions ps on ps.plan_session_id = pe.plan_session_id
     where ps.user_id = $1
       and ps.date >= $2::date - interval '2 days'
       and ps.date < $2::date`,
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

async function loadWeeklyMuscleVolume(
  client: PoolClient,
  userId: string
): Promise<Map<string, number>> {
  try {
    const res = await client.query<{ muscle_primary: string; weekly_sets: number }>(
      `select muscle_primary, weekly_sets
       from v_weekly_muscle_volume
       where user_id = $1`,
      [userId]
    );
    return new Map(res.rows.map((r) => [r.muscle_primary, Number(r.weekly_sets)]));
  } catch {
    // View missing or query error -- fall back to empty map (pure rotation)
    return new Map();
  }
}

// Count performed sessions in the last 7 days (for deload trigger B).
// Returns 0 on error (safe fallback -- no deload from this condition).
async function loadRecentSessionCount(
  client: PoolClient,
  userId: string
): Promise<number> {
  try {
    const res = await client.query<{ session_count: number }>(
      `select count(*)::int as session_count
       from plan_sessions
       where user_id = $1
         and performed_at is not null
         and performed_at >= now() - interval '7 days'`,
      [userId]
    );
    return Number(res.rows[0]?.session_count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * PRD Section 4.5: auto-deload conditions.
 *   A: any muscle group exceeds WEEKLY_MAX_SETS in the rolling 7-day window.
 *   B: >= 6 performed sessions in the last 7 days.
 * Returns true if either condition fires.
 * Exported for unit tests.
 */
export function shouldAutoDeload(
  weeklyVolume: Map<string, number>,
  recentSessionCount: number
): boolean {
  if (recentSessionCount >= 6) return true;
  for (const [muscle, sets] of weeklyVolume) {
    const max = WEEKLY_MAX_SETS[muscle];
    if (max !== undefined && sets > max) return true;
  }
  return false;
}

async function loadRecentV2DayTypes(
  client: PoolClient,
  userId: string,
  isoDate: string
): Promise<V2DayType[]> {
  // We only need the single most-recent v2 session: selectDayType uses
  // recentV2DayTypes[length-1] exclusively to advance the rotation.
  //
  // Bug fixed (2026-06-09): the previous query used ORDER BY date ASC LIMIT 10,
  // which returns the 10 OLDEST sessions. Once the user had more than 10 v2
  // sessions in the DB, selectDayType's "last" element was permanently the
  // 10th-oldest session type (pull_upper from April), causing it to return
  // hinge_lower on every call forever. Changing to DESC LIMIT 1 always reads
  // the true most-recent session regardless of total session count.
  const res = await client.query<{ session_type: string }>(
    `select session_type::text as session_type
     from plan_sessions
     where user_id = $1
       and date < $2::date
       and session_type::text = any($3::text[])
     order by date desc
     limit 1`,
    [userId, isoDate, V2_ROTATION]
  );
  return res.rows
    .map((r) => r.session_type as V2DayType)
    .filter((t) => (V2_ROTATION as readonly string[]).includes(t));
}

// ─── Session insertion ──────────────────────────────────────────────────────────

// Deload load multiplier (PRD Section 4.5).
const DELOAD_LOAD_FACTOR = 0.8;

async function insertV2Session(
  client: PoolClient,
  params: {
    userId: string;
    blockId: string;
    blockWeek: number;
    isoDate: string;
    dayType: V2DayType;
    exercises: V2SelectedExercise[];
    isDeload: boolean;
  }
): Promise<string | null> {
  // No transaction here: integration.ts wraps the delete + this call in one
  // BEGIN/COMMIT/ROLLBACK so both are atomic.
  const sessionRes = await client.query<{ plan_session_id: string }>(
    `insert into plan_sessions
      (user_id, block_id, week_in_block, date, session_type,
       is_required, is_deload, cardio_minutes, session_blueprint_version)
     values ($1, $2, $3, $4, $5, true, $6, 0, $7)
     returning plan_session_id`,
    [
      params.userId,
      params.blockId,
      params.blockWeek,
      params.isoDate,
      params.dayType,
      params.isDeload,
      V2_BLUEPRINT_VERSION,
    ]
  );

  const sessionId = sessionRes.rows[0]?.plan_session_id;
  if (!sessionId) return null;

  // When deloading, reduce all prescribed loads to DELOAD_LOAD_FACTOR (80%)
  // of the computed targets, rounded to the exercise's own load increment.
  const factor = params.isDeload ? DELOAD_LOAD_FACTOR : 1.0;

  for (const ex of params.exercises) {
    const p   = PRESCRIPTION[ex.role];
    const inc = ex.exercise.load_increment_lb ?? 5;

    const topLoad = ex.topSetLoad === 0
      ? 0  // bodyweight -- 0 stays 0
      : roundToIncrement(ex.topSetLoad * factor, inc);

    const backLoad = ex.backOffLoad !== null && ex.backOffLoad > 0
      ? roundToIncrement(ex.backOffLoad * factor, inc)
      : ex.backOffLoad; // null or 0 unchanged

    const rationaleText = params.isDeload && ex.rationale_text
      ? `[Deload 80%] ${ex.rationale_text}`
      : ex.rationale_text;

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
        topLoad,                    // prescribed_load = top set load (possibly reduced)
        p.useBackOff ? BACK_OFF_PERCENT : null,
        ex.restSeconds,
        "3-1-1-0",
        topLoad,                    // next_target_load (same as top set, for v1 compat)
        topLoad,                    // top_set_target_load_lb
        ex.topSetReps,
        backLoad,                   // back_off_target_load_lb (possibly reduced)
        ex.backOffReps,
        ex.per_side_reps,
        ex.equipment_variant,
        ex.rationale_code,
        rationaleText,
      ]
    );
  }

  return sessionId;
}

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Generate a v2 session plan for the given date.
 * Returns the new plan_session_id, or null if generation fails.
 *
 * @param forcedDayType - if provided, bypasses the rotation and uses this
 *   day type directly (used for the "Change day type" override in the UI).
 */
export async function ensureWorkoutPlanForDateV2(
  client: PoolClient,
  userId: string,
  isoDate: string,
  blockId: string,
  blockWeek: number,
  forcedDayType?: V2DayType
): Promise<string | null> {
  // 1. Select day type from rotation (or use the forced override).
  //    Also check auto-deload conditions unless caller forced a day type.
  let dayType: V2DayType;
  let isDeload = false;

  if (forcedDayType) {
    // Caller explicitly chose a day type (UI regen) -- respect it, skip deload check.
    dayType = forcedDayType;
  } else {
    const [recentDayTypes, weeklyVolume, recentSessionCount] = await Promise.all([
      loadRecentV2DayTypes(client, userId, isoDate),
      loadWeeklyMuscleVolume(client, userId),
      loadRecentSessionCount(client, userId),
    ]);
    isDeload = shouldAutoDeload(weeklyVolume, recentSessionCount);
    // Auto-deload always uses full_body (PRD Section 4.5).
    dayType = isDeload ? "full_body" : selectDayType(recentDayTypes, weeklyVolume, isoDate);
  }

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

  // 5. Insert the session (with is_deload flag and optional 80% load reduction)
  return insertV2Session(client, {
    userId,
    blockId,
    blockWeek,
    isoDate,
    dayType,
    exercises: selected,
    isDeload,
  });
}
