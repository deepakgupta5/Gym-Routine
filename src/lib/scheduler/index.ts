import {
  CompletedWorkout,
  Exercise,
  ExerciseRole,
  GenerateNextWorkoutInput,
  Muscle,
  PlannedWorkout,
  PlannedWorkoutExercise,
  SchedulerState,
  SessionEmphasis,
} from "@/lib/scheduler/types";

const HOURS_48 = 48;
const HOURS_72 = 72;
const PRIMARY_MINUTES = 15;
const SECONDARY_MINUTES = 12;
const ACCESSORY_MINUTES = 8;
const CORE_MINUTES = 5;
const CARDIO_PRIORITY_MINUTES = 15;
const CARDIO_OPTIONAL_MINUTES = 10;
const MAX_MINUTES = 60;
const THREE_DAYS_IN_HOURS = 72;

const ACCESSORY_PRIORITY_BY_EMPHASIS: Record<SessionEmphasis, Muscle[]> = {
  push: ["upper_back", "lats", "quads", "hamstrings", "glutes", "biceps", "core", "shoulders", "triceps"],
  pull: ["chest", "shoulders", "quads", "glutes", "hamstrings", "triceps", "core", "biceps"],
  squat: ["chest", "upper_back", "lats", "shoulders", "hamstrings", "glutes", "core", "biceps", "triceps"],
  hinge: ["chest", "upper_back", "lats", "shoulders", "quads", "core", "biceps", "triceps"],
  mixed: ["quads", "hamstrings", "glutes", "chest", "upper_back", "lats", "shoulders", "biceps", "triceps", "core"],
};

type ExerciseMap = Map<string, Exercise>;

export function generateNextWorkout(input: GenerateNextWorkoutInput): PlannedWorkout {
  const normalizedState = normalizeSchedulerState(
    input.exerciseLibrary,
    input.completedWorkouts,
    input.schedulerState,
    input.currentDate
  );

  const emphasis = chooseSessionEmphasis(
    input.currentDate,
    input.exerciseLibrary,
    input.completedWorkouts,
    normalizedState
  );

  const workout = buildWorkout(
    input.currentDate,
    emphasis,
    input.exerciseLibrary,
    input.completedWorkouts,
    normalizedState
  );

  return trimToTimeLimit(workout);
}

export function chooseSessionEmphasis(
  currentDate: string,
  exerciseLibrary: Exercise[],
  completedWorkouts: CompletedWorkout[],
  schedulerState: SchedulerState
): SessionEmphasis {
  const lastEmphasis = getLastEmphasis(schedulerState.recentEmphasisHistory, completedWorkouts);
  const lowerUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["quads", "hamstrings", "glutes"]);
  const pushUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["chest", "shoulders", "triceps"]);
  const pullUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["upper_back", "lats", "biceps"]);
  const maxUnmet = Math.max(lowerUnmet, pushUnmet, pullUnmet);

  if (lowerUnmet > 0 && lowerUnmet === maxUnmet) {
    const quadUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["quads"]);
    const hingeUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["hamstrings"]);
    if (
      quadUnmet >= hingeUnmet &&
      emphasisIsReady("squat", currentDate, exerciseLibrary, schedulerState) &&
      !recentLegDayTooClose(currentDate, schedulerState.recentLegDominantDays)
    ) {
      return "squat";
    }
    if (
      emphasisIsReady("hinge", currentDate, exerciseLibrary, schedulerState) &&
      !recentLegDayTooClose(currentDate, schedulerState.recentLegDominantDays)
    ) {
      return "hinge";
    }
  }

  if (
    pushUnmet > 0 &&
    pushUnmet === maxUnmet &&
    emphasisIsReady("push", currentDate, exerciseLibrary, schedulerState) &&
    lastEmphasis !== "push"
  ) {
    return "push";
  }

  if (
    pullUnmet > 0 &&
    pullUnmet === maxUnmet &&
    emphasisIsReady("pull", currentDate, exerciseLibrary, schedulerState) &&
    lastEmphasis !== "pull"
  ) {
    return "pull";
  }

  for (const emphasis of getFallbackEmphasisOrder(lastEmphasis)) {
    if (!emphasisIsReady(emphasis, currentDate, exerciseLibrary, schedulerState)) continue;
    if ((emphasis === "squat" || emphasis === "hinge") && recentLegDayTooClose(currentDate, schedulerState.recentLegDominantDays)) {
      continue;
    }
    return emphasis;
  }

  return "mixed";
}

