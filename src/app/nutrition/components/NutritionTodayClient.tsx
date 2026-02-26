"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type EntryMode = "ai" | "photo";

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
  ai_model: string;
  ai_confidence: number | null;
  parse_duration_ms?: number | null;
  warnings?: string[];
  items: PhotoParseItem[];
};

type PreviewItem = {
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

type LogPreviewResponse = {
  ok: true;
  ai_model: string;
  items: PreviewItem[];
  ai_confidence: number;
  parse_duration_ms: number;
  warnings: string[];
};

type ApiErrorResponse = {
  error?: string;
  detail?: string;
};

type ReviewMeta = {
  input_mode_hint: "text" | "photo";
  ai_model: string;
  ai_confidence: number | null;
  parse_duration_ms: number | null;
  warnings: string[];
};

type MealDraft = { meal_type: MealType; notes: string };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function asNonNegativeNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function estimateUncertaintyKcal(items: PreviewItem[]): number {
  return items.reduce((sum, item) => {
    const confidence = Math.min(1, Math.max(0, item.confidence ?? 0.5));
    return sum + item.calories * (1 - confidence);
  }, 0);
}

function insightTone(insightType: Insight["insight_type"]): string {
  if (insightType === "deficiency_alert") return "border-amber-700 bg-amber-950/30 text-amber-100";
  if (insightType === "supplement") return "border-purple-700 bg-purple-950/30 text-purple-100";
  return "border-sky-700 bg-sky-950/30 text-sky-100";
}

function mapPreviewParseDetail(detail?: string): string {
  switch (detail) {
    case "ai_not_configured":
      return "AI not configured. Text and Photo parsing are unavailable.";
    case "openai_auth_failed":
      return "AI request failed: API key or model access is invalid.";
    case "openai_rate_limited":
      return "AI request was rate limited. Try again shortly.";
    case "openai_timeout":
      return "AI request timed out. Try again.";
    case "openai_model_unavailable":
      return "AI model is unavailable for this key.";
    case "openai_request_failed":
      return "AI request failed upstream. Try again.";
    case "openai_empty_response":
      return "AI returned an empty response. Try again.";
    case "openai_response_invalid_json":
      return "AI returned an invalid response. Try again.";
    case "parse_empty_items":
      return "AI parse returned no items. Retry with clearer meal text.";
    case "parse_no_meaningful_nutrition":
      return "AI parse had no usable nutrition values. Edit text and retry.";
    default:
      return "AI parse failed. You can retry Text or switch to Photo.";
  }
}

function mapErrorCode(errorCode: string): string {
  switch (errorCode) {
    case "missing_raw_input":
      return "Enter a meal description first.";
    case "parse_failed_manual_required":
      return "AI parse failed or is unavailable. Retry Text or Photo.";
    case "photo_missing":
      return "Select a photo first.";
    case "unsupported_media_type":
      return "Unsupported photo format. Use JPG, PNG, WEBP, or GIF.";
    case "photo_too_large":
      return "Photo is too large. Maximum size is 20MB.";
    case "image_unreadable":
      return "Photo could not be read. Try a clearer image.";
    case "openai_unavailable":
      return "AI is not configured right now.";
    case "invalid_item_fields":
      return "Item details are invalid. Check fields and try again.";
    case "review_required_use_preview":
      return "Review parsed items before saving.";
    case "forbidden_protein_in_meal_log":
      return "This meal contains a forbidden protein (fish, beef, lamb, pork, goat).";
    default:
      return errorCode;
  }
}

function sumMeal(meal: MealLog) {
  return meal.items.reduce(
    (acc, item) => {
      acc.calories += item.calories;
      acc.protein += item.protein_g;
      return acc;
    },
    { calories: 0, protein: 0 }
  );
}

function defaultMealTypeFromLocalTime(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
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

  const [entryMode, setEntryMode] = useState<EntryMode>("ai");
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeFromLocalTime());
  const [rawInput, setRawInput] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [aiInputError, setAiInputError] = useState<string | null>(null);
  const [aiPreviewItems, setAiPreviewItems] = useState<PreviewItem[]>([]);
  const [reviewMeta, setReviewMeta] = useState<ReviewMeta>({
    input_mode_hint: "text",
    ai_model: "gpt-4o-mini",
    ai_confidence: null,
    parse_duration_ms: null,
    warnings: [],
  });
  const [savingAi, setSavingAi] = useState(false);
  const [savingReviewedAi, setSavingReviewedAi] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const [mealDrafts, setMealDrafts] = useState<Record<string, MealDraft>>({});
  const [updatingMealId, setUpdatingMealId] = useState<string | null>(null);
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null);
  const [showClarificationModal, setShowClarificationModal] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<LogPreviewResponse | null>(null);
  const [pendingUncertaintyKcal, setPendingUncertaintyKcal] = useState<number | null>(null);

  function clearFormMessages() {
    setFormError(null);
    setFormSuccess(null);
    setAiInputError(null);
  }


  function applyParsedPreview(parsedJson: LogPreviewResponse) {
    const preview = parsedJson.items ?? [];
    setAiPreviewItems(preview);
    setReviewMeta({
      input_mode_hint: "text",
      ai_model: parsedJson.ai_model,
      ai_confidence: parsedJson.ai_confidence,
      parse_duration_ms: parsedJson.parse_duration_ms,
      warnings: parsedJson.warnings ?? [],
    });
    setFormSuccess("Review parsed items, edit if needed, then Save Reviewed Meal.");
  }

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

    const next = json as NutritionTodayResponse;
    setData(next);
    const nextDrafts: Record<string, MealDraft> = {};
    for (const meal of next.meals) {
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
    const normalizedInput = rawInput.trim();
    if (!normalizedInput) {
      setAiInputError("Enter a meal description first.");
      setEntryMode("ai");
      return;
    }

    clearFormMessages();
    setSavingAi(true);

    const res = await fetch("/api/nutrition/log-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_date: selectedDate,
        meal_type: mealType,
        raw_input: normalizedInput,
        client_tz_offset_min: new Date().getTimezoneOffset(),
      }),
    });

    const json = (await res.json().catch(() => null)) as LogPreviewResponse | ApiErrorResponse | null;

    if (res.status === 422 && json && "error" in json && json.error === "parse_failed_manual_required") {
      setSavingAi(false);
      setEntryMode("ai");
      setFormError(mapPreviewParseDetail(typeof json.detail === "string" ? json.detail : undefined));
      return;
    }

    if (!res.ok || !json || ("error" in json && json.error)) {
      setSavingAi(false);
      setFormError(mapErrorCode((json && "error" in json ? json.error : "nutrition_log_save_failed") || "nutrition_log_save_failed"));
      return;
    }

    const parsedJson = json as LogPreviewResponse;
    const preview = parsedJson.items ?? [];
    if (preview.length === 0) {
      setSavingAi(false);
      setFormError("AI parse returned no items. Retry Text or switch to Photo.");
      setEntryMode("ai");
      return;
    }

    const uncertaintyKcal = estimateUncertaintyKcal(preview);
    if (uncertaintyKcal > 80) {
      setPendingPreview(parsedJson);
      setPendingUncertaintyKcal(roundTwo(uncertaintyKcal));
      setShowClarificationModal(true);
      setSavingAi(false);
      return;
    }

    applyParsedPreview(parsedJson);
    setSavingAi(false);
  }

  function updatePreviewItem(index: number, key: keyof PreviewItem, value: string | number) {
    setAiPreviewItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next: PreviewItem = {
          ...item,
          [key]: typeof value === "string" && key !== "item_name" && key !== "unit"
            ? asNonNegativeNumber(value)
            : value,
          is_user_edited: true,
        } as PreviewItem;
        return next;
      })
    );
  }

  function addPreviewItem() {
    setAiPreviewItems((prev) => [
      ...prev,
      {
        item_name: "",
        quantity: 1,
        unit: "serving",
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
        iron_mg: 0,
        calcium_mg: 0,
        vitamin_d_mcg: 0,
        vitamin_c_mg: 0,
        potassium_mg: 0,
        source: "manual",
        confidence: null,
        is_user_edited: true,
        sort_order: prev.length + 1,
      },
    ]);
  }

  function removePreviewItem(index: number) {
    setAiPreviewItems((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sort_order: idx + 1 }))
    );
  }

  async function saveReviewedAiMeal() {
    if (aiPreviewItems.length === 0) {
      setFormError("No parsed items to save.");
      return;
    }

    const normalized = aiPreviewItems
      .map((item, idx) => ({
        ...item,
        item_name: item.item_name.trim(),
        sort_order: idx + 1,
      }))
      .filter((item) => item.item_name.length > 0);

    if (normalized.length === 0) {
      setFormError("At least one item name is required before saving.");
      return;
    }

    clearFormMessages();
    setSavingReviewedAi(true);

    const res = await fetch("/api/nutrition/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_date: selectedDate,
        meal_type: mealType,
        raw_input: rawInput,
        notes: "",
        save_mode: "ai_reviewed",
        client_tz_offset_min: new Date().getTimezoneOffset(),
        input_mode_hint: reviewMeta.input_mode_hint,
        ai_model: reviewMeta.ai_model,
        ai_confidence: reviewMeta.ai_confidence,
        parse_duration_ms: reviewMeta.parse_duration_ms,
        warnings: reviewMeta.warnings,
        items: normalized,
      }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;

    if (!res.ok) {
      setSavingReviewedAi(false);
      setFormError(mapErrorCode(json?.error || "nutrition_log_save_failed"));
      return;
    }

    setSavingReviewedAi(false);
    setAiPreviewItems([]);
    setReviewMeta({
      input_mode_hint: "text",
      ai_model: "gpt-4o-mini",
      ai_confidence: null,
      parse_duration_ms: null,
      warnings: [],
    });
    setRawInput("");
    setFormSuccess("Reviewed meal saved.");
    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function saveFromPhoto() {
    if (!photoFile) {
      setFormError("Select a photo first.");
      setEntryMode("photo");
      return;
    }

    clearFormMessages();
    setSavingPhoto(true);

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
      setSavingPhoto(false);
      setEntryMode("photo");
      const code = (parseJson && "error" in parseJson ? parseJson.error : "parse_failed") || "parse_failed";
      if (code === "openai_unavailable") {
        setFormError("AI not configured. Photo parsing is unavailable.");
      } else {
        setFormError(mapErrorCode(code));
      }
      return;
    }

    const parsedPhoto = parseJson as PhotoParseResponse;
    const parsedItems = parsedPhoto.items ?? [];
    if (parsedItems.length === 0) {
      setSavingPhoto(false);
      setEntryMode("photo");
      setFormError("No food items were detected from photo. Try a clearer image or switch to Text.");
      return;
    }

    setSavingPhoto(false);
    setAiPreviewItems(parsedItems);
    setReviewMeta({
      input_mode_hint: "photo",
      ai_model: parsedPhoto.ai_model,
      ai_confidence: parsedPhoto.ai_confidence,
      parse_duration_ms: parsedPhoto.parse_duration_ms ?? null,
      warnings: parsedPhoto.warnings ?? [],
    });
    setEntryMode("ai");
    setPhotoFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    setFormSuccess("Photo parsed. Review items, edit if needed, then Save Reviewed Meal.");
  }

  async function updateMeal(meal: MealLog) {
    const draft = mealDrafts[meal.meal_log_id];
    if (!draft) return;

    setPageError(null);
    setUpdatingMealId(meal.meal_log_id);

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
    setUpdatingMealId(null);

    if (!res.ok) {
      setPageError(mapErrorCode(json?.error || "nutrition_log_update_failed"));
      return;
    }

    setFormSuccess("Logged meal updated.");
    await loadDay(selectedDate);
    await loadInsights(selectedDate);
  }

  async function deleteMeal(mealLogId: string) {
    setPageError(null);
    setDeletingMealId(mealLogId);

    const res = await fetch(`/api/nutrition/log/${mealLogId}`, {
      method: "DELETE",
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;

    setDeletingMealId(null);

    if (!res.ok) {
      setPageError(mapErrorCode(json?.error || "nutrition_log_delete_failed"));
      return;
    }

    setFormSuccess("Logged meal deleted.");
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
            setPageError(null);
            clearFormMessages();
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
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-700" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-700" />
              </div>
            ))}
          </div>
          <div className="h-24 animate-pulse rounded-lg border border-gray-700 bg-gray-900" />
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
            <h2 className="mb-3 text-lg font-semibold text-gray-100">Log Meal</h2>

            {formError && (
              <div className="mb-3 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="mb-3 rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                {formSuccess}
              </div>
            )}

            <div className="mb-3">
              <select
                value={mealType}
                onChange={(e) => {
                  setMealType(e.target.value as MealType);
                  clearFormMessages();
                }}
                className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="snack">Snack</option>
                <option value="dinner">Dinner</option>
              </select>

            </div>

            <div className="mb-3">
              <textarea
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  clearFormMessages();
                }}
                placeholder='Describe your meal (example: "Cheese sandwich and milk coffee")'
                className="min-h-24 w-full rounded-md border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-gray-100"
              />
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setEntryMode("ai");
                  clearFormMessages();
                }}
                className={`rounded-md border px-3 py-2 text-sm ${entryMode === "ai" ? "border-blue-700 bg-blue-600 text-white" : "border-gray-600 bg-gray-800 text-gray-100"}`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryMode("photo");
                  clearFormMessages();
                }}
                className={`rounded-md border px-3 py-2 text-sm ${entryMode === "photo" ? "border-blue-700 bg-blue-600 text-white" : "border-gray-600 bg-gray-800 text-gray-100"}`}
              >
                Photo
              </button>
            </div>

            {entryMode === "ai" && (
              <div className="rounded-md border border-gray-700 bg-gray-800/60 p-3">
                <button
                  type="button"
                  onClick={() => void saveWithAi()}
                  disabled={savingAi}
                  className="mt-3 rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {savingAi ? "Parsing..." : "Parse & Review"}
                </button>
                {aiInputError && (
                  <div className="mt-2 text-xs text-amber-300">{aiInputError}</div>
                )}

                {aiPreviewItems.length > 0 && (
                  <div className="mt-4 rounded-md border border-gray-700 bg-gray-900 p-3">
                    <div className="mb-2 text-sm font-medium text-gray-100">Review Parsed Items</div>
                    <div className="space-y-3">
                      {aiPreviewItems.map((item, idx) => (
                        <div key={`${item.item_name}-${idx}`} className="rounded-md border border-gray-700 bg-gray-800 p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-400">Item {idx + 1} ({item.source})</span>
                            <button
                              type="button"
                              onClick={() => removePreviewItem(idx)}
                              className="rounded border border-red-700 bg-red-600 px-2 py-1 text-[11px] text-white"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <input
                              value={item.item_name}
                              onChange={(e) => updatePreviewItem(idx, "item_name", e.target.value)}
                              placeholder="Item"
                              className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
                            />
                            <input
                              value={item.quantity}
                              onChange={(e) => updatePreviewItem(idx, "quantity", e.target.value)}
                              placeholder="Qty"
                              type="number"
                              className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
                            />
                            <input
                              value={item.unit}
                              onChange={(e) => updatePreviewItem(idx, "unit", e.target.value)}
                              placeholder="Unit"
                              className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100"
                            />
                            <input value={item.calories} onChange={(e) => updatePreviewItem(idx, "calories", e.target.value)} placeholder="Calories" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.protein_g} onChange={(e) => updatePreviewItem(idx, "protein_g", e.target.value)} placeholder="Protein g" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.carbs_g} onChange={(e) => updatePreviewItem(idx, "carbs_g", e.target.value)} placeholder="Carbs g" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.fat_g} onChange={(e) => updatePreviewItem(idx, "fat_g", e.target.value)} placeholder="Fat g" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.fiber_g} onChange={(e) => updatePreviewItem(idx, "fiber_g", e.target.value)} placeholder="Fiber g" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.sugar_g} onChange={(e) => updatePreviewItem(idx, "sugar_g", e.target.value)} placeholder="Sugar g" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.sodium_mg} onChange={(e) => updatePreviewItem(idx, "sodium_mg", e.target.value)} placeholder="Sodium mg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.iron_mg} onChange={(e) => updatePreviewItem(idx, "iron_mg", e.target.value)} placeholder="Iron mg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.calcium_mg} onChange={(e) => updatePreviewItem(idx, "calcium_mg", e.target.value)} placeholder="Calcium mg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.vitamin_d_mcg} onChange={(e) => updatePreviewItem(idx, "vitamin_d_mcg", e.target.value)} placeholder="Vitamin D mcg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.vitamin_c_mg} onChange={(e) => updatePreviewItem(idx, "vitamin_c_mg", e.target.value)} placeholder="Vitamin C mg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                            <input value={item.potassium_mg} onChange={(e) => updatePreviewItem(idx, "potassium_mg", e.target.value)} placeholder="Potassium mg" type="number" className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={addPreviewItem}
                        className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
                      >
                        Add Item
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveReviewedAiMeal()}
                        disabled={savingReviewedAi}
                        className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {savingReviewedAi ? "Saving..." : "Save Reviewed Meal"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {entryMode === "photo" && (
              <div className="rounded-md border border-gray-700 bg-gray-800/60 p-3">
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
                      clearFormMessages();
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
                      clearFormMessages();
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
                    disabled={!photoFile || savingPhoto}
                    className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {savingPhoto ? "Saving..." : "Save Photo Meal"}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {photoFile ? `Selected: ${photoFile.name}` : "No photo selected"}
                </div>
              </div>
            )}
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
                          disabled={updatingMealId === meal.meal_log_id}
                          className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50"
                        >
                          {updatingMealId === meal.meal_log_id ? "Updating..." : "Update Meal"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteMeal(meal.meal_log_id)}
                          disabled={deletingMealId === meal.meal_log_id}
                          className="rounded-md border border-red-700 bg-red-600 px-3 py-2 text-xs text-white disabled:opacity-50"
                        >
                          {deletingMealId === meal.meal_log_id ? "Deleting..." : "Delete Meal"}
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
      {showClarificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h3 className="mb-2 text-lg font-semibold text-gray-100">Clarification Needed</h3>
            <p className="mb-3 text-sm text-gray-300">
              Estimated nutrition uncertainty is {pendingUncertaintyKcal ?? 0} kcal. Confirm before saving parsed items.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (pendingPreview) {
                    applyParsedPreview(pendingPreview);
                  }
                  setShowClarificationModal(false);
                  setPendingPreview(null);
                  setPendingUncertaintyKcal(null);
                }}
                className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm text-white"
              >
                Continue with Parsed Items
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowClarificationModal(false);
                  setPendingPreview(null);
                  setPendingUncertaintyKcal(null);
                  setEntryMode("ai");
                }}
                className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
