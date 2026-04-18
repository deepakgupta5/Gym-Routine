import crypto from "crypto";
import type { PoolClient } from "pg";
import {
  CompletedWorkout,
  Exercise,
  GenerateNextWorkoutInput,
  Muscle,
  PlannedWorkout,
  SchedulerState,
  SessionEmphasis,
  generateNextWorkout,
} from "@/lib/scheduler";
import type { ExerciseRole, ExerciseSlotType } from "@/lib/scheduler/types";

type ExerciseRow = {
  exercise_id: number;
  name: string;
  movement_pattern: string;
  default_targeted_primary_muscle: string;
  default_targeted_secondary_muscle: string | null;
  equipment_type: string;
  load_increment_lb: number | null;
  alt_1_exercise_id: number | null;
  alt_2_exercise_id: number | null;
  alt_3_exercise_id: number | null;
  // Scheduler metadata (added in migration 0019)
  category: string | null;
  fatigue_score: number | null;
  complexity_score: number | null;
  leg_dominant: boolean | null;
  suitable_slots: string[] | null;
  emphasis_tags: string[] | null;
  primary_muscle_groups: unknown; // jsonb string[]
  secondary_muscle_groups: unknown; // jsonb string[]
  is_enabled: boolean | null;
};

type ProfileRow = {
  user_id: string;
  start_date: string;
  block_id: string;
  current_block_week: number;
  progression_state: unknown;
  skipped_dates: string[] | null;
};

type CompletedWorkoutRow = {
  session_id: string;
  completed_at: string;
  emphasis: string;
  leg_dominant: boolean;
  completed_exercise_ids: unknown;
  skipped_exercise_ids: unknown;
  cardio_completed: boolean;
};

type LegacySessionRow = {
  session_id: string;
  completed_at: string;
  session_type: string;
  cardio_completed: boolean;
};

type SessionExerciseCountRow = {
  exercise_id: number;
  prescribed_sets: number;
  skipped_at: string | null;
  completed_sets: number;
};

type SessionRow = {
  plan_session_id: string;
  date: string;
  session_type: string;
  cardio_minutes: number;
  cardio_saved_at: string | null;
};

type SessionExerciseMeta = {
  exercise_id: number;
  default_targeted_primary_muscle: string;
  default_targeted_secondary_muscle: string | null;
};

type ExerciseSchedulerMeta = {
  emphasisTags: SessionEmphasis[];
  roleTags: ExerciseRole[];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  isHeavyCompound: boolean;
  legDominant: boolean;
};

const PRIMARY_SETS = 3;
const SECONDARY_SETS = 3;
const ACCESSORY_SETS = 2;
const TEMPO = "3-1-1-0";