export function buildWorkout(
  currentDate: string,
  emphasis: SessionEmphasis,
  exerciseLibrary: Exercise[],
  completedWorkouts: CompletedWorkout[],
  schedulerState: SchedulerState
): PlannedWorkout {
  const exerciseMap = toExerciseMap(exerciseLibrary);
  const exercises: PlannedWorkoutExercise[] = [];

  const primary = choosePrimaryExercise(
    currentDate,
    emphasis,
    exerciseLibrary,
    schedulerState,
    exercises
  );
  if (primary) {
    exercises.push(toPlannedExercise(primary, "primary"));
  }

  const secondary = chooseSecondaryExercise(
    currentDate,
    emphasis,
    primary,
    exerciseLibrary,
    schedulerState,
    exercises
  );
  if (secondary) {
    exercises.push(toPlannedExercise(secondary, "secondary"));
  }

  const accessories = chooseAccessories(
    currentDate,
    emphasis,
    primary,
    secondary,
    exerciseLibrary,
    schedulerState,
    exercises
  );
  exercises.push(...accessories.map((exercise) => toPlannedExercise(exercise, "accessory")));

  const coreExercise = chooseCoreExercise(
    currentDate,
    exerciseLibrary,
    schedulerState,
    exercises
  );
  const addCore = Boolean(coreExercise);
  if (coreExercise) {
    exercises.push(toPlannedExercise(coreExercise, "core"));
  }

  const legDominant = isLegDominantWorkout(emphasis, exercises, exerciseMap);
  const cardioMinutes = shouldAddCardio(currentDate, legDominant, exercises, completedWorkouts, schedulerState)
    ? schedulerState.cardioSessionsLast7Days < 3
      ? CARDIO_PRIORITY_MINUTES
      : CARDIO_OPTIONAL_MINUTES
    : 0;

  return {
    emphasis,
    legDominant,
    exercises,
    addCore,
    addCardio: cardioMinutes > 0,
    cardioMinutes,
    estimatedMinutes: getWorkoutMinutes(exercises, cardioMinutes),
  };
}

export function choosePrimaryExercise(
  currentDate: string,
  emphasis: SessionEmphasis,
  exerciseLibrary: Exercise[],
  schedulerState: SchedulerState,
  selectedExercises: PlannedWorkoutExercise[] = []
): Exercise | null {
  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exerciseId));
  let candidates: Exercise[] = [];

  if (emphasis === "mixed") {
    for (const prioritizedEmphasis of getMixedPrimaryPriorityOrder(currentDate, schedulerState)) {
      const emphasisCandidates = exerciseLibrary.filter((exercise) =>
        exercise.roleTags.includes("primary") &&
        exercise.emphasisTags.includes(prioritizedEmphasis) &&
        !selectedIds.has(exercise.id)
      );
      const validCandidates = preferNonHeavyIfDiscouraged(
        filterByRecentExactRepeat(
          filterByHardBlock(emphasisCandidates, currentDate, schedulerState),
          currentDate,
          schedulerState
        ),
        currentDate,
        schedulerState
      );
      if (validCandidates.length > 0) {
        candidates = validCandidates;
        break;
      }
    }
  } else {
    candidates = exerciseLibrary.filter((exercise) =>
      exercise.roleTags.includes("primary") &&
      exercise.emphasisTags.includes(emphasis) &&
      !selectedIds.has(exercise.id)
    );
  }

  candidates = filterByHardBlock(candidates, currentDate, schedulerState);
  candidates = filterByRecentExactRepeat(candidates, currentDate, schedulerState);
  candidates = preferNonHeavyIfDiscouraged(candidates, currentDate, schedulerState);

  return pickLeastRecentlyUsed(candidates, schedulerState.lastPerformedAtByExercise);
}

