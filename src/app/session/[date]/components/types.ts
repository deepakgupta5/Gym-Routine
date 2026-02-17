export type SelectableSetType = "top" | "backoff";
export type LoggedSetType = SelectableSetType | "accessory";

export type SessionView = {
  plan_session_id: string;
  date: string;
  session_type: string;
  is_deload: boolean;
  cardio_minutes: number;
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
  prescribed_load: string;
  rest_seconds: number;
  tempo: string;
  prev_load: number | null;
  prev_reps: number | null;
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

export type EntryForm = {
  load: string;
  reps: string;
  setType: SelectableSetType;
};

export type EditForm = {
  load: string;
  reps: string;
  setType: SelectableSetType;
  notes: string;
};
