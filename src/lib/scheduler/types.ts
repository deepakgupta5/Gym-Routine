// ─── Muscle / recovery types ──────────────────────────────────────────────────

export type MuscleGroup =
  | "chest"
  | "upper_back"
  | "lats"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "core"
  | "conditioning"
  | "calves";

/** Alias kept for backward-compat with existing scheduler code. */
export type Muscle = MuscleGroup;

export type RecoveryGroup = "push" | "pull" | "legs" | "core";

export type ExerciseCategory =
  | "squat_pattern"
  | "hinge_pattern"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "unilateral_lower_body"
  | "chest_accessory"
  | "shoulder_accessory"
  | "back_accessory"
  | "quads_accessory"
  | "hamstrings_glutes_accessory"
  | "arms"
  | "core"
  | "cardio"
  | string; // allow DB-defined categories not yet in this enum

// ─── Exercise ─────────────────────────────────────────────────────────────────

export type ExerciseSlotType = "primary" | "secondary" | "accessory";

/** Superset of ExerciseSlotType; kept for backward-compat. */
export type ExerciseRole = ExerciseSlotType | "core" | "cardio";

export type SessionEmphasis = "push" | "pull" | "squat" | "hinge" | "mixed";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  emphasisTags: SessionEmphasis[];

  // Slot eligibility
  suitableSlots: ExerciseSlotType[];
  /** @deprecated Use suitableSlots. Kept for backward-compat with old scheduler code. */
  roleTags: ExerciseRole[];

  // Muscles
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];

  // Fatigue / scheduling signals
  fatigueScore: 1 | 2 | 3 | 4 | 5;
  complexityScore: 1 | 2 | 3 | 4 | 5;
  /** Derived: fatigueScore >= 4 and compound (non-accessory) category. */
  isHeavyCompound: boolean;
  legDominant: boolean;

  // Rotation
  alternatives: string[]; // exercise IDs of valid alternates in same movement family

  // Optional time estimate
  estimatedMinutes?: number;

  enabled: boolean;
}

// ─── Muscle exposure (recorded after a completed exercise) ────────────────────

export interface MuscleExposure {
  exerciseId: string;
  completedAt: string;
  muscleGroup: MuscleGroup;
  directness: "direct" | "indirect";
  slotType: ExerciseSlotType;
  loadScore: number;
  hardReadyAt: string | null; // ISO — muscle hard-blocked until this time
  softReadyAt: string | null; // ISO — soft penalty lifts after this time
  sourceFatigueScore: number;
  sourceWasCompound: boolean;
}

// ─── Completed workout (recorded history) ────────────────────────────────────

export interface CompletedExercise {
  exerciseId: string;
  completed: boolean;
  skipped: boolean;
  completedSets?: number;
  prescribedSets?: number;
  avgRpe?: number | null;
  muscleExposures?: MuscleExposure[];
}

export interface CompletedWorkout {
  workoutId?: string;
  completedAt: string;
  emphasis: SessionEmphasis;
  legDominant: boolean;
  completedExerciseIds: string[];
  skippedExerciseIds: string[];
  cardioCompleted: boolean;
  resistanceExercises?: CompletedExercise[];
}

// ─── Planned workout ──────────────────────────────────────────────────────────

export interface PlannedWorkoutExercise {
  exerciseId: string;
  orderIndex: number;
  role: ExerciseRole;
  slotType: ExerciseSlotType;
  rationaleTags: string[];
  estimatedMinutes: number;
}

export interface CardioRecommendation {
  include: boolean;
  minutes: number;
  intensityNote: string;
  reason: string;
}

export interface PlannedWorkout {
  workoutId?: string;
  emphasis: SessionEmphasis;
  legDominant: boolean;
  exercises: PlannedWorkoutExercise[];
  cardioRecommendation: CardioRecommendation;
  // Legacy shape kept for backward-compat with insertPlannedWorkout in integration.ts
  addCore: boolean;
  addCardio: boolean;
  cardioMinutes: number;
  estimatedResistanceMinutes: number;
  estimatedMinutes: number;
}

// ─── Scheduler state (cached between runs) ────────────────────────────────────

export interface SchedulerState {
  // Per-muscle timestamps
  lastTrainedAtByMuscle: Partial<Record<MuscleGroup, string>>;
  lastHeavyCompoundAtByMuscle: Partial<Record<MuscleGroup, string>>;
  /** Hard recovery gate: muscle is blocked until this timestamp. */
  hardReadyAtByMuscle: Partial<Record<MuscleGroup, string>>;
  /** Soft recovery preference: candidate penalised if before this timestamp. */
  softReadyAtByMuscle: Partial<Record<MuscleGroup, string>>;
  /** Decayed cumulative fatigue load per muscle (fades over ~72 h). */
  fatigueLoadByMuscle: Partial<Record<MuscleGroup, number>>;

  // Per-exercise timestamps
  lastPerformedAtByExercise: Partial<Record<string, string>>;
  recentExerciseIds: string[]; // last 20

  // Session-level history
  recentMovementPatternHistory: string[]; // last 12
  recentEmphasisHistory: SessionEmphasis[]; // last 6
  recentLegDominantDays: string[]; // timestamps, last 3

  // Unmet work
  unmetWorkByMuscle: Partial<Record<MuscleGroup, number>>;
  unmetWorkByMovementFamily: Partial<Record<string, number>>;

  // Cardio
  cardioSessionsLast7Days: number;
}

// ─── Generator input ──────────────────────────────────────────────────────────

export interface GenerateNextWorkoutInput {
  exerciseLibrary: Exercise[];
  completedWorkouts: CompletedWorkout[];
  schedulerState: SchedulerState;
  currentDate: string;
  maxSessionMinutes?: number;
}
