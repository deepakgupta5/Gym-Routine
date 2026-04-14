import {
  CompletedWorkout,
  Exercise,
  ExerciseRole,
  ExerciseSlotType,
  GenerateNextWorkoutInput,
  MuscleGroup,
  PlannedWorkout,
  PlannedWorkoutExercise,
  SchedulerState,
  SessionEmphasis,
} from "@/lib/scheduler/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS_48 = 48;
const HOURS_72 = 72;
const MAX_MINUTES = 60;
const PRIMARY_MINUTES = 14;
const SECONDARY_MINUTES = 11;
const ACCESSORY_MINUTES = 7;
const CORE_MINUTES = 5;
const CARDIO_PRIORITY_MINUTES = 15;
const CARDIO_OPTIONAL_MINUTES = 10;

// Max high-fatigue exercises per session
const MAX_FATIGUE_5_PER_SESSION = 1;
const MAX_FATIGUE_4_PLUS_PER_SESSION = 2;

// Frequency target: each muscle should see direct work every N hours
const FREQUENCY_TARGET_HOURS = 84; // ~3.5 days between direct sessions

// Fatigue decay half-life in hours
const FATIGUE_DECAY_HALF_LIFE_HOURS = 48;

// ─── Slot blueprints per emphasis ─────────────────────────────────────────────

type SlotSpec = {
  type: ExerciseSlotType;
  emphasisFilter: SessionEmphasis[] | null; // null = any
  requiresLegDominant?: boolean;
  preferLegDominant?: boolean;
  preferUpperBody?: boolean;
};

const SLOT_BLUEPRINTS: Record<SessionEmphasis, SlotSpec[]> = {
  push: [
    { type: "primary",   emphasisFilter: ["push"] },
    { type: "secondary", emphasisFilter: ["pull"] },
    { type: "secondary", emphasisFilter: ["squat","hinge"], preferLegDominant: true },
    { type: "accessory", emphasisFilter: ["push","pull"],   preferUpperBody: true },
    { type: "accessory", emphasisFilter: null },
  ],
  pull: [
    { type: "primary",   emphasisFilter: ["pull"] },
    { type: "secondary", emphasisFilter: ["push"] },
    { type: "secondary", emphasisFilter: ["squat","hinge"], preferLegDominant: true },
    { type: "accessory", emphasisFilter: ["pull","push"],   preferUpperBody: true },
    { type: "accessory", emphasisFilter: null },
  ],
  squat: [
    { type: "primary",   emphasisFilter: ["squat"], requiresLegDominant: true },
    { type: "secondary", emphasisFilter: ["pull","push"],   preferUpperBody: true },
    { type: "secondary", emphasisFilter: ["hinge","squat"], preferLegDominant: true },
    { type: "accessory", emphasisFilter: null,              preferUpperBody: true },
    { type: "accessory", emphasisFilter: null },
  ],
  hinge: [
    { type: "primary",   emphasisFilter: ["hinge"], requiresLegDominant: true },
    { type: "secondary", emphasisFilter: ["push","pull"],   preferUpperBody: true },
    { type: "secondary", emphasisFilter: ["squat","hinge"], preferLegDominant: true },
    { type: "accessory", emphasisFilter: null,              preferUpperBody: true },
    { type: "accessory", emphasisFilter: null },
  ],
  mixed: [
    { type: "primary",   emphasisFilter: ["push","pull"] },
    { type: "secondary", emphasisFilter: ["squat","hinge"], preferLegDominant: true },
    { type: "secondary", emphasisFilter: ["push","pull"],   preferUpperBody: true },
    { type: "accessory", emphasisFilter: null },
    { type: "accessory", emphasisFilter: null },
  ],
};

// ─── Public entry-point ───────────────────────────────────────────────────────

export function generateNextWorkout(input: GenerateNextWorkoutInput): PlannedWorkout {
  const maxMinutes = input.maxSessionMinutes ?? MAX_MINUTES;

  const state = buildSchedulerStateFromHistory(
    input.exerciseLibrary,
    input.completedWorkouts,
    input.currentDate,
    input.schedulerState
  );

  const muscleNeed = computeMuscleNeedScores(state, input.currentDate);
  const emphasis   = chooseSessionEmphasis(state, muscleNeed, input.exerciseLibrary, input.currentDate);

  const workout = buildWorkout(emphasis, input.exerciseLibrary, state, input.currentDate, maxMinutes);
  return trimToTimeLimit(workout, maxMinutes);
}

