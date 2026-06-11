import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { WEEKLY_MIN_SETS } from "@/lib/scheduler/v2/constants";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Muscles available for filtering (same set as dashboard bars)
const FILTER_MUSCLES = Object.keys(WEEKLY_MIN_SETS).sort();

const MUSCLE_LABELS: Record<string, string> = {
  quads:      "Quads",
  hamstrings: "Hamstrings",
  glutes:     "Glutes",
  chest:      "Chest",
  back:       "Back",
  shoulders:  "Shoulders",
  biceps:     "Biceps",
  triceps:    "Triceps",
  calves:     "Calves",
};

type PageProps = {
  searchParams?: Promise<{ muscle?: string }>;
};

type SessionRow = {
  date: string;
  session_type: string;
  is_deload: boolean;
  performed_at: string;
  block_id: string;
  week_in_block: number | null;
  exercise_count: number;
  total_sets: number;
  total_reps: number;
  total_tonnage: number;
};

function isoToDmy(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

function formatDisplayDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  const day     = new Intl.DateTimeFormat("en-US", { day: "2-digit",   timeZone: "UTC" }).format(d);
  const month   = new Intl.DateTimeFormat("en-US", { month: "short",   timeZone: "UTC" }).format(d);
  return `${weekday}, ${day} ${month}`;
}

function formatTonnage(tonnage: number) {
  if (tonnage >= 1000) return `${(tonnage / 1000).toFixed(1)}k lb`;
  return `${Math.round(tonnage)} lb`;
}

export default async function HistoryPage({ searchParams }: PageProps) {
  requireConfig();
  noStore();
  const userId = CONFIG.SINGLE_USER_ID;

  const resolved = searchParams ? await searchParams : {};
  // Validate muscle param against known list; ignore unknown values.
  const muscleFilter = (typeof resolved.muscle === "string" && FILTER_MUSCLES.includes(resolved.muscle))
    ? resolved.muscle
    : null;

  const pool   = await getDb();
  const client = await pool.connect();

  try {
    // $1 = userId, $2 = muscleFilter (null = no filter)
    // The EXISTS subquery short-circuits the join scan when a muscle is specified.
    const res = await client.query<SessionRow>(
      `select
         ps.date::text                                      as date,
         ps.session_type::text                             as session_type,
         ps.is_deload,
         ps.performed_at::text                             as performed_at,
         ps.block_id,
         ps.week_in_block,
         count(distinct sl.exercise_id)::int               as exercise_count,
         count(sl.*)::int                                  as total_sets,
         coalesce(sum(sl.reps), 0)::int                    as total_reps,
         coalesce(sum(sl.load::numeric * sl.reps), 0)::float as total_tonnage
       from plan_sessions ps
       left join set_logs sl
         on sl.session_id = ps.plan_session_id
        and sl.user_id    = $1
       where ps.user_id        = $1
         and ps.performed_at   is not null
         and (
           $2::text is null
           or exists (
             select 1
               from set_logs    sl2
               join exercises   e2 on e2.exercise_id = sl2.exercise_id
              where sl2.session_id     = ps.plan_session_id
                and sl2.user_id        = $1
                and e2.muscle_primary  = $2
           )
         )
       group by
         ps.plan_session_id,
         ps.date,
         ps.session_type,
         ps.is_deload,
         ps.performed_at,
         ps.block_id,
         ps.week_in_block
       order by ps.performed_at desc, ps.date desc`,
      [userId, muscleFilter]
    );

    const sessions = res.rows;

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold text-gray-100">History</h1>

        {/* Muscle filter chips */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500">Muscle:</span>
            <Link
              href="/history"
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                muscleFilter === null
                  ? "border-blue-500 bg-blue-600/20 text-blue-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              All
            </Link>
            {FILTER_MUSCLES.map((m) => {
              const isActive = muscleFilter === m;
              return (
                <Link
                  key={m}
                  href={isActive ? "/history" : `/history?muscle=${encodeURIComponent(m)}`}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-blue-500 bg-blue-600/20 text-blue-300"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  }`}
                >
                  {MUSCLE_LABELS[m] ?? m}
                  {isActive && <span className="ml-1 opacity-70">&times;</span>}
                </Link>
              );
            })}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
            {muscleFilter
              ? `No completed sessions with ${MUSCLE_LABELS[muscleFilter] ?? muscleFilter} exercises found.`
              : "No completed sessions yet. Start logging your first workout!"}
          </div>
        ) : (
          <>
            <div className="mb-2 text-xs text-gray-500">
              {sessions.length} completed session{sessions.length !== 1 ? "s" : ""}
              {muscleFilter && (
                <span className="ml-1 text-gray-400">
                  - filtered by{" "}
                  <span className="text-gray-300">{MUSCLE_LABELS[muscleFilter] ?? muscleFilter}</span>
                </span>
              )}
            </div>

            <div className="grid gap-3">
              {sessions.map((s) => (
                <Link
                  key={s.date}
                  href={`/session/${isoToDmy(s.date)}`}
                  prefetch={false}
                  className="block rounded-xl border border-gray-700 bg-gray-800 p-4 active:opacity-80 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-100">
                        {formatDisplayDate(s.date)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                        <span>{s.session_type}</span>
                        {s.week_in_block !== null && (
                          <span>Week {s.week_in_block}</span>
                        )}
                        {s.is_deload && (
                          <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
                            Deload
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-300">
                      <div className="font-medium">{s.total_reps} reps</div>
                      <div>{s.total_sets} sets</div>
                      <div className="text-xs text-gray-500">{formatTonnage(Number(s.total_tonnage))}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    );
  } finally {
    client.release();
  }
}
