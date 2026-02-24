"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type MealTypeOrAuto = MealType | "auto";

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

type NutritionTodayResponse = {
  date: string;
  goals: {
    is_training_day: boolean;
    target_calories: number;
    target_protein_g: number;
    target_fat_g: number;
    target_carbs_g: number;
    target_fiber_g: number;
    target_sugar_g_max: number;
    target_sodium_mg_max: number;
    target_iron_mg: number;
    target_vitamin_d_mcg: number;
    target_water_ml: number;
  };
  totals: {
    total_calories: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
    total_fiber_g: number;
    total_sugar_g: number;
    total_sodium_mg: number;
    total_iron_mg: number;
    total_vitamin_d_mcg: number;
    water_ml: number;
    meal_count: number;
  };
  deltas: {
    calories_remaining: number;
    protein_remaining_g: number;
    fat_remaining_g: number;
    carbs_remaining_g: number;
    fiber_remaining_g: number;
    sugar_headroom_g: number;
    sodium_headroom_mg: number;
    iron_remaining_mg: number;
    vitamin_d_remaining_mcg: number;
    water_remaining_ml: number;
  };
  meals: MealLog[];
};

type Insight = {
  insight_id: string;
  insight_type: "deficiency_alert" | "coaching" | "supplement";
  generated_at: string;
  recommendation_text: string;
  is_dismissed: boolean;
  context_json: Record<string, unknown>;
};

type NutritionInsightsResponse = {
  date: string;
  insights: Insight[];
};

type PhotoParseItem = {
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
  source: "ai";
  confidence: number | null;
  is_user_edited: boolean;
  sort_order: number;
};

type PhotoParseResponse = {
  ok: true;
  items: PhotoParseItem[];
};

