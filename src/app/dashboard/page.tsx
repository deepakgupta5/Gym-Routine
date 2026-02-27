import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { computeAdaptiveState } from "@/lib/adaptive/computeAdaptive";
import { normalizePrimaryLiftMap, PrimaryCatalogKey } from "@/lib/engine/rotation";
import WeekSummary from "./components/WeekSummary";
import SparklineChart from "./components/SparklineChart";
import WeightChart from "./components/WeightChart";
import NutritionQuickStats from "./components/NutritionQuickStats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBiasState(input: unknown) {
  if (!input || typeof input !== "string") return {};
  try {
    const obj = JSON.parse(input);
    if (obj && typeof obj === "object" && obj.bias_state) return obj.bias_state;
    return {};
  } catch {
    return {};
  }
}

const CATALOG_LABELS: Record<PrimaryCatalogKey, string> = {
  UPPER_PUSH: "Upper Push",
  UPPER_PULL: "Upper Pull",
  LOWER_SQUAT: "Lower Squat",
  LOWER_HINGE: "Lower Hinge",
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    // Profile
    const profileRes = await client.query(
      "select bias_balance, adaptive_enabled, block_id, primary_lift_map from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <h1 className="text-2xl font-semibold text-gray-100">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-400">Profile not found.</p>
        </main>
      );
    }

    const profile = profileRes.rows[0];
    const blockId = profile.block_id;

    // Pending block state
    const blockRes = blockId
      ? await client.query(
          `select pending_bias_balance, pending_cardio_rule, pending_reason, pending_computed_at
           from blocks where block_id = $1`,
          [blockId]
        )
      : { rows: [] };
    const block = blockRes.rows[0] ?? null;

    // Body stats (full history for charts)
    const bodyRes = await client.query(
      `select
         date::text as date,
         weight_lb,
         bodyfat_pct,
         upper_pct,
         lower_pct,
         skeletal_mass,
         bodyfat_lb,
         bmi,
         lean_body_mass_lb,
         bmr_kcal,
         smi_kg_m2,
         left_arm_lb,
         right_arm_lb,
         trunk_lb,
         left_leg_lb,
         right_leg_lb,
         left_arm_ratio,
         right_arm_ratio,
         trunk_ratio,
         left_leg_ratio,
         right_leg_ratio
       from body_stats_daily
       where user_id = $1
       order by 1  asc`,
      [userId]
    );

    // Adaptive state
    const adaptive = computeAdaptiveState(
      bodyRes.rows,
      profile.bias_balance ?? 0,
      parseBiasState(block?.pending_reason)
    );

    // Weekly rollups (last 12 weeks)
    const rollupsRes = await client.query(
      `select week_start_date::text as week_start_date,
              total_sets, total_reps, total_tonnage,
              cardio_minutes, top_sets_count
       from weekly_rollups
       where user_id = $1
       order by week_start_date desc
       limit 12`,
      [userId]
    );

    const rollups = rollupsRes.rows.map((r: Record<string, unknown>) => ({
      week_start_date: String(r.week_start_date),
      total_sets: Number(r.total_sets),
      total_reps: Number(r.total_reps),
      total_tonnage: Number(r.total_tonnage),
      cardio_minutes: Number(r.cardio_minutes),
      top_sets_count: Number(r.top_sets_count),
    }));

    const currentRollup = rollups[0] ?? null;
    const previousRollup = rollups[1] ?? null;

    // Primary lift 1RM series
    const primaryLiftMap = normalizePrimaryLiftMap(profile.primary_lift_map);
    const primaryLiftIds = Array.from(
      new Set(
        Object.values(primaryLiftMap)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v))
      )
    );

    const primaryLiftMetaRes =
      primaryLiftIds.length > 0
        ? await client.query(
            `select exercise_id, name from exercises where exercise_id = any($1::int[])`,
            [primaryLiftIds]
          )
        : { rows: [] };

    const exerciseNames = new Map<number, string>(
      primaryLiftMetaRes.rows.map((r: Record<string, unknown>) => [
        Number(r.exercise_id),
        String(r.name),
      ])
    );

    const primaryTopSetsRes =
      primaryLiftIds.length > 0
        ? await client.query(
            `select exercise_id, performed_at::text as performed_at, estimated_1rm
             from top_set_history
             where user_id = $1 and exercise_id = any($2::int[])
             order by exercise_id, performed_at asc`,
            [userId, primaryLiftIds]
          )
        : { rows: [] };

    // Group by exercise
    const seriesByExercise = new Map<
      number,
      { exercise_id: number; exercise_name: string; points: Array<{ performed_at: string; estimated_1rm: number }> }
    >();

    for (const id of primaryLiftIds) {
      seriesByExercise.set(id, {
        exercise_id: id,
        exercise_name: exerciseNames.get(id) ?? `Exercise ${id}`,
        points: [],
      });
    }

    for (const row of primaryTopSetsRes.rows) {
      const exId = Number(row.exercise_id);
      seriesByExercise.get(exId)?.points.push({
        performed_at: String(row.performed_at),
        estimated_1rm: Number(row.estimated_1rm),
      });
    }

    // Build sparkline data keyed by catalog slot
    const sparklines: Array<{ label: string; points: Array<{ performed_at: string; estimated_1rm: number }> }> = [];
    for (const key of Object.keys(CATALOG_LABELS) as PrimaryCatalogKey[]) {
      const exId = primaryLiftMap[key];
      const series = seriesByExercise.get(exId);
      if (series && series.points.length > 0) {
        sparklines.push({
          label: `${CATALOG_LABELS[key]} - ${series.exercise_name}`,
          points: series.points,
        });
      }
    }

    const buildMetricPoints = (metric: string) =>
      bodyRes.rows
        .map((r: Record<string, unknown>) => {
          const rawValue = r[metric];
          if (rawValue == null || rawValue === "") return null;
          const value = Number(rawValue);
          if (!Number.isFinite(value)) return null;
          return {
            date: String(r.date),
            value,
          };
        })
        .filter((p): p is { date: string; value: number } => p !== null);

    const bodyMetricCharts = [
      {
        key: "weight",
        title: "Body Weight",
        unit: "lb",
        decimals: 1,
        countLabel: "weigh-ins",
        trendClass: adaptive.weight_trend_class,
        points: buildMetricPoints("weight_lb"),
      },
      {
        key: "skeletal",
        title: "Skeletal Mass",
        unit: "",
        decimals: 3,
        countLabel: "measurements",
        points: buildMetricPoints("skeletal_mass"),
      },
      {
        key: "bmr",
        title: "Basal Metabolic Rate",
        unit: "kcal",
        decimals: 0,
        countLabel: "measurements",
        points: buildMetricPoints("bmr_kcal"),
      },
      {
        key: "bodyfat",
        title: "Body Fat %",
        unit: "%",
        decimals: 1,
        countLabel: "measurements",
        points: buildMetricPoints("bodyfat_pct"),
      },
      {
        key: "smi",
        title: "SMI",
        unit: "kg/m2",
        decimals: 1,
        countLabel: "measurements",
        points: buildMetricPoints("smi_kg_m2"),
      },
    ];

    // Nutrition quick summary (today + 7-day)
    const today = todayUtcIso();

    const [nutritionGoalsRes, nutritionRollupRes, nutritionSevenDayRes] = await Promise.all([
      client.query<{ target_calories: number; target_protein_g: number }>(
        `select
           target_calories::float as target_calories,
           target_protein_g::float as target_protein_g
         from nutrition_goals_daily
         where user_id = $1 and goal_date = $2`,
        [userId, today]
      ),
      client.query<{ total_calories: number; total_protein_g: number }>(
        `select
           total_calories::float as total_calories,
           total_protein_g::float as total_protein_g
         from daily_nutrition_rollups
         where user_id = $1 and rollup_date = $2`,
        [userId, today]
      ),
      client.query<{ total_calories: number; total_protein_g: number; target_calories: number }>(
        `select
           dnr.total_calories::float as total_calories,
           dnr.total_protein_g::float as total_protein_g,
           coalesce(ngd.target_calories, 2050)::float as target_calories
         from daily_nutrition_rollups dnr
         left join nutrition_goals_daily ngd
           on ngd.user_id = dnr.user_id
          and ngd.goal_date = dnr.rollup_date
         where dnr.user_id = $1
           and dnr.rollup_date >= ($2::date - interval '6 day')
           and dnr.rollup_date <= $2::date`,
        [userId, today]
      ),
    ]);

    const targetCalories = Number(nutritionGoalsRes.rows[0]?.target_calories ?? 2050);
    const targetProtein = Number(nutritionGoalsRes.rows[0]?.target_protein_g ?? 160);
    const totalCalories = Number(nutritionRollupRes.rows[0]?.total_calories ?? 0);
    const totalProtein = Number(nutritionRollupRes.rows[0]?.total_protein_g ?? 0);

    const adherencePct =
      targetCalories > 0 ? Math.min(100, Math.round((totalCalories / targetCalories) * 100)) : 0;

    const sevenRows = nutritionSevenDayRes.rows;
    const sevenLoggedDays = sevenRows.length;
    const sevenAvgCalories =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => sum + Number(row.total_calories), 0) / sevenRows.length
        : 0;
    const sevenAvgProtein =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => sum + Number(row.total_protein_g), 0) / sevenRows.length
        : 0;
    const sevenAvgAdherence =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => {
            const dayTarget = Number(row.target_calories);
            if (dayTarget <= 0) return sum;
            return sum + Math.min(100, (Number(row.total_calories) / dayTarget) * 100);
          }, 0) / sevenRows.length
        : 0;

    const nutritionSummary = {
      date: today,
      totals: {
        calories: totalCalories,
        protein_g: totalProtein,
      },
      targets: {
        calories: targetCalories,
        protein_g: targetProtein,
      },
      adherence_pct: adherencePct,
      seven_day: {
        avg_calories: sevenAvgCalories,
        avg_protein_g: sevenAvgProtein,
        avg_adherence_pct: sevenAvgAdherence,
        logged_days: sevenLoggedDays,
      },
    };

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold text-gray-100">Dashboard</h1>

        <div className="grid gap-4">
          {/* This Week Summary */}
          <WeekSummary current={currentRollup} previous={previousRollup} />

          {/* Primary Lift Progress */}
          {sparklines.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
                Primary Lifts (Est 1RM)
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {sparklines.map((s) => (
                  <SparklineChart key={s.label} label={s.label} points={s.points} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/50 p-6 text-center">
              <p className="text-sm font-medium text-gray-300">No lift history yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Log your first workout session to track estimated 1RM progress over time.
              </p>
            </div>
          )}

          {/* Body stats trends */}
          <div>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
              Body Stats Trends
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {bodyMetricCharts.map((metric) => (
                <WeightChart
                  key={metric.key}
                  title={metric.title}
                  points={metric.points}
                  unit={metric.unit}
                  decimals={metric.decimals}
                  countLabel={metric.countLabel}
                  trendClass={metric.trendClass}
                />
              ))}
            </div>
          </div>

          {/* Unified nutrition summary */}
          <NutritionQuickStats summary={nutritionSummary} />
        </div>
      </main>
    );
  } finally {
    client.release();
  }
}
