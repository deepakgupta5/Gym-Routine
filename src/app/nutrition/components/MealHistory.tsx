"use client";

import { memo } from "react";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type MealItem = {
  meal_item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  vitamin_d_mcg: number;
  vitamin_c_mg: number;
  potassium_mg: number;
  source: "ai" | "manual";
  confidence: number | null;
  is_user_edited: boolean;
  sort_order: number;
};

type MealLog = {
  meal_log_id: string;
  meal_type: MealType;
  raw_input: string | null;
  input_mode: "text" | "photo" | "text_photo" | "manual";
  ai_confidence: number | null;
  notes: string | null;
  created_at: string;
  items: MealItem[];
};

type MealDraft = { meal_type: MealType; notes: string };

type MealHistoryProps = {
  meals: MealLog[];
  mealDrafts: Record<string, MealDraft>;
  onDraftChange: (updater: (prev: Record<string, MealDraft>) => Record<string, MealDraft>) => void;
  onUpdateMeal: (meal: MealLog) => void;
  onDeleteMeal: (mealLogId: string) => void;
  updatingMealId: string | null;
  deletingMealId: string | null;
};

function sumMeal(meal: MealLog) {
  return meal.items.reduce(
    (acc, item) => { acc.calories += item.calories; acc.protein += item.protein_g; return acc; },
    { calories: 0, protein: 0 }
  );
}

const MealHistory = memo(function MealHistory({
  meals, mealDrafts, onDraftChange, onUpdateMeal, onDeleteMeal,
  updatingMealId, deletingMealId,
}: MealHistoryProps) {
  if (meals.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
        No meals logged for this date.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {meals.map((meal) => {
        const draft = mealDrafts[meal.meal_log_id] ?? { meal_type: meal.meal_type, notes: meal.notes ?? "" };
        const mealTotals = sumMeal(meal);

        return (
          <div key={meal.meal_log_id} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <div className="mb-2 text-xs text-gray-400">
              {meal.input_mode}
              {meal.ai_confidence != null ? ` | confidence ${meal.ai_confidence.toFixed(2)}` : ""}
            </div>
            <div className="mb-2 text-sm text-gray-200">
              {Math.round(mealTotals.calories)} kcal | {Math.round(mealTotals.protein)}g protein
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={draft.meal_type}
                onChange={(e) => onDraftChange((prev) => ({ ...prev, [meal.meal_log_id]: { ...draft, meal_type: e.target.value as MealType } }))}
                className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="snack">Snack</option>
                <option value="dinner">Dinner</option>
              </select>
              <input
                value={draft.notes}
                onChange={(e) => onDraftChange((prev) => ({ ...prev, [meal.meal_log_id]: { ...draft, notes: e.target.value } }))}
                placeholder="Meal notes"
                className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              />
            </div>

            <ul className="mt-2 space-y-1 text-sm text-gray-200">
              {meal.items.map((item) => (
                <li key={item.meal_item_id} className="rounded-md border border-gray-800 bg-gray-800/40 px-2 py-1">
                  {item.item_name} - {Math.round(item.calories)} kcal, {Math.round(item.protein_g)}g P
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onUpdateMeal(meal)} disabled={updatingMealId === meal.meal_log_id}
                className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">
                {updatingMealId === meal.meal_log_id ? "Updating..." : "Update Meal"}
              </button>
              <button type="button" onClick={() => onDeleteMeal(meal.meal_log_id)} disabled={deletingMealId === meal.meal_log_id}
                className="rounded-md border border-red-700 bg-red-600 px-3 py-2 text-xs text-white disabled:opacity-50">
                {deletingMealId === meal.meal_log_id ? "Deleting..." : "Delete Meal"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default MealHistory;
export type { MealLog, MealDraft };