// ─── State derivation ─────────────────────────────────────────────────────────

/** Merges persisted scheduler state with signals derived fresh from history. */
function buildSchedulerStateFromHistory(
  exerciseLibrary: Exercise[],
  completedWorkouts: CompletedWorkout[],
  currentDate: string,
  persisted: SchedulerState
): SchedulerState {
  const exerciseMap = toExerciseMap(exerciseLibrary);
  const now = new Date(currentDate).getTime();

  const derived: SchedulerState = {
    lastTrainedAtByMuscle:     {},
    lastHeavyCompoundAtByMuscle: {},
    hardReadyAtByMuscle:       {},
    softReadyAtByMuscle:       {},
    fatigueLoadByMuscle:       {},
    lastPerformedAtByExercise: {},
    recentExerciseIds:         [],
    recentMovementPatternHistory: [],
    recentEmphasisHistory:     [],
    recentLegDominantDays:     [],
    unmetWorkByMuscle:         {},
    unmetWorkByMovementFamily: {},
    cardioSessionsLast7Days:   0,
  };

  const sorted = [...completedWorkouts].sort((a, b) =>
    new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );

  for (const workout of sorted) {
    derived.recentEmphasisHistory.push(workout.emphasis);
    if (workout.legDominant) {
      derived.recentLegDominantDays.push(workout.completedAt);
    }
    if (workout.cardioCompleted && hoursBetween(workout.completedAt, currentDate) <= 168) {
      derived.cardioSessionsLast7Days += 1;
    }

    for (const exerciseId of workout.completedExerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) continue;

      derived.lastPerformedAtByExercise[exerciseId] = laterTimestamp(
        derived.lastPerformedAtByExercise[exerciseId],
        workout.completedAt
      ) ?? workout.completedAt;
      derived.recentExerciseIds.push(exerciseId);

      // Determine slot type from exercise position in completed list
      const isSkipped = workout.skippedExerciseIds.includes(exerciseId);
      if (isSkipped) continue;

      // Compute exposure and recovery windows
      const fatigueScore = exercise.fatigueScore;
      const slotType = inferSlotType(exercise, workout);

      const completionRatio = getCompletionRatio(exerciseId, workout);
      const effortMod      = getEffortModifier(exerciseId, workout);
      const roleMod        = getRoleModifier(slotType);
      const exerciseStress = fatigueScore * completionRatio * effortMod * roleMod;

      // Direct muscle exposure
      for (const muscle of exercise.primaryMuscles) {
        derived.lastTrainedAtByMuscle[muscle] = laterTimestamp(
          derived.lastTrainedAtByMuscle[muscle],
          workout.completedAt
        ) ?? workout.completedAt;

        if (exercise.isHeavyCompound) {
          derived.lastHeavyCompoundAtByMuscle[muscle] = laterTimestamp(
            derived.lastHeavyCompoundAtByMuscle[muscle],
            workout.completedAt
          ) ?? workout.completedAt;
        }

        // hardReadyAt = completedAt + 48 h (always)
        const hardReady = addHours(workout.completedAt, HOURS_48);
        derived.hardReadyAtByMuscle[muscle] = laterTimestamp(
          derived.hardReadyAtByMuscle[muscle],
          hardReady
        ) ?? hardReady;

        // softReadyAt = completedAt + 72 h for heavy compounds with decent completion
        if (fatigueScore >= 4 && completionRatio >= 0.67) {
          const softReady = addHours(workout.completedAt, HOURS_72);
          derived.softReadyAtByMuscle[muscle] = laterTimestamp(
            derived.softReadyAtByMuscle[muscle],
            softReady
          ) ?? softReady;
        } else if (fatigueScore >= 3) {
          const softReady = addHours(workout.completedAt, 60);
          derived.softReadyAtByMuscle[muscle] = laterTimestamp(
            derived.softReadyAtByMuscle[muscle],
            softReady
          ) ?? softReady;
        }

        // Decayed fatigue load
        const ageHours = (now - new Date(workout.completedAt).getTime()) / 3_600_000;
        const decayed  = exerciseStress * Math.pow(0.5, ageHours / FATIGUE_DECAY_HALF_LIFE_HOURS);
        derived.fatigueLoadByMuscle[muscle] =
          (derived.fatigueLoadByMuscle[muscle] ?? 0) + decayed;
      }

      // Indirect muscle — softer signal only
      for (const muscle of exercise.secondaryMuscles) {
        const indirectLoad = exerciseStress * 0.35;
        const ageHours = (now - new Date(workout.completedAt).getTime()) / 3_600_000;
        const decayed  = indirectLoad * Math.pow(0.5, ageHours / FATIGUE_DECAY_HALF_LIFE_HOURS);
        derived.fatigueLoadByMuscle[muscle] =
          (derived.fatigueLoadByMuscle[muscle] ?? 0) + decayed;
      }

      // Movement family unmet work cleanup (this exercise was done, reset any unmet for its category)
      if (derived.unmetWorkByMovementFamily[exercise.category]) {
        derived.unmetWorkByMovementFamily[exercise.category] = Math.max(
          0,
          (derived.unmetWorkByMovementFamily[exercise.category] ?? 0) - 0.5
        );
      }
    }

    // Skipped exercises → accumulate unmet work
    for (const exerciseId of workout.skippedExerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) continue;
      const slotType = inferSlotType(exercise, workout);
      const weight   = slotType === "primary" ? 1.0 : slotType === "secondary" ? 0.7 : 0.35;
      for (const muscle of exercise.primaryMuscles) {
        derived.unmetWorkByMuscle[muscle] =
          (derived.unmetWorkByMuscle[muscle] ?? 0) + weight;
      }
      derived.unmetWorkByMovementFamily[exercise.category] =
        (derived.unmetWorkByMovementFamily[exercise.category] ?? 0) + weight;
    }
  }

  // Trim history arrays
  derived.recentEmphasisHistory      = derived.recentEmphasisHistory.slice(-6);
  derived.recentLegDominantDays      = derived.recentLegDominantDays.slice(-3);
  derived.recentExerciseIds          = derived.recentExerciseIds.slice(-20);
  derived.recentMovementPatternHistory = derived.recentMovementPatternHistory.slice(-12);

  // Merge: prefer derived for timestamps (authoritative from history),
  // use persisted as fallback for unmet work accumulated out of band.
  return {
    lastTrainedAtByMuscle:       mergeTimestampMaps(derived.lastTrainedAtByMuscle,       persisted.lastTrainedAtByMuscle),
    lastHeavyCompoundAtByMuscle: mergeTimestampMaps(derived.lastHeavyCompoundAtByMuscle, persisted.lastHeavyCompoundAtByMuscle ?? {}),
    hardReadyAtByMuscle:         mergeTimestampMaps(derived.hardReadyAtByMuscle,         persisted.hardReadyAtByMuscle ?? {}),
    softReadyAtByMuscle:         mergeTimestampMaps(derived.softReadyAtByMuscle,         persisted.softReadyAtByMuscle ?? {}),
    fatigueLoadByMuscle:         mergeNumericMaps(  derived.fatigueLoadByMuscle,         persisted.fatigueLoadByMuscle ?? {}),
    lastPerformedAtByExercise:   mergeTimestampMaps(derived.lastPerformedAtByExercise,   persisted.lastPerformedAtByExercise),
    recentExerciseIds:           derived.recentExerciseIds,
    recentMovementPatternHistory: derived.recentMovementPatternHistory,
    recentEmphasisHistory:       derived.recentEmphasisHistory.length > 0
      ? derived.recentEmphasisHistory
      : (persisted.recentEmphasisHistory ?? []),
    recentLegDominantDays:       derived.recentLegDominantDays.length > 0
      ? derived.recentLegDominantDays
      : (persisted.recentLegDominantDays ?? []),
    unmetWorkByMuscle:           mergeNumericMaps(derived.unmetWorkByMuscle, persisted.unmetWorkByMuscle ?? {}),
    unmetWorkByMovementFamily:   mergeNumericMaps(derived.unmetWorkByMovementFamily, persisted.unmetWorkByMovementFamily ?? {}),
    cardioSessionsLast7Days:     Math.max(derived.cardioSessionsLast7Days, persisted.cardioSessionsLast7Days ?? 0),
  };
}