export function chooseSecondaryExercise(
  currentDate: string,
  emphasis: SessionEmphasis,
  primary: Exercise | null,
  exerciseLibrary: Exercise[],
  schedulerState: SchedulerState,
  selectedExercises: PlannedWorkoutExercise[] = []
): Exercise | null {
  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exerciseId));
  const preferredEmphases = getSecondaryPreferredEmphases(emphasis, primary);

  let candidates = exerciseLibrary.filter((exercise) =>
    exercise.roleTags.includes("secondary") &&
    !selectedIds.has(exercise.id) &&
    preferredEmphases.some((tag) => exercise.emphasisTags.includes(tag))
  );

  candidates = filterByHardBlock(candidates, currentDate, schedulerState);
  candidates = filterByRecentExactRepeat(candidates, currentDate, schedulerState);
  candidates = filterSecondaryOverlap(candidates, primary);
  candidates = preferNonHeavyIfDiscouraged(candidates, currentDate, schedulerState);

  if (emphasis === "squat" || emphasis === "hinge") {
    const upperBodyCandidates = candidates.filter((exercise) => !exercise.legDominant);
    if (upperBodyCandidates.length > 0) {
      candidates = upperBodyCandidates;
    }
  } else {
    const nonLegCandidates = candidates.filter((exercise) => !exercise.legDominant);
    if (nonLegCandidates.length > 0) {
      candidates = nonLegCandidates;
    }
  }

  return pickLeastRecentlyUsed(candidates, schedulerState.lastPerformedAtByExercise);
}

export function chooseAccessories(
  currentDate: string,
  emphasis: SessionEmphasis,
  primary: Exercise | null,
  secondary: Exercise | null,
  exerciseLibrary: Exercise[],
  schedulerState: SchedulerState,
  selectedExercises: PlannedWorkoutExercise[] = []
): Exercise[] {
  const targetCount = emphasis === "squat" || emphasis === "hinge" ? 2 : 3;
  const chosen: Exercise[] = [];
  const chosenIds = new Set(selectedExercises.map((exercise) => exercise.exerciseId));
  if (primary) chosenIds.add(primary.id);
  if (secondary) chosenIds.add(secondary.id);

  const coveredMuscles = new Set<Muscle>([
    ...(primary?.primaryMuscles || []),
    ...(secondary?.primaryMuscles || []),
  ]);

  const muscleTargets = getAccessoryTargets(emphasis, coveredMuscles, schedulerState.unmetWorkByMuscle);

  for (const target of muscleTargets) {
    if (chosen.length >= targetCount) break;

    let candidates = exerciseLibrary.filter((exercise) =>
      exercise.roleTags.includes("accessory") &&
      !exercise.roleTags.includes("core") &&
      !exercise.roleTags.includes("cardio") &&
      !chosenIds.has(exercise.id) &&
      exercise.primaryMuscles.includes(target)
    );

    candidates = filterByHardBlock(candidates, currentDate, schedulerState);
    candidates = filterByRecentExactRepeat(candidates, currentDate, schedulerState);

    const picked = pickLeastRecentlyUsed(candidates, schedulerState.lastPerformedAtByExercise);
    if (!picked) continue;

    chosen.push(picked);
    chosenIds.add(picked.id);
  }

  if (chosen.length < targetCount) {
    let fallbackCandidates = exerciseLibrary.filter((exercise) =>
      exercise.roleTags.includes("accessory") &&
      !exercise.roleTags.includes("core") &&
      !exercise.roleTags.includes("cardio") &&
      !chosenIds.has(exercise.id)
    );
    fallbackCandidates = filterByHardBlock(fallbackCandidates, currentDate, schedulerState);
    fallbackCandidates = filterByRecentExactRepeat(fallbackCandidates, currentDate, schedulerState);

    while (chosen.length < targetCount) {
      const picked = pickLeastRecentlyUsed(fallbackCandidates, schedulerState.lastPerformedAtByExercise);
      if (!picked) break;
      chosen.push(picked);
      chosenIds.add(picked.id);
      fallbackCandidates = fallbackCandidates.filter((exercise) => exercise.id !== picked.id);
    }
  }

  return chosen;
}

export function shouldAddCardio(
  currentDate: string,
  legDominant: boolean,
  selectedExercises: PlannedWorkoutExercise[],
  completedWorkouts: CompletedWorkout[],
  schedulerState: SchedulerState
): boolean {
  if (legDominant) return false;
  if (schedulerState.cardioSessionsLast7Days >= 5) return false;

  const workoutMinutes = getWorkoutMinutes(selectedExercises, 0);
  if (schedulerState.cardioSessionsLast7Days < 3) {
    return workoutMinutes + CARDIO_PRIORITY_MINUTES <= MAX_MINUTES;
  }

  const lastCardioWorkout = getLastCardioWorkout(completedWorkouts);
  if (lastCardioWorkout && hoursBetween(lastCardioWorkout.completedAt, currentDate) < HOURS_48) {
    return false;
  }

  return workoutMinutes + CARDIO_OPTIONAL_MINUTES <= MAX_MINUTES;
}

