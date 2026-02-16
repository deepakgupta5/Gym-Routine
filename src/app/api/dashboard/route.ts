import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { computeAdaptiveState } from "@/lib/adaptive/computeAdaptive";

function parseBiasState(input: any) {
  if (!input || typeof input !== "string") return {};
  try {
    const obj = JSON.parse(input);
    if (obj && typeof obj === "object" && obj.bias_state) return obj.bias_state;
    return {};
  } catch {
    return {};
  }
}

export async function GET() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const profileRes = await client.query(
      "select bias_balance, adaptive_enabled, block_id from user_profile where user_id = $1",
      [userId]
    );
    const profile = profileRes.rows[0] ?? null;

    const blockRes = profile?.block_id
      ? await client.query(
          `select pending_bias_balance, pending_cardio_rule, pending_reason, pending_computed_at
           from blocks where block_id = $1`,
          [profile.block_id]
        )
      : { rows: [] };

    const block = blockRes.rows[0] ?? null;

    const bodyRes = await client.query(
      `select date::text as date, weight_lb, bodyfat_pct, upper_pct, lower_pct
       from body_stats_daily
       where user_id = $1
       order by date asc`,
      [userId]
    );

    const adaptive = computeAdaptiveState(
      bodyRes.rows,
      profile?.bias_balance ?? 0,
      parseBiasState(block?.pending_reason)
    );

    const rollupsRes = await client.query(
      `select * from weekly_rollups
       where user_id = $1
       order by week_start_date desc
       limit 12`,
      [userId]
    );

    const topSetRes = await client.query(
      `select performed_at, exercise_id, load, reps, estimated_1rm
       from top_set_history
       where user_id = $1
       order by performed_at desc
       limit 20`,
      [userId]
    );

    const lastUploadDate =
      bodyRes.rows.length > 0 ? bodyRes.rows[bodyRes.rows.length - 1].date : null;

    const uploadReminder = lastUploadDate
      ? `Last upload: ${lastUploadDate} — pending updates will apply at next regeneration.`
      : "Last upload: none — pending updates will apply at next regeneration.";

    return NextResponse.json({
      ok: true,
      profile,
      pending: block,
      adaptive,
      rollups: rollupsRes.rows,
      top_sets: topSetRes.rows,
      body_stats: bodyRes.rows,
      last_upload_date: lastUploadDate,
      upload_reminder: uploadReminder,
    });
  } finally {
    client.release();
  }
}
