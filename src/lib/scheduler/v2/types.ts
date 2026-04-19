// v2 scheduler types - independent of v1 scheduler types

export type V2DayType =
  | "push_upper"
  | "pull_upper"
  | "squat_lower"
  | "hinge_lower"
  | "full_body";

export type V2SlotRole = "primary" | "secondary" | "accessory";

// Exercise row with v2 fields (migration 0020)
export interface V2ExerciseRow {
  exercise_id: number;
  name: string;
  muscle_primary: string;
  muscle_secondary: string[];
  equipment_type: string;
  equipment_variants: string[] | null;
  is_unilateral: boolean;
  uses_bodyweight: boolean;
  seed_load_lb: number | null;
  allowed_day_types: string[];
  suitable_slots: string[]; // from migration 0019: primary, secondary, accessory
  user_preference_score: number;
  load_increment_lb: number;
  fatigue_score: number;
  is_enabled: boolean;
}

// Last recorded set_index=1 entry per exercise
export interface V2LastTopSet {
  exercise_id: number;
  last_load: number;
  last_reps: number;
  performed_at: string;
}

// A resolved exercise ready to insert into plan_exercises
export interface V2SelectedExercise {
  exercise: V2ExerciseRow;
  role: V2SlotRole;
  slotIndex: number; // 1-based
  topSetLoad: number;
  topSetReps: number;
  backOffLoad: number;
  backOffReps: number;
  prescribedSets: number;
  prescribedRepsMin: number;
  prescribedRepsMax: number;
  restSeconds: number;
  rationale_code: string;
  rationale_text: string;
  equipment_variant: string | null;
  per_side_reps: boolean;
}