export function trimToTimeLimit(workout: PlannedWorkout): PlannedWorkout {
  const trimmed: PlannedWorkout = {
    ...workout,
    exercises: [...workout.exercises],
  };

  if (trimmed.estimatedMinutes <= MAX_MINUTES) {
    return trimmed;
  }

  if (trimmed.addCardio) {
    trimmed.addCardio = false;
    trimmed.cardioMinutes = 0;
    trimmed.estimatedMinutes = getWorkoutMinutes(trimmed.exercises, 0);
  }

  if (trimmed.estimatedMinutes > MAX_MINUTES && trimmed.addCore) {
    const coreIndex = trimmed.exercises.findIndex((exercise) => exercise.role === "core");
    if (coreIndex >= 0) {
      trimmed.exercises.splice(coreIndex, 1);
      trimmed.addCore = false;
      trimmed.estimatedMinutes = getWorkoutMinutes(trimmed.exercises, trimmed.cardioMinutes);
    }
  }

  while (trimmed.estimatedMinutes > MAX_MINUTES) {
    const accessoryIndex = findLastAccessoryIndex(trimmed.exercises);
    if (accessoryIndex < 0 || countExercisesByRole(trimmed.exercises, "accessory") <= 2) {
      break;
    }
    trimmed.exercises.splice(accessoryIndex, 1);
    trimmed.estimatedMinutes = getWorkoutMinutes(trimmed.exercises, trimmed.cardioMinutes);
  }

  return trimmed;
}

function normalizeSchedulerState(
  exerciseLibrary: Exercise[],
  completedWorkouts: CompletedWorkout[],
  schedulerState: SchedulerState,
  currentDate: string
): SchedulerState {
  const derived = deriveSchedulerStateFromHistory(exerciseLibrary, completedWorkouts, currentDate);

  return {
    lastTrainedAtByMuscle: mergeTimestampMaps(
      derived.lastTrainedAtByMuscle,
      schedulerState.lastTrainedAtByMuscle
    ),
    lastHeavyCompoundAtByMuscle: mergeTimestampMaps(
      derived.lastHeavyCompoundAtByMuscle || {},
      schedulerState.lastHeavyCompoundAtByMuscle || {}
    ),
    lastPerformedAtByExercise: mergeTimestampMaps(
      derived.lastPerformedAtByExercise,
      schedulerState.lastPerformedAtByExercise
    ),
    recentEmphasisHistory:
      schedulerState.recentEmphasisHistory.length > 0
        ? schedulerState.recentEmphasisHistory
        : derived.recentEmphasisHistory,
    recentLegDominantDays:
      schedulerState.recentLegDominantDays.length > 0
        ? schedulerState.recentLegDominantDays
        : derived.recentLegDominantDays,
    unmetWorkByMuscle: mergeNumericMaps(derived.unmetWorkByMuscle, schedulerState.unmetWorkByMuscle),
    cardioSessionsLast7Days: Math.max(
      derived.cardioSessionsLast7Days,
      schedulerState.cardioSessionsLast7Days
    ),
  };
}

