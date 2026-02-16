export type SessionType = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type SessionInput = {
  date: string; // YYYY-MM-DD
  session_type: SessionType;
  week_in_block: number;
  is_required: boolean;
  is_deload: boolean;
  cardio_minutes?: number;
  conditioning_minutes?: number;
};

export type PlanExerciseInput = {
  session_key: string; // `${date}::${session_type}`
  exercise_id: number;
  targeted_primary_muscle: string;
  targeted_secondary_muscle?: string | null;
  role: "primary" | "secondary" | "accessory";
  prescribed_sets: number;
  prescribed_reps_min: number;
  prescribed_reps_max: number;
  prescribed_load: number;
  backoff_percent?: number | null;
  rest_seconds: number;
  tempo: string;
  previous_performance_id?: string | null;
  prev_load?: number | null;
  prev_reps?: number | null;
  prev_performed_at?: string | null;
  prev_estimated_1rm?: number | null;
};

export type PlanOutput = {
  sessions: SessionInput[];
  exercises: PlanExerciseInput[];
};
