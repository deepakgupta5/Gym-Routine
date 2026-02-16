import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export default async function DashboardPage() {
  requireConfig();
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const res = await client.query(
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
      <div style={{ padding: 24 }}>
        <h1>Dashboard</h1>
        <p>{reminder}</p>
      </div>
    );
  } finally {
    client.release();
  }
}
