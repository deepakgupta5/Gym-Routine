import Link from "next/link";

type NutritionSummary = {
  date: string;
  totals: {
    calories: number;
    protein_g: number;
  };
  targets: {
    calories: number;
    protein_g: number;
  };
  adherence_pct: number;
  seven_day: {
    avg_calories: number;
    avg_protein_g: number;
    avg_adherence_pct: number;
    logged_days: number;
  };
};

type NutritionQuickStatsProps = {
  summary: NutritionSummary;
};

export default function NutritionQuickStats({ summary }: NutritionQuickStatsProps) {
  return (
    <section className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Nutrition Quick Stats</h2>
        <span className="rounded-full border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-xs text-emerald-200">
          {summary.date}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-emerald-800/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100">
          Calories: {Math.round(summary.totals.calories)} / {Math.round(summary.targets.calories)}
        </div>
        <div className="rounded-md border border-emerald-800/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100">
          Protein: {Math.round(summary.totals.protein_g)}g / {Math.round(summary.targets.protein_g)}g
        </div>
        <div className="rounded-md border border-emerald-800/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100">
          Adherence: {Math.round(summary.adherence_pct)}%
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">
          7d Avg Calories: <span className="font-semibold text-gray-100">{Math.round(summary.seven_day.avg_calories)}</span>
        </div>
        <div className="rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">
          7d Avg Protein: <span className="font-semibold text-gray-100">{Math.round(summary.seven_day.avg_protein_g)}g</span>
        </div>
        <div className="rounded-md border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">
          7d Adherence: <span className="font-semibold text-gray-100">{Math.round(summary.seven_day.avg_adherence_pct)}%</span>
          <span className="ml-1 text-gray-400">({summary.seven_day.logged_days} logged)</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/nutrition/today" className="rounded-md border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-emerald-100">
          Open Nutrition Today
        </Link>
        <Link href="/nutrition/trends" className="rounded-md border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-emerald-100">
          Open Nutrition Trends
        </Link>
        <Link href="/nutrition/plan" className="rounded-md border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-emerald-100">
          Generate Meal Plan
        </Link>
      </div>
    </section>
  );
}