// ─── Muscle need scoring ──────────────────────────────────────────────────────

export function computeMuscleNeedScores(
  state: SchedulerState,
  currentDate: string
): Partial<Record<MuscleGroup, number>> {
  const muscles: MuscleGroup[] = [
    "chest","upper_back","lats","shoulders","biceps","triceps",
    "quads","hamstrings","glutes","core",
  ];
  const need: Partial<Record<MuscleGroup, number>> = {};

  for (const muscle of muscles) {
    const lastDirect    = state.lastTrainedAtByMuscle[muscle];
    const hoursSinceDirect = lastDirect ? hoursBetween(lastDirect, currentDate) : FREQUENCY_TARGET_HOURS * 2;
    const frequencyDeficit = Math.min(3, hoursSinceDirect / FREQUENCY_TARGET_HOURS);
    const unmetWork     = state.unmetWorkByMuscle[muscle] ?? 0;
    const currentFatigue = state.fatigueLoadByMuscle[muscle] ?? 0;

    let score = frequencyDeficit + unmetWork - currentFatigue * 0.5;

    // Hard block: muscle not ready — penalise heavily
    const hardReady = state.hardReadyAtByMuscle[muscle];
    if (hardReady && new Date(currentDate) < new Date(hardReady)) {
      score -= 100;
    }

    need[muscle] = score;
  }

  return need;
}