function deriveSchedulerStateFromHistory(
  exerciseLibrary: Exercise[],
  completedWorkouts: CompletedWorkout[],
  currentDate: string
): SchedulerState {
  const exerciseMap = toExerciseMap(exerciseLibrary);
  const state: SchedulerState = {
    lastTrainedAtByMuscle: {},
    lastHeavyCompoundAtByMuscle: {},
    lastPerformedAtByExercise: {},
    recentEmphasisHistory: [],
    recentLegDominantDays: [],
    unmetWorkByMuscle: {},
    cardioSessionsLast7Days: 0,
  };

  const sorted = [...completedWorkouts].sort((a, b) => compareIso(a.completedAt, b.completedAt));

  for (const workout of sorted) {
    state.recentEmphasisHistory.push(workout.emphasis);
    if (workout.legDominant) {
      state.recentLegDominantDays.push(workout.completedAt);
    }

    if (workout.cardioCompleted && hoursBetween(workout.completedAt, currentDate) <= 24 * 7) {
      state.cardioSessionsLast7Days += 1;
    }

    for (const exerciseId of workout.completedExerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) continue;
      state.lastPerformedAtByExercise[exercise.id] = laterTimestamp(
        state.lastPerformedAtByExercise[exercise.id],
        workout.completedAt
      );
      for (const muscle of exercise.primaryMuscles) {
        state.lastTrainedAtByMuscle[muscle] = laterTimestamp(
          state.lastTrainedAtByMuscle[muscle],
          workout.completedAt
        );
        if (exercise.isHeavyCompound) {
          state.lastHeavyCompoundAtByMuscle![muscle] = laterTimestamp(
            state.lastHeavyCompoundAtByMuscle![muscle],
            workout.completedAt
          );
        }
      }
    }

    for (const exerciseId of workout.skippedExerciseIds) {
      const exercise = exerciseMap.get(exerciseId);
      if (!exercise) continue;
      for (const muscle of exercise.primaryMuscles) {
        state.unmetWorkByMuscle[muscle] = (state.unmetWorkByMuscle[muscle] || 0) + 1;
      }
    }
  }

  state.recentEmphasisHistory = state.recentEmphasisHistory.slice(-6);
  state.recentLegDominantDays = state.recentLegDominantDays.slice(-3);

  return state;
}

function emphasisIsReady(
  emphasis: SessionEmphasis,
  currentDate: string,
  exerciseLibrary: Exercise[],
  schedulerState: SchedulerState
) {
  const candidates = exerciseLibrary.filter((exercise) =>
    exercise.roleTags.includes("primary") && exercise.emphasisTags.includes(emphasis)
  );
  return filterByHardBlock(candidates, currentDate, schedulerState).length > 0;
}

function getLastEmphasis(
  recentEmphasisHistory: SessionEmphasis[],
  completedWorkouts: CompletedWorkout[]
): SessionEmphasis | null {
  if (recentEmphasisHistory.length > 0) {
    return recentEmphasisHistory[recentEmphasisHistory.length - 1] || null;
  }
  if (completedWorkouts.length === 0) return null;
  const sorted = [...completedWorkouts].sort((a, b) => compareIso(a.completedAt, b.completedAt));
  return sorted[sorted.length - 1]?.emphasis || null;
}

function getFallbackEmphasisOrder(lastEmphasis: SessionEmphasis | null): SessionEmphasis[] {
  const cycle: SessionEmphasis[] = ["push", "pull", "squat", "hinge"];
  if (!lastEmphasis || !cycle.includes(lastEmphasis)) {
    return cycle;
  }

  const startIndex = cycle.indexOf(lastEmphasis);
  return [
    ...cycle.slice(startIndex + 1),
    ...cycle.slice(0, startIndex + 1),
  ];
}

function getTotalUnmet(
  unmetWorkByMuscle: Partial<Record<Muscle, number>>,
  muscles: Muscle[]
) {
  return muscles.reduce((total, muscle) => total + (unmetWorkByMuscle[muscle] || 0), 0);
}

function recentLegDayTooClose(currentDate: string, recentLegDominantDays: string[]) {
  const latest = recentLegDominantDays[recentLegDominantDays.length - 1];
  if (!latest) return false;
  return hoursBetween(latest, currentDate) < HOURS_48;
}

function getSecondaryPreferredEmphases(
  emphasis: SessionEmphasis,
  primary: Exercise | null
): SessionEmphasis[] {
  if (emphasis === "squat" || emphasis === "hinge") {
    return ["push", "pull"];
  }
  if (emphasis === "push") {
    return ["pull", "mixed"];
  }
  if (emphasis === "pull") {
    return ["push", "mixed"];
  }
  if (!primary) {
    return ["push", "pull", "squat", "hinge"];
  }
  return primary.legDominant ? ["push", "pull"] : ["squat", "hinge", "mixed"];
}

