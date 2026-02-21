// Shared primitive types for all nutrition features.
// Import from here rather than repeating inline literals.

/** ISO 8601 calendar date string: "YYYY-MM-DD" */
export type ISODate = string;

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** meal_type field on API inputs — "auto" resolves server-side from clock */
export type MealTypeOrAuto = MealType | "auto";

/** How a meal_log was captured */
export type InputMode = "text" | "photo" | "text_photo" | "manual";

/** Whether the route should AI-parse raw_input or trust caller-supplied items */
export type SaveMode = "ai_parse" | "manual";

export type InsightType = "deficiency_alert" | "coaching" | "supplement";

/** Training-day classification for goal generation */
export type DayType = "training" | "rest" | "auto";

export type NutritionGoal = "cut" | "maintain" | "bulk";

/** Shape of a single item in the POST /api/nutrition/log items array */
export type MealItemInput = {
  meal_item_id?:  string | null;  // omit or null for new items
  item_name:      string;
  quantity:       number;
  unit:           string;
  calories:       number;
  protein_g:      number;
  carbs_g:        number;
  fat_g:          number;
  fiber_g:        number;
  sugar_g:        number;
  sodium_mg:      number;
  iron_mg:        number;
  calcium_mg:     number;
  vitamin_d_mcg:  number;
  vitamin_c_mg:   number;
  potassium_mg:   number;
  source:         "ai" | "manual";
  confidence:     number | null;   // null for manual items
  is_user_edited: boolean;
  sort_order:     number;
};

/** Parsed from multipart/form-data in POST /api/nutrition/log-photo */
export type PhotoLogFormData = {
  photo:      File;              // required; jpeg | png | webp | gif; max 20 MB
  meal_date?: ISODate;           // optional; defaults to server today
  meal_type?: MealTypeOrAuto;    // optional; defaults to "auto"
};

/** Query params for GET /api/nutrition/today */
export type NutritionTodayQuery = {
  date?: ISODate;   // defaults to server today (UTC)
};

/** Query params for GET /api/nutrition/week */
export type NutritionWeekQuery = {
  week_start?: ISODate;  // Monday ISO date; defaults to current week Monday
};

/** Query params for GET /api/nutrition/history */
export type NutritionHistoryQuery = {
  page?:     number;  // 1-based; default 1
  per_page?: number;  // default 20; max 100
};

/** Query params for GET /api/nutrition/insights */
export type NutritionInsightsQuery = {
  date?: ISODate;   // defaults to server today (UTC)
};
