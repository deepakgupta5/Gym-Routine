import {
  ACCESSORY_POOLS,
  CARDIO_BASELINE_MINUTES,
  REPS,
  REST_SECONDS,
  SESSION_TEMPLATES,
  SETS_BASELINE,
  SETS_DELOAD,
  TEMPO,
} from "@/lib/engine/constants";
import { PlanExerciseInput, PlanOutput, SessionInput } from "@/lib/engine/types";
import { addDays, sessionKey, toDateString } from "@/lib/engine/utils";
import {
  getCatalogIndexMap,
  normalizePrimaryLiftMap,
} from "@/lib/engine/rotation";

type ExerciseRow = {
  exercise_id: number;
  name: string;
  movement_pattern: string;
  default_targeted_primary_muscle: string;
  default_targeted_secondary_muscle?: string | null;
  equipment_type: string;
  load_increment?: string;
  load_increment_lb?: number | null;
  load_semantic?: string | null;
  alt_1_exercise_id?: number | null;
  alt_2_exercise_id?: number | null;
};

type GenerateInput = {
  userProfile: {
    start_date: string;
    block_id: string;
    bias_balance?: number | null;
    primary_lift_map?: any;
  };
  exercises: ExerciseRow[];
  blockId: string;
};

function rotationIndexForWeek(week: number) {
  return Math.floor((week - 1) / 4);
}

function biasIncrements(biasBalance: number) {
  const abs = Math.abs(biasBalance);
  if (abs >= 4) return 2;
  if (abs >= 2) return 1;
  return 0;
}

function isBiasTarget(sessionType: string, biasBalance: number) {
  if (biasBalance > 0) return sessionType === "Mon" || sessionType === "Wed";
  if (biasBalance < 0) return sessionType === "Tue" || sessionType === "Thu";
  return false;
}

function applyBiasSets(
  sessionType: string,
  isDeload: boolean,
  biasBalance: number,
  basePrimary: number,
  baseSecondary: number
) {
  const increments = isBiasTarget(sessionType, biasBalance)
    ? biasIncrements(biasBalance)
    : 0;

  const primary = Math.min(5, basePrimary + increments);
  const secondary = Math.min(4, baseSecondary + increments);

  return { primary, secondary };
}

function pickFromPool(
  pool: number[],
  startIndex: number,
  used: Set<number>,
  exerciseById: Map<number, ExerciseRow>
) {
  if (!pool || pool.length === 0) {
    throw new Error("exercise_pool_empty");
  }

  const candidate = pool[startIndex % pool.length];
  if (!used.has(candidate)) return candidate;

  const meta = exerciseById.get(candidate);
  const alt1 = meta?.alt_1_exercise_id ?? null;
  const alt2 = meta?.alt_2_exercise_id ?? null;

  if (alt1 && !used.has(alt1)) return alt1;
  if (alt2 && !used.has(alt2)) return alt2;

  for (let i = 0; i < pool.length; i++) {
    const id = pool[(startIndex + i) % pool.length];
    if (!used.has(id)) return id;
  }

  throw new Error("accessory_pool_exhausted");
}