function getMixedPrimaryPriorityOrder(
  currentDate: string,
  schedulerState: SchedulerState
): SessionEmphasis[] {
  const pushUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["chest", "shoulders", "triceps"]);
  const pullUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["upper_back", "lats", "biceps"]);
  const squatUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["quads", "glutes"]);
  const hingeUnmet = getTotalUnmet(schedulerState.unmetWorkByMuscle, ["hamstrings", "glutes"]);

  const ranked = [
    { emphasis: "push" as const, unmet: pushUnmet, tie: 0 },
    { emphasis: "pull" as const, unmet: pullUnmet, tie: 1 },
    { emphasis: "squat" as const, unmet: squatUnmet, tie: 2 },
    { emphasis: "hinge" as const, unmet: hingeUnmet, tie: 3 },
  ].sort((a, b) => {
    if (a.unmet !== b.unmet) return b.unmet - a.unmet;
    return a.tie - b.tie;
  });

  const recentLegDay = recentLegDayTooClose(currentDate, schedulerState.recentLegDominantDays);
  const preferred = ranked
    .filter((item) => !(recentLegDay && (item.emphasis === "squat" || item.emphasis === "hinge")))
    .map((item) => item.emphasis);
  const deferred = ranked
    .filter((item) => recentLegDay && (item.emphasis === "squat" || item.emphasis === "hinge"))
    .map((item) => item.emphasis);

  return [...preferred, ...deferred];
}

function getLastCardioWorkout(completedWorkouts: CompletedWorkout[]) {
  const cardioWorkouts = completedWorkouts
    .filter((workout) => workout.cardioCompleted)
    .sort((a, b) => compareIso(a.completedAt, b.completedAt));

  return cardioWorkouts[cardioWorkouts.length - 1] || null;
}

function filterSecondaryOverlap(candidates: Exercise[], primary: Exercise | null) {
  if (!primary) return candidates;
  const primaryMuscles = new Set(primary.primaryMuscles);
  const filtered = candidates.filter((candidate) =>
    candidate.primaryMuscles.every((muscle) => !primaryMuscles.has(muscle))
  );
  return filtered.length > 0 ? filtered : candidates;
}

function filterByHardBlock(
  candidates: Exercise[],
  currentDate: string,
  schedulerState: SchedulerState
) {
  return candidates.filter((exercise) =>
    exercise.primaryMuscles.every((muscle) =>
      !isWithinHours(schedulerState.lastTrainedAtByMuscle[muscle], currentDate, HOURS_48)
    )
  );
}

function filterByRecentExactRepeat(
  candidates: Exercise[],
  currentDate: string,
  schedulerState: SchedulerState
) {
  const candidateIds = new Set(candidates.map((exercise) => exercise.id));
  const filtered = candidates.filter((exercise) => {
    const repeatedRecently = isWithinHours(
      schedulerState.lastPerformedAtByExercise[exercise.id],
      currentDate,
      THREE_DAYS_IN_HOURS
    );
    if (!repeatedRecently) return true;

    const validAlternativeExists = exercise.alternatives.some((alternativeId) => {
      if (!candidateIds.has(alternativeId)) return false;
      return !isWithinHours(
        schedulerState.lastPerformedAtByExercise[alternativeId],
        currentDate,
        THREE_DAYS_IN_HOURS
      );
    });

    return !validAlternativeExists;
  });

  return filtered.length > 0 ? filtered : candidates;
}

function preferNonHeavyIfDiscouraged(
  candidates: Exercise[],
  currentDate: string,
  schedulerState: SchedulerState
) {
  const discouraged = candidates.filter((exercise) =>
    exercise.isHeavyCompound &&
    exercise.primaryMuscles.some((muscle) =>
      isWithinHours(schedulerState.lastHeavyCompoundAtByMuscle?.[muscle], currentDate, HOURS_72)
    )
  );

  if (discouraged.length === 0) return candidates;

  const preferred = candidates.filter((exercise) => !discouraged.some((item) => item.id === exercise.id));
  return preferred.length > 0 ? preferred : candidates;
}

function pickLeastRecentlyUsed(
  candidates: Exercise[],
  lastPerformedAtByExercise: Partial<Record<string, string>>
) {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aKey = lastPerformedAtByExercise[a.id] || "";
    const bKey = lastPerformedAtByExercise[b.id] || "";
    if (aKey !== bKey) {
      return aKey.localeCompare(bKey);
    }
    return a.id.localeCompare(b.id);
  });

  return sorted[0] || null;
}

