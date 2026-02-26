"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayType = "training" | "rest" | "auto";

type PlanMeal = {
  plan_meal_id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  description: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  items_json: unknown[];
};

type PlanResponse = {
  ok: true;
  plan_id: string;
  plan_date: string;
  ai_model: string;
  total_calories: number;
  total_protein_g: number;
  meals: PlanMeal[];
};

type Insight = {
  insight_id: string;
  insight_type: "deficiency_alert" | "coaching" | "supplement";
  generated_at: string;
  recommendation_text: string;
};

type InsightsResponse = {
  date: string;
  insights: Insight[];
};

const DEFAULT_ALLOWED_PROTEINS = ["chicken", "shrimp", "eggs", "dairy", "plant"] as const;
const FORBIDDEN_PROTEINS = ["fish", "beef", "lamb", "pork", "goat"] as const;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapPlanError(errorCode: string): string {
  if (errorCode === "forbidden_protein_in_plan") {
    return "Generated plan contained forbidden proteins (fish/beef/lamb/pork/goat). Please regenerate.";
  }
  if (errorCode === "invalid_constraints") {
    return "Invalid plan constraints. Keep allowed proteins within chicken, shrimp, eggs, dairy, plant.";
  }
  if (errorCode === "openai_unavailable") {
    return "AI meal plan generation is not configured (OPENAI_API_KEY missing).";
  }
  if (errorCode === "plan_generation_failed") {
    return "AI could not generate a valid plan. Try again with same constraints.";
  }
  if (errorCode === "nutrition_plan_generate_failed") {
    return "Server failed to save generated plan.";
  }
  return errorCode;
}

function insightTone(insightType: Insight["insight_type"]): string {
  if (insightType === "deficiency_alert") return "border-amber-700 bg-amber-950/30 text-amber-100";
  if (insightType === "supplement") return "border-purple-700 bg-purple-950/30 text-purple-100";
  return "border-sky-700 bg-sky-950/30 text-sky-100";
}

export default function NutritionPlanClient() {
  const [planDate, setPlanDate] = useState(isoToday());
  const [dayType, setDayType] = useState<DayType>("auto");
  const [targetCalories, setTargetCalories] = useState("2200");
  const [targetProtein, setTargetProtein] = useState("160");
  const [allowedProteins, setAllowedProteins] = useState<string[]>([...DEFAULT_ALLOWED_PROTEINS]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  const constraintsSummary = useMemo(
    () => `Allowed proteins: ${allowedProteins.join(", ")} | Forbidden proteins: ${FORBIDDEN_PROTEINS.join(", ")}`,
    [allowedProteins]
  );

  async function loadInsights(date: string) {
    setInsightsLoading(true);
    setInsightsError(null);

    const res = await fetch(`/api/nutrition/insights?date=${date}`);
    const json = (await res.json().catch(() => null)) as InsightsResponse | { error?: string } | null;

    if (!res.ok || !json || ("error" in json && json.error)) {
      const err = json && "error" in json ? json.error : "nutrition_insights_failed";
      setInsightsError(typeof err === "string" ? err : "nutrition_insights_failed");
      setInsightsLoading(false);
      return;
    }

    setInsights((json as InsightsResponse).insights ?? []);
    setInsightsLoading(false);
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadInsights(planDate);
  }, [planDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleProtein(value: string) {
    setAllowedProteins((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((p) => p !== value);
        return next.length === 0 ? prev : next;
      }
      return [...prev, value];
    });
  }

  async function generatePlan() {
    setLoading(true);
    setError(null);

    const payload = {
      plan_date: planDate,
      day_type: dayType,
      target_calories: Number(targetCalories),
      target_protein_g: Number(targetProtein),
      constraints: {
        allowed_proteins: allowedProteins,
        forbidden_proteins: [...FORBIDDEN_PROTEINS],
      },
    };

    const res = await fetch("/api/nutrition/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as PlanResponse | { error?: string } | null;

    if (!res.ok || !json || ("error" in json && json.error)) {
      const errorCode = json && "error" in json && typeof json.error === "string" ? json.error : "plan_generation_failed";
      setError(mapPlanError(errorCode));
      setLoading(false);
      return;
    }

    setPlan(json as PlanResponse);
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-100">Meal Plan</h1>
        <Link href="/nutrition/today" className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
          Back to Today
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-red-800 bg-red-950/20 p-3 text-xs text-red-200">
        Forbidden proteins are always blocked: fish, beef, lamb, pork, goat.
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-gray-100">Generate Plan</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              Date
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              />
            </label>

            <label className="text-sm text-gray-300">
              Day Type
              <select
                value={dayType}
                onChange={(e) => setDayType(e.target.value as DayType)}
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              >
                <option value="auto">Auto</option>
                <option value="training">Training</option>
                <option value="rest">Rest</option>
              </select>
            </label>

            <label className="text-sm text-gray-300">
              Target Calories
              <input
                type="number"
                min={1200}
                value={targetCalories}
                onChange={(e) => setTargetCalories(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              />
            </label>

            <label className="text-sm text-gray-300">
              Target Protein (g)
              <input
                type="number"
                min={80}
                value={targetProtein}
                onChange={(e) => setTargetProtein(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm text-gray-300">Allowed Proteins</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DEFAULT_ALLOWED_PROTEINS.map((protein) => (
                <label key={protein} className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={allowedProteins.includes(protein)}
                    onChange={() => toggleProtein(protein)}
                    className="h-4 w-4"
                  />
                  {protein}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">{constraintsSummary}</p>
          </fieldset>

          {error && (
            <div className="mt-4 rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={generatePlan}
            disabled={loading}
            className="mt-4 rounded-md border border-blue-700 bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate Plan"}
          </button>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Insights ({planDate})</h2>
            {insightsLoading && <span className="text-xs text-gray-400">Loading...</span>}
          </div>

          {insightsError && (
            <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {insightsError}
            </div>
          )}

          {!insightsError && insights.length === 0 && !insightsLoading && (
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400">
              No insights available for this day.
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
        </section>
      </div>

      {plan && (
        <section className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-100">Generated Plan ({plan.plan_date})</h2>
            <span className="rounded-full border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300">{plan.ai_model}</span>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Total Calories: <span className="font-semibold">{Math.round(plan.total_calories)}</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Total Protein: <span className="font-semibold">{Math.round(plan.total_protein_g)}g</span>
            </div>
          </div>

          <div className="grid gap-3">
            {plan.meals.map((meal) => (
              <article key={meal.plan_meal_id} className="rounded-md border border-gray-700 bg-gray-800/60 p-3">
                <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">{meal.meal_type}</div>
                <div className="text-sm text-gray-100">{meal.description}</div>
                <div className="mt-2 text-xs text-gray-300">
                  {Math.round(meal.total_calories)} kcal | {Math.round(meal.total_protein_g)}g P | {Math.round(meal.total_carbs_g)}g C | {Math.round(meal.total_fat_g)}g F
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