// ─── Emphasis selection ───────────────────────────────────────────────────────

export function chooseSessionEmphasis(
  state: SchedulerState,
  muscleNeed: Partial<Record<MuscleGroup, number>>,
  exerciseLibrary: Exercise[],
  currentDate: string
): SessionEmphasis {
  const needOf = (muscles: MuscleGroup[]) =>
    muscles.reduce((s, m) => s + (muscleNeed[m] ?? 0), 0);

  const pushNeed   = needOf(["chest","shoulders","triceps"]);
  const pullNeed   = needOf(["upper_back","lats","biceps"]);
  const squatNeed  = needOf(["quads","glutes"]);
  const hingeNeed  = needOf(["hamstrings","glutes"]);

  const recentLegTooClose = recentLegDayTooClose(currentDate, state.recentLegDominantDays);
  const lastTwo = state.recentEmphasisHistory.slice(-2);
  const lastEmphasis = lastTwo[lastTwo.length - 1] ?? null;

  const ranked: Array<{ emphasis: SessionEmphasis; score: number }> = [
    { emphasis: "push",  score: pushNeed  },
    { emphasis: "pull",  score: pullNeed  },
    { emphasis: "squat", score: squatNeed - (recentLegTooClose ? 50 : 0) },
    { emphasis: "hinge", score: hingeNeed - (recentLegTooClose ? 50 : 0) },
  ];

  // Penalty for repeating the same emphasis as last session
  for (const item of ranked) {
    if (item.emphasis === lastEmphasis) item.score -= 5;
    // Extra penalty if same emphasis appeared in both last 2 sessions
    if (lastTwo.every((e) => e === item.emphasis)) item.score -= 10;
  }

  // Filter by recovery validity (at least one primary candidate must exist)
  const valid = ranked.filter((item) =>
    emphasisHasPrimaryCandidate(item.emphasis, exerciseLibrary, state, currentDate)
  );

  const best = valid.sort((a, b) => b.score - a.score)[0];
  return best?.emphasis ?? "mixed";
}

// ─── Workout builder ──────────────────────────────────────────────────────────

