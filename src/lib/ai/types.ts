/**
 * AI layer types — shared between text parse, photo parse, and plan generation.
 * All 15 nutrient fields are required on every ParsedFoodItem.
 */

export type ParsedFoodItem = {
  item_name:     string;
  quantity:      number;
  unit:          string;
  calories:      number;
  protein_g:     number;
  carbs_g:       number;
  fat_g:         number;
  fiber_g:       number;
  sugar_g:       number;
  sodium_mg:     number;
  iron_mg:       number;
  calcium_mg:    number;
  vitamin_d_mcg: number;
  vitamin_c_mg:  number;
  potassium_mg:  number;
  confidence:    number;  // 0–1 per item; set by AI or 1.0 for manual
};

export type MealParseResult = {
  items:      ParsedFoodItem[];
  confidence: number;  // overall 0–1; average of item confidences
  model:      string;  // e.g. "gpt-4o-mini" or "gpt-4o"
};
