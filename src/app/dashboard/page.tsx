import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { computeAdaptiveState } from "@/lib/adaptive/computeAdaptive";
import { normalizePrimaryLiftMap, PrimaryCatalogKey } from "@/lib/engine/rotation";
import WeekSummary from "./components/WeekSummary";
import SparklineChart from "./components/SparklineChart";
import WeightChart from "./components/WeightChart";
import AdaptiveStatusBadge from "./components/AdaptiveStatusBadge";

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

    // Body stats (last 60 days for chart)
    const bodyRes = await client.query(
      `select date::text as date, weight_lb, bodyfat_pct, upper_pct, lower_pct
       from body_stats_daily
       where user_id = $1
       order by date asc`,
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
          label: `${CATALOG_LABELS[key]} \u2014 ${series.exercise_name}`,
          points: series.points,
        });
      }
    }

    // Body weight points for chart (last 30 days)
    const weightPoints = bodyRes.rows
      .filter((r: Record<string, unknown>) => r.weight_lb != null)
      .slice(-30)
      .map((r: Record<string, unknown>) => ({
        date: String(r.date),
        weight_lb: Number(r.weight_lb),
      }));

    // Last upload date
    const lastUploadDate =
      bodyRes.rows.length > 0 ? String(bodyRes.rows[bodyRes.rows.length - 1].date) : null;

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold text-gray-100">Dashboard</h1>

        <div className="grid gap-4">
          {/* This Week Summary */}
          <WeekSummary current={currentRollup} previous={previousRollup} />

          {/* Primary Lift Progress */}
          {sparklines.length > 0 && (
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
          )}

          {/* Body Weight Trend */}
          <WeightChart points={weightPoints} trendClass={adaptive.weight_trend_class} />

          {/* Adaptive Status */}
          <AdaptiveStatusBadge
            weightTrendClass={adaptive.weight_trend_class}
            biasBalance={adaptive.updated_bias_balance}
            adaptiveEnabled={adaptive.adaptive_enabled}
            pendingCardioRule={adaptive.pending_cardio_rule}
            lbsPerWeek={adaptive.weight_trend_lbs_per_week}
          />

          {/* Upload Reminder + Export */}
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-400">
            <div>
              {lastUploadDate
                ? `Last body stats upload: ${lastUploadDate}`
                : "No body stats uploaded yet."}
              {" \u2014 "}
              <span className="text-gray-300">
                Pending updates will apply at next block regeneration.
              </span>
            </div>
            <div className="mt-2">
              <a
                href="/api/export/set-logs"
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-gray-100 active:opacity-80"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                Export CSV
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  } finally {
    client.release();
  }
}