export function buildWorkout(
  emphasis: SessionEmphasis,
  exerciseLibrary: Exercise[],
  state: SchedulerState,
  currentDate: string,
  maxMinutes: number
): PlannedWorkout {
  const blueprint = SLOT_BLUEPRINTS[emphasis];
  const selected: PlannedWorkoutExercise[] = [];
  const selectedIds = new Set<string>();
  let totalMinutes = 0;
  let fatigue5Count = 0;
  let fatigue4PlusCount = 0;

  for (const slot of blueprint) {
    const slotMinutes = minutesForSlot(slot.type);
    if (totalMinutes + slotMinutes > maxMinutes) continue;

    let candidates = exerciseLibrary.filter((ex) => {
      if (!ex.enabled) return false;
      if (selectedIds.has(ex.id)) return false;
      if (!ex.suitableSlots.includes(slot.type)) return false;
      if (slot.emphasisFilter && slot.emphasisFilter.length > 0) {
        if (!slot.emphasisFilter.some((t) => ex.emphasisTags.includes(t))) return false;
      }
      if (slot.requiresLegDominant && !ex.legDominant) return false;
      return true;
    });

    // Hard recovery filter
    candidates = filterByHardRecovery(candidates, state, currentDate);

    // 72-h exact-repeat filter (relax if nothing left)
    const afterRotation = filterByExactRepeat(candidates, state, currentDate, HOURS_72);
    if (afterRotation.length > 0) candidates = afterRotation;

    // Leg stacking guard: if already have a leg-dominant exercise, prefer non-leg
    if (selected.some((s) => s.slotType === "primary" && isLegEx(s.exerciseId, exerciseLibrary))) {
      const nonLeg = candidates.filter((ex) => !ex.legDominant);
      if (nonLeg.length > 0) candidates = nonLeg;
    }

    // Prefer upper body for slots that request it
    if (slot.preferUpperBody) {
      const upper = candidates.filter((ex) => !ex.legDominant);
      if (upper.length > 0) candidates = upper;
    }
    if (slot.preferLegDominant) {
      const leg = candidates.filter((ex) => ex.legDominant);
      if (leg.length > 0) candidates = leg;
    }

    // Fatigue density cap
    const afterCap = applyFatigueDensityCap(candidates, fatigue5Count, fatigue4PlusCount);
    if (afterCap.length > 0) candidates = afterCap;

    if (candidates.length === 0) continue;

    // Score candidates
    const scored = candidates.map((ex) => ({
      ex,
      score: scoreCandidate(ex, slot.type, state, currentDate),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]?.ex;
    if (!best) continue;

    selected.push({
      exerciseId:   best.id,
      orderIndex:   selected.length,
      role:         slot.type,
      slotType:     slot.type,
      rationaleTags: buildRationaleTags(best, slot.type, state, currentDate),
      estimatedMinutes: slotMinutes,
    });
    selectedIds.add(best.id);
    totalMinutes += slotMinutes;
    if (best.fatigueScore === 5) fatigue5Count++;
    if (best.fatigueScore >= 4) fatigue4PlusCount++;
  }

  // Full-body coverage patch
  const covered = getMusclesCovered(selected, exerciseLibrary);
  if (!covered.has("core")) {
    const coreEx = pickCoreExercise(exerciseLibrary, state, currentDate, selectedIds);
    if (coreEx && totalMinutes + CORE_MINUTES <= maxMinutes) {
      selected.push({
        exerciseId: coreEx.id,
        orderIndex: selected.length,
        role: "accessory",
        slotType: "accessory",
        rationaleTags: ["coverage_core"],
        estimatedMinutes: CORE_MINUTES,
      });
      totalMinutes += CORE_MINUTES;
    }
  }

  const legDominant = emphasis === "squat" || emphasis === "hinge" ||
    selected.some((s) => s.slotType === "primary" && isLegEx(s.exerciseId, exerciseLibrary));

  const cardio = buildCardioRecommendation(state, legDominant, totalMinutes, maxMinutes);
  const addCardio = cardio.include;
  const cardioMinutes = addCardio ? cardio.minutes : 0;
  const addCore = selected.some((s) => {
    const ex = exerciseLibrary.find((e) => e.id === s.exerciseId);
    return ex?.primaryMuscles.includes("core");
  });

  const estimatedResistanceMinutes = selected.reduce((s, e) => s + e.estimatedMinutes, 0);

  return {
    emphasis,
    legDominant,
    exercises: selected,
    cardioRecommendation: cardio,
    addCore,
    addCardio,
    cardioMinutes,
    estimatedResistanceMinutes,
    estimatedMinutes: estimatedResistanceMinutes + cardioMinutes,
  };
}

// ─── Cardio recommendation ────────────────────────────────────────────────────

export function buildCardioRecommendation(
  state: SchedulerState,
  legDominant: boolean,
  resistanceMinutes: number,
  maxMinutes: number
): import("./types").CardioRecommendation {
  const remaining = maxMinutes - resistanceMinutes;
  const cardioBehind = state.cardioSessionsLast7Days < 3;
  const cardioOptional = state.cardioSessionsLast7Days >= 3 && state.cardioSessionsLast7Days < 5;

  if (legDominant || remaining < 8 || state.cardioSessionsLast7Days >= 5) {
    return { include: false, minutes: 0, intensityNote: "", reason: "ineligible" };
  }

  if (cardioBehind) {
    const minutes = Math.min(CARDIO_PRIORITY_MINUTES, remaining);
    return {
      include: true,
      minutes,
      intensityNote: "15 min incline walk or steady-state cardio",
      reason: "behind_7_day_target",
    };
  }

  if (cardioOptional) {
    const minutes = Math.min(CARDIO_OPTIONAL_MINUTES, remaining);
    return {
      include: true,
      minutes,
      intensityNote: "10 min low-intensity steady state",
      reason: "eligible_non_leg_day",
    };
  }

  return { include: false, minutes: 0, intensityNote: "", reason: "on_target" };
}

// ─── Time trimming ────────────────────────────────────────────────────────────

export function trimToTimeLimit(workout: PlannedWorkout, maxMinutes: number): PlannedWorkout {
  const result = { ...workout, exercises: [...workout.exercises] };
  if (result.estimatedMinutes <= maxMinutes) return result;

  // Drop cardio first
  if (result.addCardio) {
    result.addCardio = false;
    result.cardioMinutes = 0;
    result.cardioRecommendation = { ...result.cardioRecommendation, include: false, minutes: 0 };
    result.estimatedMinutes = result.estimatedResistanceMinutes;
  }

  // Drop accessories from the back
  const dropOrder: ExerciseRole[] = ["accessory", "core", "cardio"];
  for (const dropRole of dropOrder) {
    while (result.estimatedMinutes > maxMinutes) {
      const idx = findLastByRole(result.exercises, dropRole);
      if (idx < 0) break;
      result.estimatedMinutes -= result.exercises[idx]!.estimatedMinutes;
      result.estimatedResistanceMinutes -= result.exercises[idx]!.estimatedMinutes;
      result.exercises.splice(idx, 1);
    }
    if (result.estimatedMinutes <= maxMinutes) break;
  }

  return result;
}

// ─── Helpers: filtering ───────────────────────────────────────────────────────

function filterByHardRecovery(
  candidates: Exercise[],
  state: SchedulerState,
  currentDate: string
): Exercise[] {
  return candidates.filter((ex) =>
    ex.primaryMuscles.every((m) => {
      const ready = state.hardReadyAtByMuscle[m];
      return !ready || new Date(currentDate) >= new Date(ready);
    })
  );
}

function filterByExactRepeat(
  candidates: Exercise[],
  state: SchedulerState,
  currentDate: string,
  minHours: number
): Exercise[] {
  const candidateIds = new Set(candidates.map((ex) => ex.id));
  return candidates.filter((ex) => {
    const lastAt = state.lastPerformedAtByExercise[ex.id];
    if (!lastAt || hoursBetween(lastAt, currentDate) >= minHours) return true;
    // Allow if no alternative also satisfies the filter
    return !ex.alternatives.some(
      (altId) =>
        candidateIds.has(altId) &&
        !isWithinHours(state.lastPerformedAtByExercise[altId], currentDate, minHours)
    );
  });
}

function applyFatigueDensityCap(
  candidates: Exercise[],
  fatigue5Count: number,
  fatigue4PlusCount: number
): Exercise[] {
  let filtered = candidates;
  if (fatigue5Count >= MAX_FATIGUE_5_PER_SESSION) {
    filtered = filtered.filter((ex) => ex.fatigueScore < 5);
  }
  if (fatigue4PlusCount >= MAX_FATIGUE_4_PLUS_PER_SESSION) {
    filtered = filtered.filter((ex) => ex.fatigueScore < 4);
  }
  return filtered.length > 0 ? filtered : candidates;
}

// ─── Helpers: scoring ─────────────────────────────────────────────────────────

function scoreCandidate(
  ex: Exercise,
  slotType: ExerciseSlotType,
  state: SchedulerState,
  currentDate: string
): number {
  let score = 0;

  // Need score for primary muscles
  for (const muscle of ex.primaryMuscles) {
    const lastDirect = state.lastTrainedAtByMuscle[muscle];
    const hours = lastDirect ? hoursBetween(lastDirect, currentDate) : FREQUENCY_TARGET_HOURS * 2;
    score += Math.min(3, hours / FREQUENCY_TARGET_HOURS);
    score += state.unmetWorkByMuscle[muscle] ?? 0;
  }

  // Category unmet work bonus
  score += (state.unmetWorkByMovementFamily[ex.category] ?? 0) * 0.5;

  // Novelty: prefer exercises not done recently
  const lastDone = state.lastPerformedAtByExercise[ex.id];
  if (!lastDone) {
    score += 2; // never done
  } else {
    const hrsAgo = hoursBetween(lastDone, currentDate);
    score += Math.min(2, hrsAgo / FREQUENCY_TARGET_HOURS);
  }

  // Slot fit: penalise heavy compounds for accessory slots
  if (slotType === "accessory" && ex.fatigueScore >= 4) score -= 3;
  if (slotType === "primary"   && ex.fatigueScore <= 2) score -= 2;

  // Soft recovery penalty
  for (const muscle of ex.primaryMuscles) {
    const softReady = state.softReadyAtByMuscle[muscle];
    if (softReady && new Date(currentDate) < new Date(softReady)) {
      score -= 2;
    }
  }

  // Recent exact-repeat penalty
  const lastAt = state.lastPerformedAtByExercise[ex.id];
  if (lastAt && isWithinHours(lastAt, currentDate, HOURS_72)) score -= 4;

  return score;
}

// ─── Helpers: misc ────────────────────────────────────────────────────────────

function emphasisHasPrimaryCandidate(
  emphasis: SessionEmphasis,
  exerciseLibrary: Exercise[],
  state: SchedulerState,
  currentDate: string
): boolean {
  const candidates = exerciseLibrary.filter(
    (ex) => ex.enabled && ex.suitableSlots.includes("primary") && ex.emphasisTags.includes(emphasis)
  );
  return filterByHardRecovery(candidates, state, currentDate).length > 0;
}

function recentLegDayTooClose(currentDate: string, recentLegDominantDays: string[]): boolean {
  const latest = recentLegDominantDays[recentLegDominantDays.length - 1];
  if (!latest) return false;
  return hoursBetween(latest, currentDate) < HOURS_48;
}

function getMusclesCovered(selected: PlannedWorkoutExercise[], library: Exercise[]): Set<MuscleGroup> {
  const covered = new Set<MuscleGroup>();
  for (const s of selected) {
    const ex = library.find((e) => e.id === s.exerciseId);
    if (!ex) continue;
    for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles]) covered.add(m);
  }
  return covered;
}