type ManualItemDraft = {
  item_name: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type MealDraft = { meal_type: MealType; notes: string };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function asNonNegativeNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function insightTone(insightType: Insight["insight_type"]): string {
  if (insightType === "deficiency_alert") return "border-amber-700 bg-amber-950/30 text-amber-100";
  if (insightType === "supplement") return "border-purple-700 bg-purple-950/30 text-purple-100";
  return "border-sky-700 bg-sky-950/30 text-sky-100";
}

function mapErrorCode(errorCode: string): string {
  switch (errorCode) {
    case "missing_raw_input":
      return "Enter a meal description first.";
    case "parse_failed_manual_required":
      return "AI parse failed. Use manual entry or photo.";
    case "photo_missing":
      return "Select a photo first.";
    case "unsupported_media_type":
      return "Unsupported photo format. Use JPG, PNG, WEBP, or GIF.";
    case "photo_too_large":
      return "Photo is too large. Maximum size is 20MB.";
    case "image_unreadable":
      return "Photo could not be read. Try a clearer image.";
    case "openai_unavailable":
      return "AI is not configured right now. Use manual logging.";
    default:
      return errorCode;
  }
}

export default function NutritionTodayClient() {
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date") || isoToday();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [data, setData] = useState<NutritionTodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [mealType, setMealType] = useState<MealTypeOrAuto>("auto");
  const [rawInput, setRawInput] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [manualMode, setManualMode] = useState(false);
  const [manualItem, setManualItem] = useState<ManualItemDraft>({
    item_name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });

  const [mealDrafts, setMealDrafts] = useState<Record<string, MealDraft>>({});

  async function loadDay(date: string) {
    setLoading(true);
    setPageError(null);

    const res = await fetch(`/api/nutrition/today?date=${date}`);
    const json = (await res.json().catch(() => null)) as NutritionTodayResponse | { error?: string } | null;

    if (!res.ok || !json || ("error" in json && json.error)) {
      const err = json && "error" in json ? json.error : "nutrition_today_failed";
      setPageError(typeof err === "string" ? mapErrorCode(err) : "nutrition_today_failed");
      setLoading(false);
      return;
    }

    setData(json as NutritionTodayResponse);

    const nextDrafts: Record<string, MealDraft> = {};
    for (const meal of (json as NutritionTodayResponse).meals) {
      nextDrafts[meal.meal_log_id] = {
        meal_type: meal.meal_type,
        notes: meal.notes ?? "",
      };
    }
    setMealDrafts(nextDrafts);
    setLoading(false);
  }

  async function loadInsights(date: string) {
    setInsightsLoading(true);
    setInsightsError(null);

    const res = await fetch(`/api/nutrition/insights?date=${date}`);
    const json = (await res.json().catch(() => null)) as NutritionInsightsResponse | { error?: string } | null;

    if (!res.ok || !json || ("error" in json && json.error)) {
      const err = json && "error" in json ? json.error : "nutrition_insights_failed";
      setInsightsError(typeof err === "string" ? mapErrorCode(err) : "nutrition_insights_failed");
      setInsightsLoading(false);
      return;
    }

    setInsights((json as NutritionInsightsResponse).insights ?? []);
    setInsightsLoading(false);
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadDay(selectedDate);
    void loadInsights(selectedDate);
  }, [selectedDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveWithAi() {
    if (!rawInput.trim()) {
      setFormError("Enter a meal description first.");
      return;
    }

    setFormError(null);

    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_date: selectedDate,
        meal_type: mealType,
        raw_input: rawInput,
        notes,
        save_mode: "ai_parse",
      }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;

    if (res.status === 422 && json?.error === "parse_failed_manual_required") {
      setManualMode(true);
      setFormError("AI parse failed. Use manual entry or photo.");
      return;
    }

    if (!res.ok) {
      setFormError(mapErrorCode(json?.error || "nutrition_log_save_failed"));
      return;
    }

    setRawInput("");
    setNotes("");
    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function saveManual() {
    if (!manualItem.item_name.trim()) {
      setFormError("Manual item name is required.");
      return;
    }

    setFormError(null);

    const payload = {
      meal_date: selectedDate,
      meal_type: mealType,
      notes,
      save_mode: "manual",
      items: [
        {
          item_name: manualItem.item_name.trim(),
          quantity: 1,
          unit: "serving",
          calories: asNonNegativeNumber(manualItem.calories),
          protein_g: asNonNegativeNumber(manualItem.protein_g),
          carbs_g: asNonNegativeNumber(manualItem.carbs_g),
          fat_g: asNonNegativeNumber(manualItem.fat_g),
          fiber_g: 0,
          sugar_g: 0,
          sodium_mg: 0,
          iron_mg: 0,
          calcium_mg: 0,
          vitamin_d_mcg: 0,
          vitamin_c_mg: 0,
          potassium_mg: 0,
          source: "manual" as const,
          confidence: null,
          is_user_edited: true,
          sort_order: 1,
        },
      ],
    };

    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setFormError(mapErrorCode(json?.error || "nutrition_log_save_failed"));
      return;
    }

    setManualItem({ item_name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
    setNotes("");
    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function saveFromPhoto() {
    if (!photoFile) {
      setFormError("Select a photo first.");
      return;
    }

    setFormError(null);
    setPhotoSaving(true);

    const formData = new FormData();
    formData.append("photo", photoFile);
    formData.append("meal_date", selectedDate);
    formData.append("meal_type", mealType);

    const parseRes = await fetch("/api/nutrition/log-photo", {
      method: "POST",
      body: formData,
    });

    const parseJson = (await parseRes.json().catch(() => null)) as PhotoParseResponse | { error?: string } | null;

    if (!parseRes.ok || !parseJson || ("error" in parseJson && parseJson.error)) {
      setPhotoSaving(false);
      setFormError(mapErrorCode((parseJson && "error" in parseJson ? parseJson.error : "parse_failed") || "parse_failed"));
      return;
    }

    const parsedItems = (parseJson as PhotoParseResponse).items ?? [];
    if (parsedItems.length === 0) {
      setPhotoSaving(false);
      setFormError("No food items were detected from photo. Try again or add manually.");
      return;
    }

    const saveRes = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_date: selectedDate,
        meal_type: mealType,
        notes,
        save_mode: "manual",
        items: parsedItems,
      }),
    });

    const saveJson = (await saveRes.json().catch(() => null)) as { error?: string } | null;

    if (!saveRes.ok) {
      setPhotoSaving(false);
      setFormError(mapErrorCode(saveJson?.error || "nutrition_log_save_failed"));
      return;
    }

    setPhotoSaving(false);
    setPhotoFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function updateMeal(meal: MealLog) {
    const draft = mealDrafts[meal.meal_log_id];
    if (!draft) return;

    setPageError(null);

    const items = meal.items.map((item) => ({
      meal_item_id: item.meal_item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      iron_mg: item.iron_mg,
      calcium_mg: item.calcium_mg,
      vitamin_d_mcg: item.vitamin_d_mcg,
      vitamin_c_mg: item.vitamin_c_mg,
      potassium_mg: item.potassium_mg,
      source: item.source === "ai" ? "ai" : "manual",
      confidence: item.confidence,
      is_user_edited: true,
      sort_order: item.sort_order,
    }));

    const res = await fetch(`/api/nutrition/log/${meal.meal_log_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_type: draft.meal_type,
        notes: draft.notes,
        items,
      }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setPageError(mapErrorCode(json?.error || "nutrition_log_update_failed"));
      return;
    }

    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function deleteMeal(mealLogId: string) {
    setPageError(null);

    const res = await fetch(`/api/nutrition/log/${mealLogId}`, {
      method: "DELETE",
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;

    if (!res.ok) {
      setPageError(mapErrorCode(json?.error || "nutrition_log_delete_failed"));
      return;
    }

    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  const summary = useMemo(() => {
    if (!data) return null;
    return [
      { label: "Calories", current: Math.round(data.totals.total_calories), target: Math.round(data.goals.target_calories), suffix: "" },
      { label: "Protein", current: Math.round(data.totals.total_protein_g), target: Math.round(data.goals.target_protein_g), suffix: "g" },
      { label: "Carbs", current: Math.round(data.totals.total_carbs_g), target: Math.round(data.goals.target_carbs_g), suffix: "g" },
      { label: "Fat", current: Math.round(data.totals.total_fat_g), target: Math.round(data.goals.target_fat_g), suffix: "g" },
    ];
  }, [data]);

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Nutrition Day</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setFormError(null);
            setPageError(null);
          }}
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100"
        />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-1">
        <Link href="/nutrition/plan" className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-center text-sm text-gray-200">
          Meal Plan
        </Link>
      </div>

      {pageError && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {pageError}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400">
          Loading nutrition data...
        </div>
      )}

      {data && summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                <div className="text-xs text-gray-400">{item.label}</div>
                <div className="text-sm text-gray-100">
                  {item.current}
                  {item.suffix} / {item.target}
                  {item.suffix}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-100">Insights</h2>
              {insightsLoading && <span className="text-xs text-gray-500">Refreshing...</span>}
            </div>

            {insightsError && (
              <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                {insightsError}
              </div>
            )}

            {!insightsError && insights.length === 0 && !insightsLoading && (
              <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400">
                No insights for this date yet. Log meals to generate recommendations.
              </div>
            )}

            {insights.length > 0 && (
              <ul className="space-y-2">
                {insights.map((insight) => (
                  <li key={insight.insight_id} className={`rounded-md border px-3 py-2 text-sm ${insightTone(insight.insight_type)}`}>
                    <div className="mb-1 text-[11px] uppercase tracking-wide opacity-90">{insight.insight_type.replace("_", " ")}</div>
                    <p>{insight.recommendation_text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="mb-3 text-lg font-semibold text-gray-100">Log Meal</h2>

            {formError && (
              <div className="mb-3 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {formError}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={mealType}
                onChange={(e) => {
                  setMealType(e.target.value as MealTypeOrAuto);
                  setFormError(null);
                }}
                className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              >
                <option value="auto">Auto meal type</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="snack">Snack</option>
                <option value="dinner">Dinner</option>
              </select>

              <input
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setFormError(null);
                }}
                placeholder="Notes (optional)"
                className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              />
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                if (e.target.value.trim().length > 0) setFormError(null);
              }}
              placeholder='Example: "Had chicken sandwich and salad for lunch"'
              className="mt-3 min-h-20 w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveWithAi}
                className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white"
              >
                Save With AI
              </button>

              <button
                type="button"
                onClick={() => {
                  setManualMode((v) => !v);
                  setFormError(null);
                }}
                className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                {manualMode ? "Hide Manual" : "Add Manually"}
              </button>
            </div>

            <div className="mt-3 rounded-md border border-gray-700 bg-gray-800/60 p-3">
              <h3 className="mb-2 text-sm font-medium text-gray-100">Photo Logging</h3>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPhotoFile(file);
                    setFormError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-md border border-indigo-700 bg-indigo-600 px-3 py-2 text-sm text-white"
                >
                  Take Photo
                </button>

                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPhotoFile(file);
                    setFormError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                >
                  Upload Photo
                </button>

                <button
                  type="button"
                  onClick={() => void saveFromPhoto()}
                  disabled={!photoFile || photoSaving}
                  className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {photoSaving ? "Saving Photo Meal..." : "Save Photo Meal"}
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-400">
                {photoFile ? `Selected: ${photoFile.name}` : "No photo selected."}
              </div>
            </div>

            {manualMode && (
              <div className="mt-4 rounded-md border border-gray-700 bg-gray-800 p-3">
                <h3 className="mb-2 text-sm font-medium text-gray-100">Manual Item</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={manualItem.item_name}
                    onChange={(e) => setManualItem((prev) => ({ ...prev, item_name: e.target.value }))}
                    placeholder="Item name"
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
                  />
                  <input
                    value={manualItem.calories}
                    onChange={(e) => setManualItem((prev) => ({ ...prev, calories: e.target.value }))}
                    placeholder="Calories"
                    type="number"
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
                  />
                  <input
                    value={manualItem.protein_g}
                    onChange={(e) => setManualItem((prev) => ({ ...prev, protein_g: e.target.value }))}
                    placeholder="Protein (g)"
                    type="number"
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
                  />
                  <input
                    value={manualItem.carbs_g}
                    onChange={(e) => setManualItem((prev) => ({ ...prev, carbs_g: e.target.value }))}
                    placeholder="Carbs (g)"
                    type="number"
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
                  />
                  <input
                    value={manualItem.fat_g}
                    onChange={(e) => setManualItem((prev) => ({ ...prev, fat_g: e.target.value }))}
                    placeholder="Fat (g)"
                    type="number"
                    className="rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void saveManual()}
                  className="mt-3 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white"
                >
                  Save Manual Meal
                </button>
              </div>
            )}
          </div>

          <div className="mt-5">
            <h2 className="mb-3 text-lg font-semibold text-gray-100">Meals</h2>

            {data.meals.length === 0 ? (
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
                No meals logged for this date.
              </div>
            ) : (
              <div className="grid gap-3">
                {data.meals.map((meal) => {
                  const draft = mealDrafts[meal.meal_log_id] ?? {
                    meal_type: meal.meal_type,
                    notes: meal.notes ?? "",
                  };

                  return (
                    <div key={meal.meal_log_id} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={draft.meal_type}
                          onChange={(e) =>
                            setMealDrafts((prev) => ({
                              ...prev,
                              [meal.meal_log_id]: {
                                ...draft,
                                meal_type: e.target.value as MealType,
                              },
                            }))
                          }
                          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="snack">Snack</option>
                          <option value="dinner">Dinner</option>
                        </select>

                        <input
                          value={draft.notes}
                          onChange={(e) =>
                            setMealDrafts((prev) => ({
                              ...prev,
                              [meal.meal_log_id]: {
                                ...draft,
                                notes: e.target.value,
                              },
                            }))
                          }
                          placeholder="Meal notes"
                          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
                        />
                      </div>

                      <div className="mt-2 text-xs text-gray-400">
                        {meal.input_mode} {meal.ai_confidence != null ? `| confidence ${meal.ai_confidence.toFixed(2)}` : ""}
                      </div>

                      <ul className="mt-2 space-y-1 text-sm text-gray-200">
                        {meal.items.map((item) => (
                          <li key={item.meal_item_id} className="rounded-md border border-gray-800 bg-gray-800/40 px-2 py-1">
                            {item.item_name} - {Math.round(item.calories)} kcal, {Math.round(item.protein_g)}g P
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void updateMeal(meal)}
                          className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-xs text-white"
                        >
                          Save Meal
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteMeal(meal.meal_log_id)}
                          className="rounded-md border border-red-700 bg-red-600 px-3 py-2 text-xs text-white"
                        >
                          Delete Meal
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
