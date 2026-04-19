import type { V2DayType, V2SlotRole } from "./types";

// Fixed 5-session rotation (PRD Section 3.3)
export const V2_ROTATION: V2DayType[] = [
  "push_upper",
  "squat_lower",
  "pull_upper",
  "hinge_lower",
  "full_body",
];

// Number of exercise slots per day type
export const SLOT_COUNT: Record<V2DayType, number> = {
  push_upper: 5,
  pull_upper: 5,
  squat_lower: 5,
  hinge_lower: 5,
  full_body: 3,
};

// Role per slot index (0-based) for each day type
export const SLOT_ROLES: Record<V2DayType, V2SlotRole[]> = {
  push_upper:  ["primary", "secondary", "accessory", "accessory", "accessory"],
  pull_upper:  ["primary", "secondary", "accessory", "accessory", "accessory"],
  squat_lower: ["primary", "secondary", "accessory", "accessory", "accessory"],
  hinge_lower: ["primary", "secondary", "accessory", "accessory", "accessory"],
  full_body:   ["primary", "primary",   "primary"],
};

// For full_body, which "origin" day type fills each slot
export const FULL_BODY_SLOT_ORIGIN: Array<"lower" | "push_upper" | "pull_upper"> = [
  "lower",
  "push_upper",
  "pull_upper",
];

// Prescription floors per slot role (PRD Section 2.1 + 2.2)
export const PRESCRIPTION: Record<V2SlotRole, {
  sets: number;
  repsMin: number;
  repsMax: number;
  topSetReps: number;
  backOffReps: number;
  restSeconds: number;
  useBackOff: boolean; // true = top set + back-off; false = straight sets
}> = {
  primary: {
    sets: 3,
    repsMin: 12,
    repsMax: 13,
    topSetReps: 12,
    backOffReps: 13,
    restSeconds: 180,
    useBackOff: true,
  },
  secondary: {
    sets: 3,
    repsMin: 12,
    repsMax: 13,
    topSetReps: 12,
    backOffReps: 13,
    restSeconds: 120,
    useBackOff: true,
  },
  accessory: {
    sets: 3,
    repsMin: 12,
    repsMax: 15,
    topSetReps: 12,
    backOffReps: 15,
    restSeconds: 90,
    useBackOff: false, // straight sets for isolation
  },
};

// Back-off percentage for compound sets (PRD Section 2.2)
export const BACK_OFF_PERCENT = 0.9;

// Weekly minimum sets per muscle group (PRD Section 3.3)
export const WEEKLY_MIN_SETS: Record<string, number> = {
  quads: 12,
  hamstrings: 10,
  glutes: 12,
  chest: 12,
  back: 14,
  shoulders: 12,
  biceps: 8,
  triceps: 8,
  calves: 8,
  core: 6,
};

// Equipment category groups for diversity enforcement (PRD Section 3.4)
export const EQUIPMENT_GROUPS = [
  { name: "barbell_family",  types: ["barbell", "specialty_bar"],                         required: true },
  { name: "dumbbell_family", types: ["dumbbell", "bodyweight"],                           required: true },
  { name: "machine_family",  types: ["machine_selectorized", "machine_plate_loaded", "cable"], required: true },
] as const;

// Session blueprint version written on v2 sessions
export const V2_BLUEPRINT_VERSION = 2;

// Recency window: exclude exercises used as primary/secondary within this many days
export const NO_REPEAT_DAYS = 7;