function pickCoreExercise(
  library: Exercise[],
  state: SchedulerState,
  currentDate: string,
  excludeIds: Set<string>
): Exercise | null {
  let candidates = library.filter(
    (ex) => ex.enabled && !excludeIds.has(ex.id) && ex.primaryMuscles.includes("core")
  );
  candidates = filterByHardRecovery(candidates, state, currentDate);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const aAt = state.lastPerformedAtByExercise[a.id] ?? "";
    const bAt = state.lastPerformedAtByExercise[b.id] ?? "";
    return aAt.localeCompare(bAt);
  })[0] ?? null;
}

function buildRationaleTags(
  ex: Exercise,
  slotType: ExerciseSlotType,
  state: SchedulerState,
  currentDate: string
): string[] {
  const tags: string[] = [];
  const lastAt = state.lastPerformedAtByExercise[ex.id];
  if (!lastAt) tags.push("never_done");
  if (ex.primaryMuscles.some((m) => (state.unmetWorkByMuscle[m] ?? 0) > 0))
    tags.push("unmet_work");
  if (slotType === "primary") tags.push(`${ex.emphasisTags[0] ?? "unknown"}_primary`);
  return tags;
}

function isLegEx(exerciseId: string, library: Exercise[]): boolean {
  return library.find((e) => e.id === exerciseId)?.legDominant ?? false;
}

