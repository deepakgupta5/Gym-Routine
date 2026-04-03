export type Muscle =
  | "chest"
  | "upper_back"
  | "lats"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "core";

export type SessionEmphasis = "push" | "pull" | "squat" | "hinge" | "mixed";

export type ExerciseRole = "primary" | "secondary" | "accessory" | "core" | "cardio";

export interface Exercise {
  id: string;
  name: string;
  emphasisTags: SessionEmphasis[];
  roleTags: ExerciseRole[];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  isHeavyCompound: boolean;
  legDominant: boolean;
  estimatedMinutes?: number;
  alternatives: string[];
}

export interface CompletedExercise {
  exerciseId: string;
  completed: boolean;
  skipped: boolean;
}

export interface CompletedWorkout {
  completedAt: string;
  emphasis: SessionEmphasis;
  legDominant: boolean;
  completedExerciseIds: string[];
  skippedExerciseIds: string[];
  cardioCompleted: boolean;
}

export interface PlannedWorkoutExercise {
  exerciseId: string;
  role: ExerciseRole;
  estimatedMinutes: number;
}

export interface PlannedWorkout {
  emphasis: SessionEmphasis;
  legDominant: boolean;
  exercises: PlannedWorkoutExercise[];
  addCore: boolean;
  addCardio: boolean;
  cardioMinutes: number;
  estimatedMinutes: number;
}

export interface SchedulerState {
  lastTrainedAtByMuscle: Partial<Record<Muscle, string>>;
  lastHeavyCompoundAtByMuscle?: Partial<Record<Muscle, string>>;
  lastPerformedAtByExercise: Partial<Record<string, string>>;
  recentEmphasisHistory: SessionEmphasis[];
  recentLegDominantDays: string[];
  unmetWorkByMuscle: Partial<Record<Muscle, number>>;
  cardioSessionsLast7Days: number;
}

export interface GenerateNextWorkoutInput {
  exerciseLibrary: Exercise[];
  completedWorkouts: CompletedWorkout[];
  schedulerState: SchedulerState;
  currentDate: string;
}
