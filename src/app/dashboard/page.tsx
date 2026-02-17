import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export default async function DashboardPage() {
  requireConfig();
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const res = await client.query<{ date: string }>(
      `select date::text as date
       from body_stats_daily
       where user_id = $1
       order by date desc
       limit 1`,
      [CONFIG.SINGLE_USER_ID]
    );

    const lastUpload = res.rows[0]?.date ?? "none";
    const reminder = `Last upload: ${lastUpload} — pending updates will apply at next regeneration.`;

    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <section className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h1 className="text-2xl font-semibold text-gray-100">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-300">{reminder}</p>
        </section>
      </main>
    );
  } finally {
    client.release();
  }
}