function minutesForSlot(slotType: ExerciseSlotType): number {
  if (slotType === "primary")   return PRIMARY_MINUTES;
  if (slotType === "secondary") return SECONDARY_MINUTES;
  return ACCESSORY_MINUTES;
}

function findLastByRole(exercises: PlannedWorkoutExercise[], role: ExerciseRole): number {
  for (let i = exercises.length - 1; i >= 0; i--) {
    if (exercises[i]?.role === role) return i;
  }
  return -1;
}

// ─── Completion ratio / effort helpers (used for exposure scoring) ─────────────

function getCompletionRatio(exerciseId: string, workout: CompletedWorkout): number {
  const ex = workout.resistanceExercises?.find((e) => e.exerciseId === exerciseId);
  if (!ex || !ex.prescribedSets || ex.prescribedSets === 0) return 1;
  return Math.min(1, (ex.completedSets ?? 0) / ex.prescribedSets);
}

function getEffortModifier(exerciseId: string, workout: CompletedWorkout): number {
  const ex = workout.resistanceExercises?.find((e) => e.exerciseId === exerciseId);
  if (!ex?.avgRpe) return 1.0;
  if (ex.avgRpe >= 9) return 1.1;
  if (ex.avgRpe >= 7) return 1.0;
  return 0.85;
}

