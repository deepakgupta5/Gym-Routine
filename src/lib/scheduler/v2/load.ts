// Load computation for v2 scheduler (PRD Section 4.4)

import type { V2ExerciseRow, V2LastTopSet, V2SlotRole } from "./types";
import { PRESCRIPTION, BACK_OFF_PERCENT } from "./constants";

/** Round a load value to the nearest 5 lb. */
export function roundTo5(lb: number): number {
  return Math.round(lb / 5) * 5;
}

export interface LoadResult {
  topSetLoad: number;
  topSetReps: number;
  backOffLoad: number;
  backOffReps: number;
  rationale_code: string;
  rationale_text: string;
}

/**
 * Compute the load prescription for a single exercise slot.
 *
 * Algorithm (PRD Section 4.4):
 * - If no prior history: use seed_load_lb (or 0 for bodyweight exercises)
 * - If prior hit repsMax or above: add load_increment_lb
 * - If prior missed repsMin: subtract load_increment_lb
 * - Otherwise: hold load, beat the rep count
 *
 * For primary and secondary slots (useBackOff=true):
 *   back_off_load = round_to_5(top_set_load * 0.90)
 * For accessory slots (straight sets):
 *   back_off_load = top_set_load
 */
export function computeLoad(
  exercise: V2ExerciseRow,
  role: V2SlotRole,
  prior: V2LastTopSet | undefined
): LoadResult {
  const p = PRESCRIPTION[role];
  const increment = exercise.load_increment_lb || 5;

  let topSetLoad: number;
  let rationale_code: string;
  let rationale_text: string;

  if (!prior) {
    topSetLoad = roundTo5(Math.max(0, exercise.seed_load_lb ?? 0));
    rationale_code = "seed_only";
    rationale_text = `New exercise. Starting at seed load ${topSetLoad} lb.`;
  } else {
    const prevLoad = Number(prior.last_load);
    const prevReps = Number(prior.last_reps);

    if (prevReps >= p.repsMax) {
      topSetLoad = roundTo5(prevLoad + increment);
      rationale_code = "progression";
      rationale_text = `Up ${increment} lb: last session ${prevLoad} lb x ${prevReps} (hit top range).`;
    } else if (prevReps < p.repsMin) {
      topSetLoad = roundTo5(Math.max(0, prevLoad - increment));
      rationale_code = "regression";
      rationale_text = `Down ${increment} lb: last session ${prevLoad} lb x ${prevReps} (below min reps).`;
    } else {
      topSetLoad = roundTo5(prevLoad);
      rationale_code = "hold";
      rationale_text = `Hold ${prevLoad} lb: last session x ${prevReps}. Beat the rep count.`;
    }
  }

  // Zero floor
  topSetLoad = Math.max(0, topSetLoad);

  const backOffLoad = p.useBackOff
    ? roundTo5(Math.max(0, topSetLoad * BACK_OFF_PERCENT))
    : topSetLoad;

  return {
    topSetLoad,
    topSetReps: p.topSetReps,
    backOffLoad,
    backOffReps: p.backOffReps,
    rationale_code,
    rationale_text,
  };
}
