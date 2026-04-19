// Exercise selection for v2 scheduler (PRD Sections 4.2 + 4.3)

import crypto from "crypto";
import type { V2DayType, V2ExerciseRow, V2LastTopSet, V2SlotRole, V2SelectedExercise } from "./types";
import {
  V2_ROTATION,
  SLOT_ROLES,
  SLOT_COUNT,
  FULL_BODY_SLOT_ORIGIN,
  PRESCRIPTION,
  EQUIPMENT_GROUPS,
} from "./constants";
import { computeLoad } from "./load";

// ─── Day type selection ────────────────────────────────────────────────────────

/**
 * Select the next v2 day type given recent session history.
 *
 * Priority (PRD Section 4.2):
 * 1. Continue the rotation from the last performed v2 day type.
 * 2. If no v2 history, start at rotation index 0 (push_upper).
 *
 * Under-exposure priority (past Wednesday) is a TODO for a future phase.
 */
export function selectDayType(
  recentV2DayTypes: V2DayType[]
): V2DayType {
  if (recentV2DayTypes.length === 0) return V2_ROTATION[0];

  const last = recentV2DayTypes[recentV2DayTypes.length - 1];
  const lastIdx = V2_ROTATION.indexOf(last);
  if (lastIdx === -1) return V2_ROTATION[0];
  return V2_ROTATION[(lastIdx + 1) % V2_ROTATION.length];
}

// ─── Deterministic selection ───────────────────────────────────────────────────

/**
 * Given a non-empty array of candidates, pick one deterministically based on
 * (userId, isoDate, slotIndex) so the same date always produces the same plan.
 */