// EXERCISE_META removed — metadata now comes from DB columns (migration 0019).
// Kept as minimal fallback for exercises created before the migration.
const EXERCISE_META_FALLBACK: Record<number, ExerciseSchedulerMeta> = {
  1: { emphasisTags: ["squat"], roleTags: ["primary", "secondary"], primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"], isHeavyCompound: true, legDominant: true },
  2: { emphasisTags: ["squat"], roleTags: ["primary", "secondary"], primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core"], isHeavyCompound: true, legDominant: true },
  3: { emphasisTags: ["squat"], roleTags: ["secondary", "accessory"], primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"], isHeavyCompound: false, legDominant: true },
  4: { emphasisTags: ["squat"], roleTags: ["primary", "secondary"], primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"], isHeavyCompound: false, legDominant: true },
  5: { emphasisTags: ["hinge"], roleTags: ["primary", "secondary"], primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["core"], isHeavyCompound: true, legDominant: true },
  6: { emphasisTags: ["hinge"], roleTags: ["primary", "secondary", "accessory"], primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings", "core"], isHeavyCompound: false, legDominant: true },
  7: { emphasisTags: ["hinge"], roleTags: ["primary", "secondary"], primaryMuscles: ["hamstrings", "glutes"], secondaryMuscles: ["core"], isHeavyCompound: true, legDominant: true },
  8: { emphasisTags: ["hinge"], roleTags: ["accessory"], primaryMuscles: ["hamstrings"], secondaryMuscles: [], isHeavyCompound: false, legDominant: true },
  9: { emphasisTags: ["push"], roleTags: ["primary", "secondary"], primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], isHeavyCompound: true, legDominant: false },
  10: { emphasisTags: ["push"], roleTags: ["primary", "secondary"], primaryMuscles: ["chest", "shoulders"], secondaryMuscles: ["triceps"], isHeavyCompound: true, legDominant: false },
  11: { emphasisTags: ["push"], roleTags: ["primary", "secondary", "accessory"], primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"], isHeavyCompound: false, legDominant: false },
  12: { emphasisTags: ["pull"], roleTags: ["primary", "secondary"], primaryMuscles: ["upper_back"], secondaryMuscles: ["lats", "biceps"], isHeavyCompound: true, legDominant: false },
  13: { emphasisTags: ["pull"], roleTags: ["primary", "secondary"], primaryMuscles: ["upper_back", "lats"], secondaryMuscles: ["biceps"], isHeavyCompound: false, legDominant: false },
  14: { emphasisTags: ["pull"], roleTags: ["primary", "secondary"], primaryMuscles: ["upper_back", "lats"], secondaryMuscles: ["biceps"], isHeavyCompound: false, legDominant: false },
  15: { emphasisTags: ["push"], roleTags: ["primary", "secondary"], primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "chest"], isHeavyCompound: false, legDominant: false },
  16: { emphasisTags: ["push"], roleTags: ["primary", "secondary"], primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"], isHeavyCompound: false, legDominant: false },
  17: { emphasisTags: ["pull"], roleTags: ["primary", "secondary"], primaryMuscles: ["lats"], secondaryMuscles: ["upper_back", "biceps"], isHeavyCompound: false, legDominant: false },
  18: { emphasisTags: ["pull"], roleTags: ["primary", "secondary"], primaryMuscles: ["lats", "upper_back"], secondaryMuscles: ["biceps"], isHeavyCompound: false, legDominant: false },
  19: { emphasisTags: ["pull"], roleTags: ["accessory"], primaryMuscles: ["biceps"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
  20: { emphasisTags: ["push"], roleTags: ["accessory"], primaryMuscles: ["triceps"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
  21: { emphasisTags: ["push"], roleTags: ["accessory"], primaryMuscles: ["triceps"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
  22: { emphasisTags: ["push"], roleTags: ["accessory"], primaryMuscles: ["shoulders"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
  23: { emphasisTags: ["pull"], roleTags: ["accessory"], primaryMuscles: ["shoulders", "upper_back"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
  24: { emphasisTags: ["squat", "hinge"], roleTags: ["accessory"], primaryMuscles: ["quads"], secondaryMuscles: ["glutes"], isHeavyCompound: false, legDominant: true },
  25: { emphasisTags: ["mixed"], roleTags: ["core"], primaryMuscles: ["core"], secondaryMuscles: [], isHeavyCompound: false, legDominant: false },
};

export async function ensureWorkoutPlanForDate(
  client: PoolClient,
  userId: string,
  isoDate: string
) {
  const profile = await ensureSchedulerProfile(client, userId);

  const existingRes = await client.query<{ plan_session_id: string; session_type: string }>(
    `select plan_session_id, session_type
     from plan_sessions
     where user_id = $1 and block_id = $2 and date = $3
     limit 1`,
    [userId, profile.block_id, isoDate]
  );

  if ((existingRes.rowCount ?? 0) > 0) {
    const sessionId = existingRes.rows[0]?.plan_session_id ?? null;
    if (!sessionId) return null;

    // Reuse any existing session that already has exercises, regardless of session_type.
    // This covers both legacy (Mon/Tue/etc.) and new (push/pull/squat/hinge/mixed) schedulers,
    // and prevents a duplicate-key crash when a legacy session is already performed and the
    // conditional DELETE would be a no-op before the INSERT below.
    const activeExerciseCount = await countActivePlanExercises(client, sessionId);
    if (activeExerciseCount > 0) return sessionId;

    // Only delete+regenerate when the session is empty AND not yet performed.
    const delRes = await client.query(
      `delete from plan_sessions
       where plan_session_id = $1
         and performed_at is null`,
      [sessionId]
    );
    // If the delete was a no-op (session was performed), keep the existing row instead of
    // colliding on the unique constraint below.
    if ((delRes.rowCount ?? 0) === 0) return sessionId;
  }

  const exerciseRows = await loadExerciseRows(client);
  const exerciseLibrary = buildSchedulerExerciseLibrary(exerciseRows);
  const completedWorkouts = await loadCompletedWorkoutsForScheduler(client, userId);
  const schedulerState = parseSchedulerState(profile.progression_state);

  const planned = generateNextWorkout({
    exerciseLibrary,
    completedWorkouts,
    schedulerState,
    currentDate: `${isoDate}T00:00:00Z`,
  } satisfies GenerateNextWorkoutInput);

  return insertPlannedWorkout(client, {
    userId,
    blockId: profile.block_id,
    currentBlockWeek: profile.current_block_week,
    isoDate,
    planned,
    exerciseRows,
  });
}

export async function syncCompletedWorkoutAndState(
  client: PoolClient,
  userId: string,
  sessionId: string
) {
  const sessionRes = await client.query<SessionRow>(
    `select plan_session_id,
            date::text as date,
            session_type,
            cardio_minutes,
            cardio_saved_at::text as cardio_saved_at
     from plan_sessions
     where plan_session_id = $1 and user_id = $2`,
    [sessionId, userId]
  );

  if ((sessionRes.rowCount ?? 0) === 0) {
    await refreshSchedulerState(client, userId);
    return;
  }

  const session = sessionRes.rows[0];
  const emphasis = normalizeSessionType(session.session_type);
  if (!emphasis) {
    await refreshSchedulerState(client, userId);
    return;
  }

  const exerciseRows = await loadExerciseRows(client);
  const exerciseLibrary = buildSchedulerExerciseLibrary(exerciseRows);
  const exerciseMap = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));

  const sessionExerciseCounts = await loadSessionExerciseCounts(client, sessionId, userId);

  const activeExercises = sessionExerciseCounts.filter((row) => !row.skipped_at);
  const skippedExerciseIds = sessionExerciseCounts
    .filter((row) => Boolean(row.skipped_at))
    .map((row) => String(row.exercise_id));
  const completedExerciseIds = sessionExerciseCounts
    .filter((row) => row.completed_sets > 0)
    .map((row) => String(row.exercise_id));

  const resistanceComplete =
    activeExercises.length > 0 &&
    activeExercises.every((row) => Number(row.completed_sets) >= Number(row.prescribed_sets));
  const cardioComplete = Boolean(session.cardio_saved_at);

  if (!resistanceComplete || !cardioComplete) {
    await deleteCompletedWorkoutIfTableExists(client, userId, sessionId);
    await refreshSchedulerState(client, userId);
    return;
  }

  const legDominant =
    emphasis === "squat" ||
    emphasis === "hinge" ||
    completedExerciseIds.some((exerciseId) => exerciseMap.get(exerciseId)?.legDominant);

  const completedAtRes = await client.query<{ performed_at: string | null }>(
    `select performed_at::text as performed_at
     from plan_sessions
     where plan_session_id = $1`,
    [sessionId]
  );
  const completedAt = completedAtRes.rows[0]?.performed_at || `${session.date}T00:00:00Z`;

  await upsertCompletedWorkoutIfTableExists(client, {
    userId,
    sessionId,
    completedAt,
    emphasis,
    legDominant,
    completedExerciseIds,
    skippedExerciseIds,
  });

  await refreshSchedulerState(client, userId);
}

export async function incrementUnmetWorkForSkippedExercise(
  client: PoolClient,
  userId: string,
  exerciseId: number
) {
  const exerciseRows = await loadExerciseRows(client);
  const exerciseLibrary = buildSchedulerExerciseLibrary(exerciseRows);
  const exercise = exerciseLibrary.find((item) => item.id === String(exerciseId));
  if (!exercise) return;

  const profile = await ensureSchedulerProfile(client, userId);
  const schedulerState = parseSchedulerState(profile.progression_state);
  const nextUnmet = { ...(schedulerState.unmetWorkByMuscle || {}) };
  for (const muscle of exercise.primaryMuscles) {
    nextUnmet[muscle] = (nextUnmet[muscle] || 0) + 1;
  }

  const updatedState: SchedulerState = {
    ...schedulerState,
    unmetWorkByMuscle: nextUnmet,
  };

  await client.query(
    `update user_profile
     set progression_state = $1::jsonb,
         updated_at = now()
     where user_id = $2`,
    [JSON.stringify(updatedState), userId]
  );
}

export function parseSchedulerState(input: unknown): SchedulerState {
  const empty: SchedulerState = {
    lastTrainedAtByMuscle: {},
    lastHeavyCompoundAtByMuscle: {},
    hardReadyAtByMuscle: {},
    softReadyAtByMuscle: {},
    fatigueLoadByMuscle: {},
    lastPerformedAtByExercise: {},
    recentExerciseIds: [],
    recentMovementPatternHistory: [],
    recentEmphasisHistory: [],
    recentLegDominantDays: [],
    unmetWorkByMuscle: {},
    unmetWorkByMovementFamily: {},
    cardioSessionsLast7Days: 0,
  };

  if (!input || typeof input !== "object" || Array.isArray(input)) return empty;

  const v = input as Partial<SchedulerState>;
  return {
    lastTrainedAtByMuscle:       v.lastTrainedAtByMuscle       ?? {},
    lastHeavyCompoundAtByMuscle: v.lastHeavyCompoundAtByMuscle ?? {},
    hardReadyAtByMuscle:         v.hardReadyAtByMuscle         ?? {},
    softReadyAtByMuscle:         v.softReadyAtByMuscle         ?? {},
    fatigueLoadByMuscle:         v.fatigueLoadByMuscle         ?? {},
    lastPerformedAtByExercise:   v.lastPerformedAtByExercise   ?? {},
    recentExerciseIds:           Array.isArray(v.recentExerciseIds)
      ? v.recentExerciseIds.filter((s): s is string => typeof s === "string")
      : [],
    recentMovementPatternHistory: Array.isArray(v.recentMovementPatternHistory)
      ? v.recentMovementPatternHistory.filter((s): s is string => typeof s === "string")
      : [],
    recentEmphasisHistory: Array.isArray(v.recentEmphasisHistory)
      ? v.recentEmphasisHistory.filter(isSessionEmphasis)
      : [],
    recentLegDominantDays: Array.isArray(v.recentLegDominantDays)
      ? v.recentLegDominantDays.filter((s): s is string => typeof s === "string")
      : [],
    unmetWorkByMuscle:         v.unmetWorkByMuscle         ?? {},
    unmetWorkByMovementFamily: v.unmetWorkByMovementFamily ?? {},
    cardioSessionsLast7Days:   typeof v.cardioSessionsLast7Days === "number"
      ? v.cardioSessionsLast7Days
      : 0,
  };
}

async function refreshSchedulerState(client: PoolClient, userId: string) {
  const profile = await ensureSchedulerProfile(client, userId);
  const existing = parseSchedulerState(profile.progression_state);
  const completedWorkouts = await loadCompletedWorkoutsForScheduler(client, userId);

  const nextState: SchedulerState = {
    lastTrainedAtByMuscle: {},
    lastHeavyCompoundAtByMuscle: {},
    hardReadyAtByMuscle: {},
    softReadyAtByMuscle: {},
    fatigueLoadByMuscle: {},
    lastPerformedAtByExercise: {},
    recentExerciseIds: [],
    recentMovementPatternHistory: [],
    recentEmphasisHistory: [],
    recentLegDominantDays: [],
    unmetWorkByMuscle: existing.unmetWorkByMuscle ?? {},
    unmetWorkByMovementFamily: existing.unmetWorkByMovementFamily ?? {},
    cardioSessionsLast7Days: 0,
  };

  const exerciseRows = await loadExerciseRows(client);
  const exerciseLibrary = buildSchedulerExerciseLibrary(exerciseRows);
  const exerciseMap = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));

  for (const workout of completedWorkouts.sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
    nextState.recentEmphasisHistory.push(workout.emphasis);
    if (workout.legDominant) {
      nextState.recentLegDominantDays.push(workout.completedAt);
    }
    if (workout.cardioCompleted && hoursBetween(workout.completedAt, new Date().toISOString()) <= 24 * 7) {
      nextState.cardioSessionsLast7Days += 1;
    }

    for (const exerciseId of workout.completedExerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) continue;
      nextState.lastPerformedAtByExercise[exerciseId] = laterTimestamp(
        nextState.lastPerformedAtByExercise[exerciseId],
        workout.completedAt
      ) || workout.completedAt;
      for (const muscle of exercise.primaryMuscles) {
        nextState.lastTrainedAtByMuscle[muscle] = laterTimestamp(
          nextState.lastTrainedAtByMuscle[muscle],
          workout.completedAt
        ) || workout.completedAt;
        if (exercise.isHeavyCompound) {
          nextState.lastHeavyCompoundAtByMuscle![muscle] = laterTimestamp(
            nextState.lastHeavyCompoundAtByMuscle?.[muscle],
            workout.completedAt
          ) || workout.completedAt;
        }
      }
    }
  }

  nextState.recentEmphasisHistory = nextState.recentEmphasisHistory.slice(-6);
  nextState.recentLegDominantDays = nextState.recentLegDominantDays.slice(-3);

  await client.query(
    `update user_profile
     set progression_state = $1::jsonb,
         updated_at = now()
     where user_id = $2`,
    [JSON.stringify(nextState), userId]
  );
}

async function insertPlannedWorkout(
  client: PoolClient,
  input: {
    userId: string;
    blockId: string;
    currentBlockWeek: number;
    isoDate: string;
    planned: PlannedWorkout;
    exerciseRows: ExerciseRow[];
  }
) {
  const cardioSavedAt = input.planned.addCardio ? null : new Date().toISOString();
  const sessionRes = await client.query<{ plan_session_id: string }>(
    `insert into plan_sessions
      (user_id, block_id, week_in_block, date, session_type, is_required, is_deload, cardio_minutes, cardio_saved_at)
     values
      ($1, $2, $3, $4, $5, true, false, $6, $7)
     returning plan_session_id`,
    [
      input.userId,
      input.blockId,
      input.currentBlockWeek,
      input.isoDate,
      input.planned.emphasis,
      input.planned.cardioMinutes,
      cardioSavedAt,
    ]
  ).catch(async (error) => {
    if (!isMissingSessionTypeEnumValue(error)) throw error;

    return client.query<{ plan_session_id: string }>(
      `insert into plan_sessions
        (user_id, block_id, week_in_block, date, session_type, is_required, is_deload, cardio_minutes, cardio_saved_at)
       values
        ($1, $2, $3, $4, $5, true, false, $6, $7)
       returning plan_session_id`,
      [
        input.userId,
        input.blockId,
        input.currentBlockWeek,
        input.isoDate,
        legacySessionTypeForEmphasis(input.planned.emphasis),
        input.planned.cardioMinutes,
        cardioSavedAt,
      ]
    );
  });

  const sessionId = sessionRes.rows[0]?.plan_session_id;
  if (!sessionId) {
    throw new Error("planned_session_insert_failed");
  }

  const exerciseRowById = new Map(input.exerciseRows.map((row) => [String(row.exercise_id), row]));
  const previousByExercise = await loadLatestPerformanceByExercise(
    client,
    input.planned.exercises.map((exercise) => Number(exercise.exerciseId))
  );

  for (const exercise of input.planned.exercises) {
    const row = exerciseRowById.get(exercise.exerciseId);
    if (!row) continue;
    const previous = previousByExercise.get(Number(exercise.exerciseId));
    const planRole = exercise.role === "primary" ? "primary" : exercise.role === "secondary" ? "secondary" : "accessory";
    const prescription = getPrescriptionForRole(exercise.role);

    // Progressive overload: bump load when last top set hit the top of the rep range;
    // reduce when it fell below the bottom.
    const loadIncrement = Number(row.load_increment_lb ?? 5);
    let nextTargetLoad: number | null = previous?.load ?? null;
    if (nextTargetLoad !== null && previous) {
      if (previous.reps >= prescription.repsMax) {
        nextTargetLoad = nextTargetLoad + loadIncrement;
      } else if (previous.reps < prescription.repsMin) {
        nextTargetLoad = Math.max(0, nextTargetLoad - loadIncrement);
      }
    }

    await client.query(
      `insert into plan_exercises
        (plan_session_id, exercise_id, targeted_primary_muscle, targeted_secondary_muscle,
         role, prescribed_sets, prescribed_reps_min, prescribed_reps_max, prescribed_load,
         backoff_percent, rest_seconds, tempo, previous_performance_id, prev_load, prev_reps,
         prev_performed_at, prev_estimated_1rm, next_target_load)
       values
        ($1, $2, $3, $4, $5, $6, $7, $8, 0, null, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        sessionId,
        Number(exercise.exerciseId),
        row.default_targeted_primary_muscle,
        row.default_targeted_secondary_muscle,
        planRole,
        prescription.sets,
        prescription.repsMin,
        prescription.repsMax,
        prescription.restSeconds,
        TEMPO,
        previous?.id ?? null,
        previous?.load ?? null,
        previous?.reps ?? null,
        previous?.performed_at ?? null,
        previous?.estimated_1rm ?? null,
        nextTargetLoad,
      ]
    );
  }

  return sessionId;
}

async function loadCompletedWorkoutsForScheduler(client: PoolClient, userId: string) {
  const storedRes = await client.query<CompletedWorkoutRow>(
    `select session_id,
            completed_at::text as completed_at,
            emphasis,
            leg_dominant,
            completed_exercise_ids,
            skipped_exercise_ids,
            cardio_completed
     from completed_workouts
     where user_id = $1
     order by completed_at asc`,
    [userId]
  ).catch((error) => {
    if (isMissingRelation(error, "completed_workouts")) {
      return { rows: [] } as { rows: CompletedWorkoutRow[] };
    }
    throw error;
  });

  const workouts: CompletedWorkout[] = storedRes.rows.map((row) => ({
    completedAt: row.completed_at,
    emphasis: normalizeSessionType(row.emphasis) || "mixed",
    legDominant: row.leg_dominant,
    completedExerciseIds: toStringArray(row.completed_exercise_ids),
    skippedExerciseIds: toStringArray(row.skipped_exercise_ids),
    cardioCompleted: row.cardio_completed,
  }));

  const legacyRes = await client.query<LegacySessionRow>(
    `select ps.plan_session_id as session_id,
            ps.performed_at::text as completed_at,
            ps.session_type,
            (ps.cardio_saved_at is not null) as cardio_completed
     from plan_sessions ps
     left join completed_workouts cw
       on cw.session_id = ps.plan_session_id
     where ps.user_id = $1
       and ps.performed_at is not null
       and cw.session_id is null
     order by ps.performed_at asc`,
    [userId]
  ).catch(async (error) => {
    if (!isMissingRelation(error, "completed_workouts")) throw error;
    return client.query<LegacySessionRow>(
      `select ps.plan_session_id as session_id,
              ps.performed_at::text as completed_at,
              ps.session_type,
              (ps.cardio_saved_at is not null) as cardio_completed
       from plan_sessions ps
       where ps.user_id = $1
         and ps.performed_at is not null
       order by ps.performed_at asc`,
      [userId]
    );
  });

  const legacySessionIds = legacyRes.rows.map((row) => row.session_id);
  const logsBySession = new Map<string, string[]>();
  const skippedBySession = new Map<string, string[]>();

  if (legacySessionIds.length > 0) {
    const logsRes = await client.query<{ session_id: string; exercise_id: number }>(
      `select distinct session_id, exercise_id
       from set_logs
       where user_id = $1 and session_id = any($2::uuid[])`,
      [userId, legacySessionIds]
    );
    for (const row of logsRes.rows) {
      const existing = logsBySession.get(row.session_id) || [];
      existing.push(String(row.exercise_id));
      logsBySession.set(row.session_id, existing);
    }

    try {
      const skippedRes = await client.query<{ plan_session_id: string; exercise_id: number }>(
        `select plan_session_id, exercise_id
         from plan_exercises
         where plan_session_id = any($1::uuid[])
           and skipped_at is not null`,
        [legacySessionIds]
      );
      for (const row of skippedRes.rows) {
        const existing = skippedBySession.get(row.plan_session_id) || [];
        existing.push(String(row.exercise_id));
        skippedBySession.set(row.plan_session_id, existing);
      }
    } catch (error) {
      if (!isMissingColumn(error, "skipped_at")) throw error;
    }
  }

  for (const row of legacyRes.rows) {
    const emphasis = normalizeSessionType(row.session_type);
    if (!emphasis) continue;
    workouts.push({
      completedAt: row.completed_at,
      emphasis,
      legDominant: emphasis === "squat" || emphasis === "hinge",
      completedExerciseIds: logsBySession.get(row.session_id) || [],
      skippedExerciseIds: skippedBySession.get(row.session_id) || [],
      cardioCompleted: row.cardio_completed,
    });
  }

  return workouts;
}

async function countActivePlanExercises(client: PoolClient, sessionId: string) {
  try {
    const res = await client.query<{ count: string }>(
      `select count(*)::text as count
       from plan_exercises
       where plan_session_id = $1
         and skipped_at is null`,
      [sessionId]
    );
    return Number(res.rows[0]?.count ?? 0);
  } catch (error) {
    if (!isMissingColumn(error, "skipped_at")) throw error;
    const fallbackRes = await client.query<{ count: string }>(
      `select count(*)::text as count
       from plan_exercises
       where plan_session_id = $1`,
      [sessionId]
    );
    return Number(fallbackRes.rows[0]?.count ?? 0);
  }
}

async function loadSessionExerciseCounts(
  client: PoolClient,
  sessionId: string,
  userId: string
) {
  try {
    const res = await client.query<SessionExerciseCountRow>(
      `select pe.exercise_id,
              pe.prescribed_sets,
              pe.skipped_at::text as skipped_at,
              coalesce(count(sl.id), 0)::int as completed_sets
       from plan_exercises pe
       left join set_logs sl
         on sl.session_id = pe.plan_session_id
        and sl.exercise_id = pe.exercise_id
        and sl.user_id = $2
       where pe.plan_session_id = $1
       group by pe.exercise_id, pe.prescribed_sets, pe.skipped_at`,
      [sessionId, userId]
    );
    return res.rows;
  } catch (error) {
    if (!isMissingColumn(error, "skipped_at")) throw error;
    const fallbackRes = await client.query<SessionExerciseCountRow>(
      `select pe.exercise_id,
              pe.prescribed_sets,
              null::text as skipped_at,
              coalesce(count(sl.id), 0)::int as completed_sets
       from plan_exercises pe
       left join set_logs sl
         on sl.session_id = pe.plan_session_id
        and sl.exercise_id = pe.exercise_id
        and sl.user_id = $2
       where pe.plan_session_id = $1
       group by pe.exercise_id, pe.prescribed_sets`,
      [sessionId, userId]
    );
    return fallbackRes.rows;
  }
}

async function deleteCompletedWorkoutIfTableExists(
  client: PoolClient,
  userId: string,
  sessionId: string
) {
  try {
    await client.query(
      `delete from completed_workouts
       where user_id = $1 and session_id = $2`,
      [userId, sessionId]
    );
  } catch (error) {
    if (!isMissingRelation(error, "completed_workouts")) throw error;
  }
}

async function upsertCompletedWorkoutIfTableExists(
  client: PoolClient,
  input: {
    userId: string;
    sessionId: string;
    completedAt: string;
    emphasis: SessionEmphasis;
    legDominant: boolean;
    completedExerciseIds: string[];
    skippedExerciseIds: string[];
  }
) {
  try {
    await client.query(
      `insert into completed_workouts
        (user_id, session_id, completed_at, emphasis, leg_dominant, completed_exercise_ids, skipped_exercise_ids, cardio_completed)
       values
        ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       on conflict (session_id)
       do update set
         completed_at = excluded.completed_at,
         emphasis = excluded.emphasis,
         leg_dominant = excluded.leg_dominant,
         completed_exercise_ids = excluded.completed_exercise_ids,
         skipped_exercise_ids = excluded.skipped_exercise_ids,
         cardio_completed = excluded.cardio_completed`,
      [
        input.userId,
        input.sessionId,
        input.completedAt,
        input.emphasis,
        input.legDominant,
        JSON.stringify(input.completedExerciseIds),
        JSON.stringify(input.skippedExerciseIds),
        true,
      ]
    );
  } catch (error) {
    if (!isMissingRelation(error, "completed_workouts")) throw error;
  }
}

async function ensureSchedulerProfile(client: PoolClient, userId: string) {
  let profileRes = await client.query<ProfileRow>(
    `select user_id,
            start_date::text as start_date,
            block_id,
            current_block_week,
            progression_state,
            skipped_dates
     from user_profile
     where user_id = $1
     for update`,
    [userId]
  );

  if ((profileRes.rowCount ?? 0) === 0) {
    const blockId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    await client.query(
      `insert into user_profile
        (user_id, start_date, block_id, current_block_week, bias_balance, adaptive_enabled,
         primary_lift_map, secondary_lift_map, progression_state, rest_inserted_by_week, skipped_dates)
       values
        ($1, $2, $3, 1, 0, false, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::text[])`,
      [userId, today, blockId]
    );

    await client.query(
      `insert into blocks
        (block_id, user_id, start_date, generation_rules_hash, pending_applied)
       values
        ($1, $2, $3, 'scheduler-v2', false)
       on conflict (block_id) do nothing`,
      [blockId, userId, today]
    );

    profileRes = await client.query<ProfileRow>(
      `select user_id,
              start_date::text as start_date,
              block_id,
              current_block_week,
              progression_state,
              skipped_dates
       from user_profile
       where user_id = $1
       for update`,
      [userId]
    );
  }

  const profile = profileRes.rows[0];
  await client.query(
    `insert into blocks
      (block_id, user_id, start_date, generation_rules_hash, pending_applied)
     values
      ($1, $2, $3::date, 'scheduler-v2', false)
     on conflict (block_id) do nothing`,
    [profile.block_id, userId, profile.start_date]
  );
  return profile;
}

async function loadExerciseRows(client: PoolClient) {
  const res = await client.query<ExerciseRow>(
    `select exercise_id,
            name,
            movement_pattern,
            default_targeted_primary_muscle,
            default_targeted_secondary_muscle,
            equipment_type,
            coalesce(load_increment_lb, 5) as load_increment_lb,
            alt_1_exercise_id,
            alt_2_exercise_id,
            coalesce(alt_3_exercise_id, null) as alt_3_exercise_id,
            coalesce(category, null) as category,
            coalesce(fatigue_score, 3) as fatigue_score,
            coalesce(complexity_score, 3) as complexity_score,
            coalesce(leg_dominant, false) as leg_dominant,
            coalesce(suitable_slots, ARRAY['primary','secondary','accessory']) as suitable_slots,
            coalesce(emphasis_tags, ARRAY[]::text[]) as emphasis_tags,
            coalesce(primary_muscle_groups, '[]'::jsonb) as primary_muscle_groups,
            coalesce(secondary_muscle_groups, '[]'::jsonb) as secondary_muscle_groups,
            coalesce(is_enabled, true) as is_enabled
     from exercises
     order by exercise_id asc`
  ).catch(async (err) => {
    // If migration 0019 columns don't exist yet, fall back to basic columns
    if (isPgError(err) && err.code === "42703") {
      return client.query<ExerciseRow>(
        `select exercise_id, name, movement_pattern,
                default_targeted_primary_muscle, default_targeted_secondary_muscle,
                equipment_type,
                5 as load_increment_lb,
                alt_1_exercise_id, alt_2_exercise_id,
                null as alt_3_exercise_id, null as category,
                3 as fatigue_score, 3 as complexity_score,
                false as leg_dominant,
                ARRAY['primary','secondary','accessory'] as suitable_slots,
                ARRAY[]::text[] as emphasis_tags,
                '[]'::jsonb as primary_muscle_groups,
                '[]'::jsonb as secondary_muscle_groups,
                true as is_enabled
         from exercises
         order by exercise_id asc`
      );
    }
    throw err;
  });
  return res.rows;
}

function toMuscleArray(raw: unknown): Muscle[] {
  if (Array.isArray(raw)) return raw.filter((v): v is Muscle => typeof v === "string");
  if (typeof raw === "string") {
    try { return toMuscleArray(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string") {
    try { return toStringArray(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function buildSchedulerExerciseLibrary(rows: ExerciseRow[]): Exercise[] {
  const exercises: Exercise[] = [];

  for (const row of rows) {
    // Try to use DB metadata first; fall back to hardcoded map for old exercises
    const dbPrimary   = toMuscleArray(row.primary_muscle_groups);
    const dbSecondary = toMuscleArray(row.secondary_muscle_groups);
    const dbEmphasis  = toStringArray(row.emphasis_tags).filter(isSessionEmphasis);
    const dbSlots     = (row.suitable_slots ?? []).filter(
      (s): s is ExerciseSlotType => s === "primary" || s === "secondary" || s === "accessory"
    );
    const hasMeta = dbPrimary.length > 0 || dbEmphasis.length > 0;
    const fallback = EXERCISE_META_FALLBACK[row.exercise_id];
    if (!hasMeta && !fallback) continue; // skip unknown exercises

    const primaryMuscles   = hasMeta ? dbPrimary   : (fallback?.primaryMuscles   ?? []);
    const secondaryMuscles = hasMeta ? dbSecondary : (fallback?.secondaryMuscles ?? []);
    const emphasisTags     = hasMeta ? dbEmphasis  : (fallback?.emphasisTags     ?? []);
    const suitableSlots    = dbSlots.length > 0 ? dbSlots : deriveSlots(fallback);
    const fatigueScore     = (row.fatigue_score ?? 3) as 1|2|3|4|5;
    const legDominant      = hasMeta ? Boolean(row.leg_dominant) : (fallback?.legDominant ?? false);
    const isHeavyCompound  = fatigueScore >= 4 && suitableSlots.includes("primary");

    const alternatives = [row.alt_1_exercise_id, row.alt_2_exercise_id, row.alt_3_exercise_id]
      .filter((v): v is number => Number.isInteger(v) && v !== null)
      .map(String);

    exercises.push({
      id: String(row.exercise_id),
      name: row.name,
      category: row.category ?? "unknown",
      emphasisTags,
      suitableSlots,
      roleTags: [...suitableSlots],
      primaryMuscles,
      secondaryMuscles,
      fatigueScore,
      complexityScore: (row.complexity_score ?? 3) as 1|2|3|4|5,
      isHeavyCompound,
      legDominant,
      alternatives,
      enabled: row.is_enabled ?? true,
    });
  }

  return exercises;
}

function deriveSlots(meta: ExerciseSchedulerMeta | undefined): ExerciseSlotType[] {
  if (!meta) return ["accessory"];
  return meta.roleTags.filter(
    (r): r is ExerciseSlotType => r === "primary" || r === "secondary" || r === "accessory"
  );
}

// ExerciseSlotType is imported from types via the Muscle import at the top

async function loadLatestPerformanceByExercise(client: PoolClient, exerciseIds: number[]) {
  if (exerciseIds.length === 0) return new Map<number, {
    id: string;
    load: number;
    reps: number;
    performed_at: string;
    estimated_1rm: number;
  }>();

  const res = await client.query<{
    id: string;
    exercise_id: number;
    load: number | string;
    reps: number;
    performed_at: string;
    estimated_1rm: number | string;
  }>(
    `select distinct on (exercise_id)
            id,
            exercise_id,
            load,
            reps,
            performed_at::text as performed_at,
            estimated_1rm
     from top_set_history
     where exercise_id = any($1::int[])
     order by exercise_id, performed_at desc`,
    [exerciseIds]
  );

  return new Map(
    res.rows.map((row) => [
      Number(row.exercise_id),
      {
        id: row.id,
        load: Number(row.load),
        reps: Number(row.reps),
        performed_at: row.performed_at,
        estimated_1rm: Number(row.estimated_1rm),
      },
    ])
  );
}

function getPrescriptionForRole(role: ExerciseRole) {
  if (role === "primary") {
    return { sets: PRIMARY_SETS, repsMin: 5, repsMax: 8, restSeconds: 180 };
  }
  if (role === "secondary") {
    return { sets: SECONDARY_SETS, repsMin: 6, repsMax: 10, restSeconds: 120 };
  }
  if (role === "core") {
    return { sets: ACCESSORY_SETS, repsMin: 10, repsMax: 15, restSeconds: 60 };
  }
  return { sets: ACCESSORY_SETS, repsMin: 8, repsMax: 12, restSeconds: 90 };
}

function normalizeSessionType(value: string): SessionEmphasis | null {
  if (isSessionEmphasis(value)) return value;
  if (value === "Mon" || value === "Fri") return "push";
  if (value === "Wed") return "pull";
  if (value === "Tue" || value === "Sat") return "squat";
  if (value === "Thu") return "hinge";
  return null;
}

function legacySessionTypeForEmphasis(emphasis: SessionEmphasis) {
  switch (emphasis) {
    case "push":
      return "Mon";
    case "pull":
      return "Wed";
    case "squat":
      return "Tue";
    case "hinge":
      return "Thu";
    case "mixed":
      return "Fri";
  }
}

function isSessionEmphasis(value: unknown): value is SessionEmphasis {
  return value === "push" || value === "pull" || value === "squat" || value === "hinge" || value === "mixed";
}

function isPgError(error: unknown): error is { code?: string; message?: string } {
  return Boolean(error) && typeof error === "object";
}

function isMissingRelation(error: unknown, relation: string) {
  return isPgError(error) && error.code === "42P01" && String(error.message || "").includes(relation);
}

function isMissingColumn(error: unknown, column: string) {
  return isPgError(error) && error.code === "42703" && String(error.message || "").includes(column);
}

function isMissingSessionTypeEnumValue(error: unknown) {
  return isPgError(error) && error.code === "22P02" && String(error.message || "").includes("session_type_enum");
}

// Note: toStringArray above handles jsonb arrays; this is the legacy variant kept for
// completedExerciseIds / skippedExerciseIds which are already plain JS arrays from pg.

function laterTimestamp(a?: string | null, b?: string | null) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function hoursBetween(from: string, to: string) {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60));
}
