import Link from "next/link";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { WEEKLY_MIN_SETS } from "@/lib/scheduler/v2/constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// --- Types -------------------------------------------------------------------

type MuscleRow   = { muscle_primary: string; sets: number };
type WeekRow     = { week_start: string; total_sets: number; tonnage: number; cardio_minutes: number };
type DayTypeRow  = { session_type: string; count: number };
type SessionRow  = {
  date: string; session_type: string; is_deload: boolean;
  cardio_minutes: number; working_sets: number; warmup_sets: number; tonnage: number;
};

// --- Constants ---------------------------------------------------------------

const MUSCLE_LABELS: Record<string, string> = {
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes",
  chest: "Chest", back: "Back", shoulders: "Shoulders",
  biceps: "Biceps", triceps: "Triceps", calves: "Calves",
};

const DAY_TYPE_LABELS: Record<string, string> = {
  push_upper: "Push Upper", squat_lower: "Squat Lower",
  pull_upper: "Pull Upper", hinge_lower: "Hinge Lower", full_body: "Full Body",
};

const DAY_TYPE_COLORS: Record<string, string> = {
  push_upper: "bg-blue-500/20 border-blue-600 text-blue-300",
  squat_lower: "bg-purple-500/20 border-purple-600 text-purple-300",
  pull_upper: "bg-teal-500/20 border-teal-600 text-teal-300",
  hinge_lower: "bg-amber-500/20 border-amber-600 text-amber-300",
  full_body: "bg-gray-500/20 border-gray-600 text-gray-300",
};

// --- Helpers -----------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function isoToDisplay(iso: string): string {
  // "2026-06-17" -> "Jun 17"
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function weekLabel(iso: string): string {
  // "2026-06-16" -> "Jun 16"
  return isoToDisplay(iso);
}

