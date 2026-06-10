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
  WEEKLY_MIN_SETS,
} from "./constants";
import { computeLoad } from "./load";

// --- Day type selection -------------------------------------------------------

/**
 * Which day types primarily accumulate sets for each tracked muscle.
 * Used by selectDayType to map a volume deficit back to a day type override.
 *
 * Notes:
 * - glutes appears in both lower day types (trained on squat AND hinge days).
 * - calves are accessory work on squat days.
 * - core is omitted: trained as accessories in every session, not a useful
 *   override signal (it would always be under minimum relative to 5-day volume).
 */
const MUSCLE_TO_DAY_TYPES: Partial<Record<string, V2DayType[]>> = {
  chest:      ["push_upper"],
  shoulders:  ["push_upper"],
  triceps:    ["push_upper"],
  back:       ["pull_upper"],
  biceps:     ["pull_upper"],
  quads:      ["squat_lower"],
  hamstrings: ["hinge_lower"],
  glutes:     ["squat_lower", "hinge_lower"],
  calves:     ["squat_lower"],
};

/** Pure rotation: advance one step from the last performed v2 day type. */
function pureRotation(recentV2DayTypes: V2DayType[]): V2DayType {
  if (recentV2DayTypes.length === 0) return V2_ROTATION[0];
  const last = recentV2DayTypes[recentV2DayTypes.length - 1];
  const lastIdx = V2_ROTATION.indexOf(last);
  if (lastIdx === -1) return V2_ROTATION[0];
  return V2_ROTATION[(lastIdx + 1) % V2_ROTATION.length];
}

/**
 * Select the next v2 day type given recent session history and this week's
 * muscle volume (PRD Sections 4.2 + 3.3).
 *
 * Logic:
 * 1. Compute per-day-type deficit totals from v_weekly_muscle_volume vs
 *    WEEKLY_MIN_SETS. Track the largest single-muscle deficit as a fraction
 *    of its minimum.
 * 2. If no deficits -> pure rotation (no change to normal behavior).
 * 3. Gate: override fires if EITHER:
 *      a. It is Wednesday or later in the week (dayOfWeek >= 3, or Sunday = 0),
 *      b. OR any single muscle is more than 50% below its minimum (large-deficit
 *         exception -- fires regardless of day of week, e.g. after 3+ skips).
 * 4. Override: pick the day type with the highest total accumulated deficit.
 *    Tiebreak: alphabetical for determinism.
 *
 * @param recentV2DayTypes  - last performed v2 day type(s); only [last] is used
 * @param weeklyVolume      - map from muscle_primary to sets logged in last 7 days
 * @param isoDate           - target date (YYYY-MM-DD) used for day-of-week gate
 */
export function selectDayType(
  recentV2DayTypes: V2DayType[],
  weeklyVolume: Map<string, number>,
  isoDate: string,
): V2DayType {
  // 1. Compute deficit per day type
  const deficitByDayType = new Map<V2DayType, number>();
  let largestDeficitFraction = 0;

  for (const [muscle, minSets] of Object.entries(WEEKLY_MIN_SETS)) {
    const dayTypes = MUSCLE_TO_DAY_TYPES[muscle];
    if (!dayTypes) continue; // core + unmapped muscles -- skip

    const actual = weeklyVolume.get(muscle) ?? 0;
    const deficit = Math.max(0, minSets - actual);
    if (deficit === 0) continue;

    const fraction = deficit / minSets;
    if (fraction > largestDeficitFraction) largestDeficitFraction = fraction;

    for (const dt of dayTypes) {
      deficitByDayType.set(dt, (deficitByDayType.get(dt) ?? 0) + deficit);
    }
  }

  // 2. No deficits -> pure rotation
  if (deficitByDayType.size === 0) return pureRotation(recentV2DayTypes);

  // 3. Gate check
  //    UTCDay: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  //    "past Wednesday" = Wed through Sat, plus Sunday (end of rolling week)
  const dayOfWeek = new Date(isoDate).getUTCDay();
  const pastWednesday = dayOfWeek === 0 || dayOfWeek >= 3;
  const largeDeficit = largestDeficitFraction > 0.5; // >50% of minimum is missing

  if (!pastWednesday && !largeDeficit) return pureRotation(recentV2DayTypes);

  // 4. Override: highest total-deficit day type wins; alphabetical tiebreak
  const [overrideDayType] = [...deficitByDayType.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return overrideDayType;
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

  // Exclude exercises used recently (no-repeat rule applies to all roles)
  {
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
 * 4. Recency penalty (optional): exercises used recently are deprioritised.
 *    Used in fallback mode so the same exercises don't win every session even
 *    when the strict 7-day no-repeat pool is empty.
 */
function scoreCandidates(
  candidates: V2ExerciseRow[],
  selectedSoFar: V2ExerciseRow[],
  recentExerciseIds?: Set<number>
): V2ExerciseRow[] {
  const { unfulfilledGroups } = buildEquipmentState(selectedSoFar);
  const preferredEquipment = new Set<string>();
  for (const g of unfulfilledGroups) {
    for (const t of g.types) preferredEquipment.add(t);
  }

  return [...candidates].sort((a, b) => {
    const aScore = scoreOne(a, preferredEquipment, recentExerciseIds);
    const bScore = scoreOne(b, preferredEquipment, recentExerciseIds);
    return bScore - aScore;
  });
}

function scoreOne(
  e: V2ExerciseRow,
  preferredEquipment: Set<string>,
  recentExerciseIds?: Set<number>
): number {
  let s = 0;
  if (preferredEquipment.has(e.equipment_type)) s += 100;
  s += (e.user_preference_score ?? 0) * 20;
  if (e.seed_load_lb !== null) s += 10;
  // Penalise recently-used exercises so they are picked last in fallback mode.
  // Penalty (-200) is larger than the max positive score (100+40+10=150) so
  // any fresh exercise will always outscore a recently-used one.
  if (recentExerciseIds?.has(e.exercise_id)) s -= 200;
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
      // Relax no-repeat constraint as fallback, but keep the recency penalty in
      // scoring so recently-used exercises are deprioritised within the expanded pool.
      // This prevents core exercises (high user_preference_score) from winning
      // every session when the strict 7-day pool is exhausted for a day type.
      candidates = candidatesForSlot(
        all,
        dayType,
        role,
        slotOrigin,
        new Set(), // no hard exclusions -- pool is fully open
        selectedExercises,
        requiredEquipment
      );
    }

    if (candidates.length === 0) continue; // skip slot if truly no candidates

    // Always pass recentExerciseIds so the recency penalty applies in both
    // normal mode (some candidates excluded) and fallback mode (pool open).
    const scored = scoreCandidates(candidates, selectedExercises, recentExerciseIds);
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
