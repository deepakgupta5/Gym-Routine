"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type HistoryDay = {
  date: string;
  meal_count: number;
  total_calories: number;
  total_protein_g: number;
  is_training_day: boolean;
  target_calories: number;
  adherence_pct: number;
};

type NutritionHistoryResponse = {
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

export default function NutritionHistoryClient() {
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoToday());

  const [data, setData] = useState<NutritionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ from, to, page: "1", pageSize: "30" });
    const res = await fetch(`/api/nutrition/history?${qs.toString()}`);
    const json = (await res.json().catch(() => null)) as NutritionHistoryResponse | { error?: string } | null;

    if (!res.ok || !json || ("error" in json && json.error)) {
      const err = json && "error" in json ? json.error : "nutrition_history_failed";
      setError(typeof err === "string" ? err : "nutrition_history_failed");
      setLoading(false);
      return;
    }

    setData(json as NutritionHistoryResponse);
    setLoading(false);
  }, [from, to]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Nutrition History</h1>

      <div className="mb-4 grid gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3 sm:grid-cols-4">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-gray-100"
        />
        <button
          type="button"
          onClick={() => void loadHistory()}
          className="rounded-md border border-blue-700 bg-blue-600 px-3 py-2 text-sm text-white"
        >
          Refresh
        </button>
        <Link
          href="/nutrition/today"
          className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-center text-sm text-gray-100"
        >
          Go To Today
        </Link>
      </div>

      {loading && (
        <div className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400">
          Loading nutrition history...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-2 text-xs text-gray-400">{data.total_days} day(s) with logged meals</div>
          {data.days.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
              No nutrition days found in this range.
            </div>
          ) : (
            <div className="grid gap-3">
              {data.days.map((day) => (
                <Link
                  key={day.date}
                  href={`/nutrition/today?date=${day.date}`}
                  className="rounded-lg border border-gray-700 bg-gray-900 p-4 active:opacity-80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-100">{day.date}</div>
                      <div className="text-xs text-gray-400">
                        {day.meal_count} meals | {day.is_training_day ? "training" : "rest"} day
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-300">
                      <div>{Math.round(day.total_calories)} kcal</div>
                      <div>{Math.round(day.total_protein_g)}g protein</div>
                      <div>{day.adherence_pct}% adherence</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
