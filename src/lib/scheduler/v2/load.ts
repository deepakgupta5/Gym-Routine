// Load computation for v2 scheduler (PRD Section 4.4)

import type { V2ExerciseRow, V2LastTopSet, V2SlotRole } from "./types";
import { PRESCRIPTION, BACK_OFF_PERCENT } from "./constants";
import { roundToIncrement } from "@/lib/engine/progression";

/** Round a load value to the nearest 5 lb (used for seed values only). */
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
  /** True when the exercise is bodyweight -- render "Bodyweight" not "0 lb" in the UI. */
  bodyweight_mode: boolean;
}

/**
 * Compute the load prescription for a single exercise slot.
 *
 * Algorithm (PRD Section 4.4):
 * - Bodyweight exercises: topSetLoad = 0 (represents added load only).
 *   When prior load is 0 (bodyweight baseline), progression is rep-only --
 *   no load increment applied until the user explicitly adds external weight.
 * - No prior history (non-bodyweight): use seed_load_lb rounded to nearest 5;
 *   0 if no seed.
 * - Prior hit repsMax or above: add load_increment_lb (rounded to increment).
 * - Prior missed repsMin: subtract load_increment_lb.
 * - Otherwise: hold load.
 *
 * Rounding: progression and regression steps use roundToIncrement() so that
 * exercises with a 2.5 lb increment (e.g. OHP, cable) are not silently rounded
 * to the nearest 5. Seed values still use roundTo5 for a clean starting point.
 *
 * For primary and secondary slots (useBackOff=true):
 *   back_off_load = roundToIncrement(top_set_load * 0.90, increment)
 * For accessory slots (straight sets):
 *   back_off_load = top_set_load
 */
export function computeLoad(
  exercise: V2ExerciseRow,
  role: V2SlotRole,
  prior: V2LastTopSet | undefined
): LoadResult {
  const p = PRESCRIPTION[role];
  const increment = Number(exercise.load_increment_lb) || 5;
  const isBodyweight = exercise.uses_bodyweight === true;

  let topSetLoad: number;
  let rationale_code: string;
  let rationale_text: string;

  if (!prior) {
    if (isBodyweight) {
      // Bodyweight seed: 0 added load. Beat reps to earn added weight.
      topSetLoad = 0;
      rationale_code = "bodyweight_seed";
      rationale_text = "Bodyweight -- beat reps to earn added load";
    } else {
      topSetLoad = roundTo5(Math.max(0, exercise.seed_load_lb ?? 0));
      rationale_code = "seed_only";
      rationale_text = `${topSetLoad} lb, new exercise`;
    }
  } else {
    const prevLoad = Number(prior.last_load);
    const prevReps = Number(prior.last_reps);

    if (isBodyweight && prevLoad === 0) {
      // Bodyweight rep-only progression: hold load at 0 until user logs
      // a non-zero load (i.e. adds a weight belt/vest).
      topSetLoad = 0;
      rationale_code = "bodyweight_reps";
      rationale_text = `Bodyweight -- beat reps (${prevReps} last time)`;
    } else if (prevReps >= p.repsMax) {
      topSetLoad = roundToIncrement(prevLoad + increment, increment);
      rationale_code = "progression";
      rationale_text = `${topSetLoad} lb, up ${increment} lb (${prevLoad} lb x ${prevReps} last time)`;
    } else if (prevReps < p.repsMin) {
      topSetLoad = roundToIncrement(Math.max(0, prevLoad - increment), increment);
      rationale_code = "regression";
      rationale_text = `${topSetLoad} lb, down ${increment} lb (${prevLoad} lb x ${prevReps} last time)`;
    } else {
      topSetLoad = roundToIncrement(prevLoad, increment);
      rationale_code = "hold";
      rationale_text = `${topSetLoad} lb, hold (${prevReps} reps last time, beat it)`;
    }
  }

  // Zero floor
  topSetLoad = Math.max(0, topSetLoad);

  const backOffLoad = p.useBackOff
    ? roundToIncrement(Math.max(0, topSetLoad * BACK_OFF_PERCENT), increment)
    : topSetLoad;

  return {
    topSetLoad,
    topSetReps: p.topSetReps,
    backOffLoad,
    backOffReps: p.backOffReps,
    rationale_code,
    rationale_text,
    bodyweight_mode: isBodyweight && topSetLoad === 0,
  };
}
