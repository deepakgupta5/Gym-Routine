"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WeekDay = {
  date: string;
  is_training_day: boolean;
  target_calories: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meal_count: number;
  adherence_pct: number;
};

type WeekResponse = {
  week_start: string;
  days: WeekDay[];
};

type HistoryDay = {
  date: string;
  meal_count: number;
  total_calories: number;
  total_protein_g: number;
  is_training_day: boolean;
  target_calories: number;
  adherence_pct: number;
};

type HistoryResponse = {
  from: string;
  to: string;
  page: number;
  page_size: number;
  total_days: number;
  days: HistoryDay[];
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function toMondayIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function NutritionTrendsClient() {
  const [weekData, setWeekData] = useState<WeekResponse | null>(null);
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTrends() {
    setLoading(true);
    setError(null);

    const today = isoToday();
    const weekStart = toMondayIso(today);
    const from = isoDaysAgo(29);
    const to = today;

    const [weekRes, historyRes] = await Promise.all([
      fetch(`/api/nutrition/week?weekStart=${weekStart}`),
      fetch(`/api/nutrition/history?from=${from}&to=${to}&page=1&pageSize=90`),
    ]);

    const weekJson = (await weekRes.json().catch(() => null)) as WeekResponse | { error?: string } | null;
    const historyJson = (await historyRes.json().catch(() => null)) as HistoryResponse | { error?: string } | null;

    if (!weekRes.ok || !weekJson || ("error" in weekJson && weekJson.error)) {
      const err = weekJson && "error" in weekJson ? weekJson.error : "nutrition_week_failed";
      setError(typeof err === "string" ? err : "nutrition_week_failed");
      setLoading(false);
      return;
    }

    if (!historyRes.ok || !historyJson || ("error" in historyJson && historyJson.error)) {
      const err = historyJson && "error" in historyJson ? historyJson.error : "nutrition_history_failed";
      setError(typeof err === "string" ? err : "nutrition_history_failed");
      setLoading(false);
      return;
    }

    setWeekData(weekJson as WeekResponse);
    setHistoryData(historyJson as HistoryResponse);
    setLoading(false);
  }

  useEffect(() => {
    void loadTrends();
  }, []);

  const weekSummary = useMemo(() => {
    if (!weekData) return null;
    const days = weekData.days;
    const totalCalories = days.reduce((sum, d) => sum + d.total_calories, 0);
    const totalProtein = days.reduce((sum, d) => sum + d.total_protein_g, 0);
    const avgAdherence = days.length > 0 ? days.reduce((sum, d) => sum + d.adherence_pct, 0) / days.length : 0;
    const loggedDays = days.filter((d) => d.meal_count > 0).length;
    return {
      avgCalories: Math.round(totalCalories / Math.max(days.length, 1)),
      avgProtein: Math.round(totalProtein / Math.max(days.length, 1)),
      avgAdherence: clampPct(avgAdherence),
      loggedDays,
      dayCount: days.length,
    };
  }, [weekData]);

  const thirtyDaySeries = useMemo(() => {
    if (!historyData) return [];
    return [...historyData.days].reverse();
  }, [historyData]);

  const thirtyDaySummary = useMemo(() => {
    if (!historyData) return null;
    const days = historyData.days;
    const count = days.length;
    if (count === 0) {
      return {
        avgCalories: 0,
        avgProtein: 0,
        avgAdherence: 0,
        loggedDays: 0,
      };
    }

    const totalCalories = days.reduce((sum, d) => sum + d.total_calories, 0);
    const totalProtein = days.reduce((sum, d) => sum + d.total_protein_g, 0);
    const avgAdherence = days.reduce((sum, d) => sum + d.adherence_pct, 0) / count;

    return {
      avgCalories: Math.round(totalCalories / count),
      avgProtein: Math.round(totalProtein / count),
      avgAdherence: clampPct(avgAdherence),
      loggedDays: count,
    };
  }, [historyData]);

  const weekMaxCalories = useMemo(() => {
    if (!weekData || weekData.days.length === 0) return 1;
    return Math.max(...weekData.days.map((d) => d.total_calories), 1);
  }, [weekData]);

  const thirtyDayMaxAdherence = 100;

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-100">Nutrition Trends</h1>
        <div className="flex gap-2">
          <Link href="/nutrition/today" className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
            Today
          </Link>
          <Link href="/nutrition/history" className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
            History
          </Link>
        </div>
      </div>

      {loading && (
        <div className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400">Loading trends...</div>
      )}

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {weekData && weekSummary && (
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-100">7-Day Trend</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Calories: <span className="font-semibold">{weekSummary.avgCalories}</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Protein: <span className="font-semibold">{weekSummary.avgProtein}g</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Adherence: <span className="font-semibold">{weekSummary.avgAdherence}%</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Logged Days: <span className="font-semibold">{weekSummary.loggedDays}/{weekSummary.dayCount}</span>
            </div>
          </div>

          <div className="grid gap-2">
            {weekData.days.map((day) => {
              const width = Math.max(2, Math.round((day.total_calories / weekMaxCalories) * 100));
              return (
                <div key={day.date} className="rounded-md border border-gray-800 bg-gray-800/40 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                    <span>{day.date}</span>
                    <span>{Math.round(day.total_calories)} kcal | {day.adherence_pct}% adherence</span>
                  </div>
                  <div className="h-2 w-full rounded bg-gray-700">
                    <div className="h-2 rounded bg-blue-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {historyData && thirtyDaySummary && (
        <section className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-100">30-Day Trend</h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Calories: <span className="font-semibold">{thirtyDaySummary.avgCalories}</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Protein: <span className="font-semibold">{thirtyDaySummary.avgProtein}g</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Avg Adherence: <span className="font-semibold">{thirtyDaySummary.avgAdherence}%</span>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
              Logged Days: <span className="font-semibold">{thirtyDaySummary.loggedDays}</span>
            </div>
          </div>

          {thirtyDaySeries.length === 0 ? (
            <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400">
              No logged days in the last 30 days.
            </div>
          ) : (
            <div className="flex items-end gap-1 rounded-md border border-gray-800 bg-gray-800/40 p-3">
              {thirtyDaySeries.map((day) => {
                const h = Math.max(6, Math.round((day.adherence_pct / thirtyDayMaxAdherence) * 96));
                const color = day.adherence_pct >= 90 ? "bg-emerald-500" : day.adherence_pct >= 70 ? "bg-amber-500" : "bg-rose-500";
                return (
                  <div key={day.date} title={`${day.date}: ${day.adherence_pct}%`} className="flex-1">
                    <div className={`w-full rounded-t ${color}`} style={{ height: `${h}px` }} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
