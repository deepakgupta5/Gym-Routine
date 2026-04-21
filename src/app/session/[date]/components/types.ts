export type SelectableSetType = "straight" | "accessory";
export type LoggedSetType = "top" | "backoff" | "straight" | "accessory";

export type SessionView = {
  plan_session_id: string;
  date: string;
  session_type: string;
  is_deload: boolean;
  cardio_minutes: number;
  cardio_saved_at: string | null;
};

export type ExerciseView = {
  plan_exercise_id: string;
  exercise_id: number;
  role: "primary" | "secondary" | "accessory";
  name: string;
  movement_pattern: string;
  targeted_primary_muscle: string | null;
  targeted_secondary_muscle: string | null;
  prescribed_sets: number;
  prescribed_reps_min: number;
  prescribed_reps_max: number;
  rest_seconds: number;
  prev_load: number | null;
  prev_reps: number | null;
  next_target_load: number | null;
  alt_1_name: string | null;
  alt_2_name: string | null;
  // v2 fields - null for legacy sessions
  top_set_target_load_lb: number | null;
  top_set_target_reps: number | null;
  back_off_target_load_lb: number | null;
  back_off_target_reps: number | null;
  per_side_reps: boolean;
  equipment_variant: string | null;
  rationale_code: string | null;
  rationale_text: string | null;
};

export type SetLogView = {
  id: string;
  session_id: string;
  exercise_id: number;
  set_type: LoggedSetType;
  set_index: number;
  load: string;
  reps: number;
  notes: string | null;
  performed_at: string;
};

export type TopSetHistoryEntry = {
  load: string;
  reps: number;
};

export type EntryForm = {
  load: string;
  reps: string;
  setType: SelectableSetType;
  rpe: string;
  notes: string;
};

export type EditForm = {
  load: string;
  reps: string;
  setType: SelectableSetType;
  notes: string;
};