export function generateInitialBlock(input: GenerateInput): PlanOutput {
  const exerciseById = new Map(input.exercises.map((e) => [e.exercise_id, e]));
  const sessions: SessionInput[] = [];
  const exercises: PlanExerciseInput[] = [];

  const startDate = new Date(input.userProfile.start_date);
  const biasBalance = Number(input.userProfile.bias_balance ?? 0);
  const primaryMap = normalizePrimaryLiftMap(input.userProfile.primary_lift_map);
  const indexMap = getCatalogIndexMap(primaryMap);

  for (let week = 1; week <= 8; week++) {
    const isDeload = week === 4 || week === 8;
    const accessoryIndex = rotationIndexForWeek(week);

    for (const t of SESSION_TEMPLATES) {
      const date = toDateString(addDays(startDate, (week - 1) * 7 + t.offset));
      const session: SessionInput = {
        date,
        session_type: t.day,
        week_in_block: week,
        is_required: t.is_required,
        is_deload: isDeload,
        cardio_minutes: t.cardio ? CARDIO_BASELINE_MINUTES : 0,
      };

      sessions.push(session);

      if (!t.primaryCatalog && !t.secondaryCatalog && !t.accessoryGroups) continue;

      const used = new Set<number>();
      const sessionKeyStr = sessionKey({ date, session_type: t.day });

      const basePrimary = isDeload ? SETS_DELOAD.primary : SETS_BASELINE.primary;
      const baseSecondary = isDeload ? SETS_DELOAD.secondary : SETS_BASELINE.secondary;
      const biasAdjusted = applyBiasSets(
        t.day,
        isDeload,
        biasBalance,
        basePrimary,
        baseSecondary
      );

      if (t.primaryCatalog) {
        const primaryIndex = t.primaryKey ? indexMap[t.primaryKey] : 0;
        const id = pickFromPool(t.primaryCatalog, primaryIndex, used, exerciseById);
        used.add(id);
        exercises.push({
          session_key: sessionKeyStr,
          exercise_id: id,
          targeted_primary_muscle: exerciseById.get(id)?.default_targeted_primary_muscle || "",
          targeted_secondary_muscle:
            exerciseById.get(id)?.default_targeted_secondary_muscle ?? null,
          role: "primary",
          prescribed_sets: biasAdjusted.primary,
          prescribed_reps_min: REPS.primary.min,
          prescribed_reps_max: REPS.primary.max,
          prescribed_load: 0,
          backoff_percent: 0.9,
          rest_seconds: REST_SECONDS.primary,
          tempo: TEMPO,
        });
      }

      if (t.secondaryCatalog) {
        const secondaryIndex = t.secondaryKey ? indexMap[t.secondaryKey] : 0;
        const id = pickFromPool(
          t.secondaryCatalog,
          secondaryIndex,
          used,
          exerciseById
        );
        used.add(id);
        exercises.push({
          session_key: sessionKeyStr,
          exercise_id: id,
          targeted_primary_muscle: exerciseById.get(id)?.default_targeted_primary_muscle || "",
          targeted_secondary_muscle:
            exerciseById.get(id)?.default_targeted_secondary_muscle ?? null,
          role: "secondary",
          prescribed_sets: biasAdjusted.secondary,
          prescribed_reps_min: REPS.secondary.min,
          prescribed_reps_max: REPS.secondary.max,
          prescribed_load: 0,
          backoff_percent: null,
          rest_seconds: REST_SECONDS.secondary,
          tempo: TEMPO,
        });
      }

      if (t.accessoryGroups && t.accessoryGroups.length > 0) {
        for (const group of t.accessoryGroups) {
          const pool = ACCESSORY_POOLS[group];
          const id = pickFromPool(pool, accessoryIndex, used, exerciseById);
          used.add(id);

          const baselineSets = SETS_BASELINE.accessory;
          const reduced = Math.max(1, Math.round(baselineSets * 0.7));
          const sets = isDeload ? reduced : baselineSets;

          exercises.push({
            session_key: sessionKeyStr,
            exercise_id: id,
            targeted_primary_muscle: exerciseById.get(id)?.default_targeted_primary_muscle || "",
            targeted_secondary_muscle:
              exerciseById.get(id)?.default_targeted_secondary_muscle ?? null,
            role: "accessory",
            prescribed_sets: sets,
            prescribed_reps_min: REPS.accessory.min,
            prescribed_reps_max: REPS.accessory.max,
            prescribed_load: 0,
            backoff_percent: null,
            rest_seconds: REST_SECONDS.accessory,
            tempo: TEMPO,
          });
        }
      }
    }
  }

  return { sessions, exercises };
}
