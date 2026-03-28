import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionRow = {
  date: string;
  session_type: string;
  is_deload: boolean;
  performed_at: string;
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
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
  return `${weekday}, ${day} ${month}`;
}

function formatTonnage(tonnage: number) {
  if (tonnage >= 1000) return `${(tonnage / 1000).toFixed(1)}k lb`;
  return `${Math.round(tonnage)} lb`;
}

export default async function HistoryPage() {
  requireConfig();
  noStore();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    // Get active block
    const profileRes = await client.query(
      "select block_id from user_profile where user_id = $1",
      [userId]
    );
    const blockId = profileRes.rows[0]?.block_id;

    if (!blockId) {
      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <h1 className="text-2xl font-semibold text-gray-100">History</h1>
          <p className="mt-2 text-sm text-gray-400">No active block found.</p>
        </main>
      );
    }

    const res = await client.query<SessionRow>(
      `select
         ps.date::text as date,
         ps.session_type,
         ps.is_deload,
         ps.performed_at::text as performed_at,
         count(distinct sl.exercise_id)::int as exercise_count,
         count(sl.*)::int as total_sets,
         coalesce(sum(sl.reps), 0)::int as total_reps,
         coalesce(sum(sl.load::numeric * sl.reps), 0)::float as total_tonnage
       from plan_sessions ps
       left join set_logs sl
         on sl.session_id = ps.plan_session_id
        and sl.user_id = $1
       where ps.user_id = $1
         and ps.block_id = $2
         and ps.performed_at is not null
       group by ps.plan_session_id, ps.date, ps.session_type, ps.is_deload, ps.performed_at
       order by ps.date desc`,
      [userId, blockId]
    );

    const sessions = res.rows;

    // Session type tags
    const sessionTypes = Array.from(new Set(sessions.map((s) => s.session_type))).sort();

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold text-gray-100">History</h1>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
            No completed sessions yet. Start logging your first workout!
          </div>
        ) : (
          <>
            {/* Session type tags for context */}
            {sessionTypes.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-500">Types:</span>
                {sessionTypes.map((st) => (
                  <span
                    key={st}
                    className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                  >
                    {st}
                  </span>
                ))}
              </div>
            )}

            <div className="mb-2 text-xs text-gray-500">
              {sessions.length} completed session{sessions.length !== 1 ? "s" : ""}
            </div>

            <div className="grid gap-3">
              {sessions.map((s) => (
                <Link
                  key={s.date}
                  href={`/session/${isoToDmy(s.date)}`}
                  prefetch={false}
                  className="block rounded-xl border border-gray-700 bg-gray-800 p-4 active:opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-100">
                        {formatDisplayDate(s.date)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                        <span>{s.session_type} session</span>
                        {s.is_deload && (
                          <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
                            Deload
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-gray-300">
                  <div>{s.total_reps} reps</div> 
                     <div>{s.total_sets} sets</div>
              <div>{formatTonnage(Number(s.total_tonnage))}</div>
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