function getRoleModifier(slotType: ExerciseSlotType): number {
  if (slotType === "primary")   return 1.0;
  if (slotType === "secondary") return 0.85;
  return 0.6;
}

function inferSlotType(ex: Exercise, workout: CompletedWorkout): ExerciseSlotType {
  const re = workout.resistanceExercises?.find((r) => r.exerciseId === ex.id);
  if (re?.muscleExposures?.[0]?.slotType) return re.muscleExposures[0].slotType;
  if (ex.suitableSlots.includes("primary"))   return "primary";
  if (ex.suitableSlots.includes("secondary")) return "secondary";
  return "accessory";
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function hoursBetween(from: string, to: string): number {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000);
}

function addHours(isoDate: string, hours: number): string {
  return new Date(new Date(isoDate).getTime() + hours * 3_600_000).toISOString();
}

function isWithinHours(from: string | undefined, to: string, hours: number): boolean {
  if (!from) return false;
  return hoursBetween(from, to) < hours;
}

// ─── Map merge helpers ────────────────────────────────────────────────────────

function mergeTimestampMaps<T extends string>(
  left: Partial<Record<T, string>>,
  right: Partial<Record<T, string>>
): Partial<Record<T, string>> {
  const merged: Partial<Record<T, string>> = { ...left };
  for (const key of Object.keys(right) as T[]) {
    merged[key] = laterTimestamp(merged[key], right[key]);
  }
  return merged;
}

function mergeNumericMaps<T extends string>(
  left: Partial<Record<T, number>>,
  right: Partial<Record<T, number>>
): Partial<Record<T, number>> {
  const merged: Partial<Record<T, number>> = { ...left };
  for (const key of Object.keys(right) as T[]) {
    merged[key] = Math.max(merged[key] ?? 0, right[key] ?? 0);
  }
  return merged;
}

function laterTimestamp(a?: string | null, b?: string | null): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function toExerciseMap(library: Exercise[]): Map<string, Exercise> {
  return new Map(library.map((ex) => [ex.id, ex]));
}

// ─── Re-exports for backward compat ──────────────────────────────────────────

export type {
  CompletedWorkout,
  Exercise,
  GenerateNextWorkoutInput,
  MuscleGroup as Muscle,
  PlannedWorkout,
  PlannedWorkoutExercise,
  SchedulerState,
  SessionEmphasis,
} from "@/lib/scheduler/types";