function chooseCoreExercise(
  currentDate: string,
  exerciseLibrary: Exercise[],
  schedulerState: SchedulerState,
  selectedExercises: PlannedWorkoutExercise[]
) {
  const selectedIds = new Set(selectedExercises.map((exercise) => exercise.exerciseId));
  let candidates = exerciseLibrary.filter((exercise) =>
    exercise.roleTags.includes("core") &&
    !selectedIds.has(exercise.id)
  );
  candidates = filterByHardBlock(candidates, currentDate, schedulerState);
  candidates = filterByRecentExactRepeat(candidates, currentDate, schedulerState);
  return pickLeastRecentlyUsed(candidates, schedulerState.lastPerformedAtByExercise);
}

function getAccessoryTargets(
  emphasis: SessionEmphasis,
  coveredMuscles: Set<Muscle>,
  unmetWorkByMuscle: Partial<Record<Muscle, number>>
) {
  const defaultOrder = ACCESSORY_PRIORITY_BY_EMPHASIS[emphasis];
  const unmetSorted = [...defaultOrder]
    .filter((muscle) => !coveredMuscles.has(muscle))
    .sort((a, b) => {
      const diff = (unmetWorkByMuscle[b] || 0) - (unmetWorkByMuscle[a] || 0);
      if (diff !== 0) return diff;
      return defaultOrder.indexOf(a) - defaultOrder.indexOf(b);
    });

  const ordered = [...unmetSorted];
  for (const muscle of defaultOrder) {
    if (!coveredMuscles.has(muscle) && !ordered.includes(muscle)) {
      ordered.push(muscle);
    }
  }
  return ordered;
}

function isLegDominantWorkout(
  emphasis: SessionEmphasis,
  exercises: PlannedWorkoutExercise[],
  exerciseMap: ExerciseMap
) {
  if (emphasis === "squat" || emphasis === "hinge") return true;
  const primaryExercise = exercises.find((exercise) => exercise.role === "primary");
  if (!primaryExercise) return false;
  return Boolean(exerciseMap.get(primaryExercise.exerciseId)?.legDominant);
}

function getWorkoutMinutes(exercises: PlannedWorkoutExercise[], cardioMinutes: number) {
  return exercises.reduce((total, exercise) => total + exercise.estimatedMinutes, 0) + cardioMinutes;
}

function toPlannedExercise(exercise: Exercise, role: ExerciseRole): PlannedWorkoutExercise {
  return {
    exerciseId: exercise.id,
    role,
    estimatedMinutes: getExerciseMinutes(role),
  };
}

function getExerciseMinutes(role: ExerciseRole) {
  switch (role) {
    case "primary":
      return PRIMARY_MINUTES;
    case "secondary":
      return SECONDARY_MINUTES;
    case "core":
      return CORE_MINUTES;
    case "cardio":
      return CARDIO_OPTIONAL_MINUTES;
    default:
      return ACCESSORY_MINUTES;
  }
}

function findLastAccessoryIndex(exercises: PlannedWorkoutExercise[]) {
  for (let index = exercises.length - 1; index >= 0; index -= 1) {
    if (exercises[index]?.role === "accessory") return index;
  }
  return -1;
}

function countExercisesByRole(exercises: PlannedWorkoutExercise[], role: ExerciseRole) {
  return exercises.filter((exercise) => exercise.role === role).length;
}

function toExerciseMap(exerciseLibrary: Exercise[]): ExerciseMap {
  return new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));
}

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
    merged[key] = Math.max(merged[key] || 0, right[key] || 0);
  }
  return merged;
}

function laterTimestamp(a?: string | null, b?: string | null) {
  if (!a) return b || undefined;
  if (!b) return a;
  return compareIso(a, b) >= 0 ? a : b;
}

function isWithinHours(from: string | undefined, to: string, hours: number) {
  if (!from) return false;
  return hoursBetween(from, to) < hours;
}

function hoursBetween(from: string, to: string) {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60));
}

function compareIso(a: string, b: string) {
  return new Date(a).getTime() - new Date(b).getTime();
}

export type {
  CompletedWorkout,
  Exercise,
  GenerateNextWorkoutInput,
  Muscle,
  PlannedWorkout,
  PlannedWorkoutExercise,
  SchedulerState,
  SessionEmphasis,
} from "@/lib/scheduler/types";
