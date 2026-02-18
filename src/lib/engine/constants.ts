import { SessionType } from "@/lib/engine/types";

export const TEMPO = "3-1-1-0";

export const REST_SECONDS = {
  primary: 180,
  secondary: 120,
  accessory: 90,
};

export const SETS_BASELINE = {
  primary: 4,
  secondary: 3,
  accessory: 3,
};

export const SETS_DELOAD = {
  primary: 3,
  secondary: 2,
};

export const REPS = {
  primary: { min: 4, max: 6 },
  secondary: { min: 6, max: 8 },
  accessory: { min: 8, max: 12 },
};

export const CARDIO_BASELINE_MINUTES = 20;
export const UPPER_PUSH_PRIMARY_ROTATION = [9, 10, 11];
export const UPPER_PULL_PRIMARY_ROTATION = [12, 13, 14];
export const LOWER_SQUAT_PRIMARY_ROTATION = [1, 2, 4, 3];
export const LOWER_HINGE_PRIMARY_ROTATION = [5, 7, 6];

export const UPPER_SECONDARY = [12, 13, 14];
export const LOWER_SECONDARY = [5, 7, 6];

export const ACCESSORY_POOLS: Record<string, number[]> = {
  CHEST: [9, 10, 11],
  BACK: [13, 14, 17, 18],
  QUADS: [1, 2, 3, 4],
  GLUTES: [6],
  HAMS: [5, 8],
  SHOULDERS: [22, 23, 15, 16],
  ARMS: [19, 20, 21],
  CORE: [25],
  CALVES: [24],
};

export const ACCESSORY_DROP_PRIORITY = [
  "CALVES",
  "CORE",
  "ARMS",
  "SHOULDERS",
  "BACK",
  "CHEST",
  "HAMS",
  "GLUTES",
  "QUADS",
];

export type SessionTemplate = {
  day: SessionType;
  offset: number;
  is_required: boolean;
  cardio: boolean;
  primaryCatalog?: number[];
  secondaryCatalog?: number[];
  primaryKey?: "UPPER_PUSH" | "UPPER_PULL" | "LOWER_SQUAT" | "LOWER_HINGE";
  secondaryKey?: "UPPER_PUSH" | "UPPER_PULL" | "LOWER_SQUAT" | "LOWER_HINGE";
  accessoryGroups?: string[];
};

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    day: "Mon",
    offset: 0,
    is_required: true,
    cardio: true,
    primaryCatalog: UPPER_PUSH_PRIMARY_ROTATION,
    primaryKey: "UPPER_PUSH",
    secondaryCatalog: UPPER_SECONDARY,
    accessoryGroups: ["SHOULDERS", "ARMS"],
  },
  {
    day: "Tue",
    offset: 1,
    is_required: true,
    cardio: false,
    primaryCatalog: LOWER_SQUAT_PRIMARY_ROTATION,
    primaryKey: "LOWER_SQUAT",
    secondaryCatalog: LOWER_SECONDARY,
    accessoryGroups: ["QUADS", "HAMS"],
  },
  {
    day: "Wed",
    offset: 2,
    is_required: true,
    cardio: true,
    primaryCatalog: UPPER_PULL_PRIMARY_ROTATION,
    primaryKey: "UPPER_PULL",
    secondaryCatalog: UPPER_PUSH_PRIMARY_ROTATION,
    secondaryKey: "UPPER_PUSH",
    accessoryGroups: ["CHEST", "BACK"],
  },
  {
    day: "Thu",
    offset: 3,
    is_required: true,
    cardio: false,
    primaryCatalog: LOWER_HINGE_PRIMARY_ROTATION,
    primaryKey: "LOWER_HINGE",
    secondaryCatalog: LOWER_SQUAT_PRIMARY_ROTATION,
    secondaryKey: "LOWER_SQUAT",
    accessoryGroups: ["GLUTES", "HAMS"],
  },
  {
    day: "Fri",
    offset: 4,
    is_required: true,
    cardio: true,
    primaryCatalog: UPPER_PUSH_PRIMARY_ROTATION,
    primaryKey: "UPPER_PUSH",
    secondaryCatalog: UPPER_PULL_PRIMARY_ROTATION,
    secondaryKey: "UPPER_PULL",
    accessoryGroups: ["CHEST", "BACK"],
  },
  {
    day: "Sat",
    offset: 5,
    is_required: true,
    cardio: false,
    primaryCatalog: LOWER_SQUAT_PRIMARY_ROTATION,
    primaryKey: "LOWER_SQUAT",
    secondaryCatalog: LOWER_HINGE_PRIMARY_ROTATION,
    secondaryKey: "LOWER_HINGE",
    accessoryGroups: ["QUADS", "HAMS"],
  },
];
