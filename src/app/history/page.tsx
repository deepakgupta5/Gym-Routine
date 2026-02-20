import Link from "next/link";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

type SessionRow = {
  date: string;
  session_type: string;
  is_deload: boolean;
  performed_at: string;
  exercise_count: number;
  total_sets: number;
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

export default async function HistoryPage() {
  requireConfig();
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
         (select count(*)::int from plan_exercises pe where pe.plan_session_id = ps.plan_session_id) as exercise_count,
         (select count(*)::int from set_logs sl where sl.session_id = ps.plan_session_id) as total_sets
       from plan_sessions ps
       where ps.user_id = $1
         and ps.block_id = $2
         and ps.performed_at is not null
       order by ps.date desc`,
      [userId, blockId]
    );

    const sessions = res.rows;

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <h1 className="mb-4 text-2xl font-semibold text-gray-100">History</h1>

        {sessions.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-500">
            No completed sessions yet.
          </div>
        ) : (
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
                    <div className="mt-0.5 text-sm text-gray-400">
                      {s.session_type} session
                      {s.is_deload ? (
                        <span className="ml-2 rounded-full border border-amber-700 bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
                          Deload
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-400">
                    <div>{s.exercise_count} exercises</div>
                    <div>{s.total_sets} sets</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    );
  } finally {
    client.release();
  }
}