// --- Sub-components (pure, no async) -----------------------------------------

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function MuscleVolumeSection({ rows }: { rows: MuscleRow[] }) {
  // Build map from DB results
  const setsMap = new Map(rows.map((r) => [r.muscle_primary, r.sets]));

  // Build display rows for all tracked muscles, fill 0 for missing
  const MONTHLY_MIN = Object.fromEntries(
    Object.entries(WEEKLY_MIN_SETS).map(([m, w]) => [m, w * 4])
  );

  const displayRows = Object.keys(MUSCLE_LABELS).map((muscle) => ({
    muscle,
    sets: setsMap.get(muscle) ?? 0,
    min: MONTHLY_MIN[muscle] ?? 0,
  }));

  // Sort: largest deficit fraction first
  displayRows.sort((a, b) => {
    const da = a.min > 0 ? (a.min - a.sets) / a.min : 0;
    const db = b.min > 0 ? (b.min - b.sets) / b.min : 0;
    return db - da;
  });

  const anyData = displayRows.some((r) => r.sets > 0);

  return (
    <div>
      <SectionHeader title="Muscle Volume" sub="Last 30 days vs monthly minimum (4x weekly target)" />
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
        {!anyData && (
          <p className="py-2 text-center text-sm text-gray-500">No sets logged in the last 30 days.</p>
        )}
        <div className="flex flex-col gap-3">
          {displayRows.map(({ muscle, sets, min }) => {
            const barMax  = min * 2;
            const fillPct = barMax > 0 ? Math.min((sets / barMax) * 100, 100) : 0;
            const color   = sets === 0 ? "bg-gray-700"
              : sets < min        ? "bg-orange-500"
              : sets >= min * 1.5 ? "bg-blue-400"
              : "bg-green-500";
            const textColor = sets === 0 ? "text-gray-600"
              : sets < min        ? "text-orange-400"
              : sets >= min * 1.5 ? "text-blue-400"
              : "text-green-400";
            const pct = min > 0 ? Math.round((sets / min) * 100) : 0;
            return (
              <Link
                key={muscle}
                href={`/history?muscle=${encodeURIComponent(muscle)}`}
                className="group flex items-center gap-2.5"
              >
                <span className="w-[4.5rem] shrink-0 text-xs text-gray-300 group-hover:text-gray-100 transition-colors">
                  {MUSCLE_LABELS[muscle]}
                </span>
                <div className="relative flex-1 h-2.5 rounded-full bg-gray-800 overflow-hidden"
                  title={`${sets} sets (target: ${min})`}>
                  {sets > 0 && (
                    <div className={`absolute left-0 top-0 h-full ${color} transition-[width] duration-300`}
                      style={{ width: `${fillPct}%` }} />
                  )}
                  {/* Minimum tick at 50% = min/(2*min) */}
                  <div className="absolute top-0 h-full w-px bg-white/30 z-10" style={{ left: "50%" }} />
                </div>
                <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${textColor}`}>
                  {sets} / {min}
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-gray-600 tabular-nums">
                  {pct}%
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-800 pt-3">
          {[
            ["bg-orange-500", "Under target"],
            ["bg-green-500", "On track"],
            ["bg-blue-400", "High volume"],
          ].map(([cls, lbl]) => (
            <span key={lbl} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className={`inline-block h-2 w-4 rounded-full ${cls}`} />
              {lbl}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block h-2 w-px bg-white/30" />
            Monthly target
          </span>
        </div>
      </div>
    </div>
  );
}

function WeeklyTrendSection({ rows }: { rows: WeekRow[] }) {
  const maxSets    = Math.max(...rows.map((r) => r.total_sets), 1);
  const maxTonnage = Math.max(...rows.map((r) => r.tonnage), 1);

  return (
    <div>
      <SectionHeader title="8-Week Trend" sub="Working sets and tonnage per week (most recent first)" />
      <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
        {rows.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No weekly data yet.</p>
        )}
        <div className="divide-y divide-gray-800">
          {rows.map((row, i) => {
            const setsPct    = Math.round((row.total_sets / maxSets) * 100);
            const tonnagePct = Math.round((row.tonnage / maxTonnage) * 100);
            return (
              <div key={row.week_start} className="grid grid-cols-[6rem_1fr] gap-3 px-4 py-3 items-center">
                <div>
                  <div className={`text-xs font-medium ${i === 0 ? "text-blue-400" : "text-gray-300"}`}>
                    {weekLabel(row.week_start)}
                    {i === 0 && <span className="ml-1 text-[10px] text-blue-500">(cur)</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-600">
                    {row.cardio_minutes > 0 ? `${row.cardio_minutes} min cardio` : ""}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {/* Sets bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-12 text-right text-[10px] text-gray-500 tabular-nums">
                      {row.total_sets} sets
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-800">
                      <div className="h-full rounded-full bg-blue-500"
                        style={{ width: `${setsPct}%` }} />
                    </div>
                  </div>
                  {/* Tonnage bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-12 text-right text-[10px] text-gray-500 tabular-nums">
                      {fmt(row.tonnage)} lb
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-800">
                      <div className="h-full rounded-full bg-teal-500"
                        style={{ width: `${tonnagePct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayTypeSection({ rows, totalSessions }: { rows: DayTypeRow[]; totalSessions: number }) {
  const V2_ORDER = ["push_upper", "squat_lower", "pull_upper", "hinge_lower", "full_body"];

  // Fill in 0 for any missing day type
  const countMap = new Map(rows.map((r) => [r.session_type, r.count]));
  const allTypes = V2_ORDER.map((dt) => ({ type: dt, count: countMap.get(dt) ?? 0 }));
  const maxCount = Math.max(...allTypes.map((r) => r.count), 1);

  return (
    <div>
      <SectionHeader
        title="Day Type Distribution"
        sub={`Last 60 days -- ${totalSessions} sessions total`}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {allTypes.map(({ type, count }) => {
          const pct = Math.round((count / maxCount) * 100);
          const colorClass = DAY_TYPE_COLORS[type] ?? "bg-gray-800 border-gray-700 text-gray-400";
          return (
            <div key={type}
              className={`rounded-lg border p-3 ${colorClass}`}>
              <div className="text-xs font-medium">{DAY_TYPE_LABELS[type] ?? type}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{count}</div>
              {/* Mini bar relative to max */}
              <div className="mt-2 h-1 rounded-full bg-black/20">
                <div className="h-full rounded-full bg-current opacity-60"
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[10px] opacity-60">
                {totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0}% of sessions
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentSessionsSection({ rows }: { rows: SessionRow[] }) {
  return (
    <div>
      <SectionHeader title="Recent Sessions" sub="Last 14 performed sessions" />
      <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
        {rows.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No sessions logged yet.</p>
        )}
        <div className="divide-y divide-gray-800">
          {/* Header */}
          <div className="grid grid-cols-[5rem_1fr_4rem_4rem_5rem] gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-600">
            <span>Date</span>
            <span>Type</span>
            <span className="text-right">Sets</span>
            <span className="text-right">Cardio</span>
            <span className="text-right">Tonnage</span>
          </div>
          {rows.map((row) => {
            const colorClass = DAY_TYPE_COLORS[row.session_type] ?? "";
            const dayLabel   = DAY_TYPE_LABELS[row.session_type] ?? row.session_type;
            return (
              <div key={row.date}
                className="grid grid-cols-[5rem_1fr_4rem_4rem_5rem] gap-2 px-4 py-3 items-center">
                <span className="text-xs text-gray-300">{isoToDisplay(row.date)}</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium border ${colorClass}`}>
                    {dayLabel}
                  </span>
                  {row.is_deload && (
                    <span className="rounded px-1 py-0.5 text-[10px] border border-yellow-700 text-yellow-400">
                      deload
                    </span>
                  )}
                </div>
                <span className="text-right text-xs tabular-nums text-gray-300">
                  {row.working_sets > 0 ? row.working_sets : "--"}
                </span>
                <span className="text-right text-xs tabular-nums text-gray-400">
                  {row.cardio_minutes > 0 ? `${row.cardio_minutes}m` : "--"}
                </span>
                <span className="text-right text-xs tabular-nums text-gray-400">
                  {row.tonnage > 0 ? fmt(row.tonnage) : "--"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export default async function AnalyticsPage() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool   = await getDb();
  const client = await pool.connect();

  try {
    const [muscleRes, weekRes, dayTypeRes, sessionRes] = await Promise.all([
      // 30-day muscle volume
      client.query<MuscleRow>(
        `SELECT e.muscle_primary, count(*)::int AS sets
         FROM set_logs sl
         JOIN exercises e ON e.exercise_id = sl.exercise_id
         WHERE sl.user_id = $1
           AND sl.performed_at >= now() - interval '30 days'
           AND sl.is_warmup = FALSE
           AND e.muscle_primary IS NOT NULL
           AND e.muscle_primary <> 'conditioning'
         GROUP BY e.muscle_primary`,
        [userId]
      ),
      // 8-week trend from weekly_rollups
      client.query<WeekRow>(
        `SELECT week_start_date::text AS week_start,
                total_sets,
                round(total_tonnage)::int AS tonnage,
                cardio_minutes
         FROM weekly_rollups
         WHERE user_id = $1
         ORDER BY week_start_date DESC
         LIMIT 8`,
        [userId]
      ),
      // Day type distribution last 60 days
      client.query<DayTypeRow>(
        `SELECT session_type::text AS session_type, count(*)::int AS count
         FROM plan_sessions
         WHERE user_id = $1
           AND performed_at IS NOT NULL
           AND date >= current_date - interval '60 days'
         GROUP BY session_type
         ORDER BY count DESC`,
        [userId]
      ),
      // Recent 14 sessions
      client.query<SessionRow>(
        `SELECT ps.date::text AS date,
                ps.session_type::text AS session_type,
                ps.is_deload,
                ps.cardio_minutes,
                count(sl.id) FILTER (WHERE NOT sl.is_warmup)::int AS working_sets,
                count(sl.id) FILTER (WHERE sl.is_warmup)::int AS warmup_sets,
                round(coalesce(sum(sl.load * sl.reps) FILTER (WHERE NOT sl.is_warmup), 0))::int AS tonnage
         FROM plan_sessions ps
         LEFT JOIN set_logs sl ON sl.session_id = ps.plan_session_id
         WHERE ps.user_id = $1
           AND ps.performed_at IS NOT NULL
         GROUP BY ps.date, ps.session_type, ps.is_deload, ps.cardio_minutes
         ORDER BY ps.date DESC
         LIMIT 14`,
        [userId]
      ),
    ]);

    const totalSessions = dayTypeRes.rows.reduce((s, r) => s + r.count, 0);

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6 pb-24">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/more" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            &larr; More
          </Link>
          <h1 className="text-2xl font-semibold text-gray-100">Training Analytics</h1>
        </div>

        <div className="flex flex-col gap-8">
          <MuscleVolumeSection rows={muscleRes.rows} />
          <DayTypeSection rows={dayTypeRes.rows} totalSessions={totalSessions} />
          <WeeklyTrendSection rows={weekRes.rows} />
          <RecentSessionsSection rows={sessionRes.rows} />
        </div>
      </main>
    );
  } finally {
    client.release();
  }
}