function deterministicPick<T>(
  candidates: T[],
  userId: string,
  isoDate: string,
  slotIndex: number
): T {
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}:${isoDate}:${slotIndex}`)
    .digest("hex");
  const idx = parseInt(hash.slice(0, 8), 16) % candidates.length;
  return candidates[idx];
}

// ─── Equipment tracking ────────────────────────────────────────────────────────

function buildEquipmentState(selectedSoFar: V2ExerciseRow[]) {
  const used = new Set(selectedSoFar.map((e) => e.equipment_type));
  return {
    used,
    unfulfilledGroups: EQUIPMENT_GROUPS.filter(
      (g) => g.required && !g.types.some((t) => used.has(t))
    ),
  };
}

/**
 * Returns the equipment types that the current slot MUST come from to still be
 * able to satisfy all required equipment groups given remaining slots.
 * Returns null if there is no binding constraint (free choice).
 */
function requiredEquipmentTypes(
  selectedSoFar: V2ExerciseRow[],
  slotsRemaining: number // including this slot
): Set<string> | null {
  const { unfulfilledGroups } = buildEquipmentState(selectedSoFar);
  if (unfulfilledGroups.length === 0) return null; // all groups satisfied
  if (unfulfilledGroups.length > slotsRemaining) return null; // can't satisfy, don't over-constrain
  if (unfulfilledGroups.length < slotsRemaining) return null; // slack remaining, free choice this slot

  // Exactly as many slots left as unfulfilled groups: this slot MUST cover one of them
  const required = new Set<string>();
  for (const g of unfulfilledGroups) {
    for (const t of g.types) required.add(t);
  }
  return required;
}

// ─── Candidate filtering ───────────────────────────────────────────────────────

function candidatesForSlot(
  all: V2ExerciseRow[],
  dayType: V2DayType,
  role: V2SlotRole,
  slotOrigin: V2DayType | "lower" | null, // used for full_body sub-slot
  recentExerciseIds: Set<number>,
  alreadySelected: V2ExerciseRow[],
  requiredEquipment: Set<string> | null
): V2ExerciseRow[] {
  const slotRoleFilter = (e: V2ExerciseRow) => {
    if (role === "primary") return e.suitable_slots.includes("primary");
    if (role === "secondary") return e.suitable_slots.includes("primary") || e.suitable_slots.includes("secondary");
    return e.suitable_slots.includes("accessory");
  };

  const dayTypeFilter = (e: V2ExerciseRow) => {
    if (dayType !== "full_body") {
      return e.allowed_day_types.includes(dayType);
    }
    // For full_body: exercise must have full_body in allowed_day_types
    if (!e.allowed_day_types.includes("full_body")) return false;
    if (slotOrigin === "lower") {
      return (
        e.allowed_day_types.includes("squat_lower") ||
        e.allowed_day_types.includes("hinge_lower")
      );
    }
    if (slotOrigin === "push_upper") return e.allowed_day_types.includes("push_upper");
    if (slotOrigin === "pull_upper") return e.allowed_day_types.includes("pull_upper");
    return true;
  };

  const selectedIds = new Set(alreadySelected.map((e) => e.exercise_id));

  let candidates = all.filter(
    (e) =>
      e.is_enabled &&
      e.muscle_primary !== "conditioning" &&
      dayTypeFilter(e) &&
      slotRoleFilter(e) &&
      !selectedIds.has(e.exercise_id)
  );

  // For primary/secondary slots, exclude exercises used recently (no-repeat rule)
  if (role === "primary" || role === "secondary") {
    const filtered = candidates.filter((e) => !recentExerciseIds.has(e.exercise_id));
    // Only apply the no-repeat filter if it doesn't empty the pool
    if (filtered.length > 0) candidates = filtered;
  }

  // Apply equipment constraint if binding
  if (requiredEquipment !== null) {
    const constrained = candidates.filter((e) => requiredEquipment.has(e.equipment_type));
    if (constrained.length > 0) candidates = constrained;
  }

  return candidates;
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score candidates to influence deterministic pick ordering.
 * Higher score = preferred. Sort descending before deterministicPick.
 *
 * Priority:
 * 1. Equipment preference: prefer equipment that fills an unfulfilled group
 * 2. User preference score (from exercise.user_preference_score)
 * 3. Seed completeness: exercises with seed_load_lb ranked higher than unseeded
 */
function scoreCandidates(
  candidates: V2ExerciseRow[],
  selectedSoFar: V2ExerciseRow[]
): V2ExerciseRow[] {
  const { unfulfilledGroups } = buildEquipmentState(selectedSoFar);
  const preferredEquipment = new Set<string>();
  for (const g of unfulfilledGroups) {
    for (const t of g.types) preferredEquipment.add(t);
  }

  return [...candidates].sort((a, b) => {
    const aScore = scoreOne(a, preferredEquipment);
    const bScore = scoreOne(b, preferredEquipment);
    return bScore - aScore;
  });
}

function scoreOne(e: V2ExerciseRow, preferredEquipment: Set<string>): number {
  let s = 0;
  if (preferredEquipment.has(e.equipment_type)) s += 100;
  s += (e.user_preference_score ?? 0) * 20;
  if (e.seed_load_lb !== null) s += 10;
  return s;
}

// ─── Pick default attachment for multi-use equipment ─────────────────────────

function pickEquipmentVariant(exercise: V2ExerciseRow): string | null {
  if (!exercise.equipment_variants || exercise.equipment_variants.length === 0) return null;
  return exercise.equipment_variants[0]; // first variant = canonical default
}

// ─── Session exercise assembly ─────────────────────────────────────────────────

export interface SelectionInput {
  dayType: V2DayType;
  all: V2ExerciseRow[];
  recentExerciseIds: Set<number>;
  lastTopSets: Map<number, V2LastTopSet>;
  userId: string;
  isoDate: string;
}

export function selectExercisesForSession(input: SelectionInput): V2SelectedExercise[] {
  const { dayType, all, recentExerciseIds, lastTopSets, userId, isoDate } = input;

  const slotCount = SLOT_COUNT[dayType];
  const slotRoles = SLOT_ROLES[dayType];
  const selected: V2SelectedExercise[] = [];
  const selectedExercises: V2ExerciseRow[] = [];

  for (let i = 0; i < slotCount; i++) {
    const role = slotRoles[i];
    const slotsRemaining = slotCount - i;

    // Determine sub-origin for full_body slots
    const slotOrigin: "lower" | "push_upper" | "pull_upper" | null =
      dayType === "full_body" ? FULL_BODY_SLOT_ORIGIN[i] : null;

    const requiredEquipment = requiredEquipmentTypes(selectedExercises, slotsRemaining);

    let candidates = candidatesForSlot(
      all,
      dayType,
      role,
      slotOrigin,
      recentExerciseIds,
      selectedExercises,
      requiredEquipment
    );

    if (candidates.length === 0) {
      // Relax no-repeat constraint as fallback
      candidates = candidatesForSlot(
        all,
        dayType,
        role,
        slotOrigin,
        new Set(), // no exclusions
        selectedExercises,
        requiredEquipment
      );
    }

    if (candidates.length === 0) continue; // skip slot if truly no candidates

    const scored = scoreCandidates(candidates, selectedExercises);
    const exercise = deterministicPick(scored, userId, isoDate, i);

    const prior = lastTopSets.get(exercise.exercise_id);
    const load = computeLoad(exercise, role, prior);
    const p = PRESCRIPTION[role];

    selected.push({
      exercise,
      role,
      slotIndex: i + 1,
      topSetLoad: load.topSetLoad,
      topSetReps: load.topSetReps,
      backOffLoad: load.backOffLoad,
      backOffReps: load.backOffReps,
      prescribedSets: p.sets,
      prescribedRepsMin: p.repsMin,
      prescribedRepsMax: p.repsMax,
      restSeconds: p.restSeconds,
      rationale_code: load.rationale_code,
      rationale_text: load.rationale_text,
      equipment_variant: pickEquipmentVariant(exercise),
      per_side_reps: exercise.is_unilateral,
    });

    selectedExercises.push(exercise);
  }

  return selected;
}
