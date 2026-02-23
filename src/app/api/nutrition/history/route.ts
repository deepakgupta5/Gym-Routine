import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 365;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 90;

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to   = params.get("to")   ?? "";

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const page     = Math.max(1, parseInt(params.get("page")     ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(params.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const [countRes, dataRes] = await Promise.all([
      client.query<{ total: string }>(
        `SELECT COUNT(DISTINCT rollup_date) AS total
         FROM daily_nutrition_rollups
         WHERE user_id = $1 AND rollup_date >= $2 AND rollup_date <= $3`,
        [userId, from, to]
      ),
      client.query<{
        date: string;
        meal_count: number;
        total_calories: number;
        total_protein_g: number;
        is_training_day: boolean;
        target_calories: number;
      }>(
        `SELECT
           dnr.rollup_date::text                   AS date,
           dnr.meal_count,
           dnr.total_calories::float               AS total_calories,
           dnr.total_protein_g::float              AS total_protein_g,
           COALESCE(ngd.is_training_day, false)    AS is_training_day,
           COALESCE(ngd.target_calories, 2050)::float AS target_calories
         FROM daily_nutrition_rollups dnr
         LEFT JOIN nutrition_goals_daily ngd
           ON ngd.user_id = dnr.user_id AND ngd.goal_date = dnr.rollup_date
         WHERE dnr.user_id = $1 AND dnr.rollup_date >= $2 AND dnr.rollup_date <= $3
         ORDER BY dnr.rollup_date DESC
         LIMIT $4 OFFSET $5`,
        [userId, from, to, pageSize, offset]
      ),
    ]);

    const totalDays = parseInt(countRes.rows[0]?.total ?? "0", 10);

    const days = dataRes.rows.map((row) => ({
      date:            row.date,
      meal_count:      row.meal_count,
      total_calories:  row.total_calories,
      total_protein_g: row.total_protein_g,
      is_training_day: row.is_training_day,
      target_calories: row.target_calories,
      adherence_pct:
        row.target_calories > 0
          ? Math.min(100, Math.round((row.total_calories / row.target_calories) * 100))
          : 0,
    }));

    return NextResponse.json({
      from,
      to,
      page,
      page_size:  pageSize,
      total_days: totalDays,
      days,
    });
  } catch (err) {
    logError("nutrition_history_failed", err, { user_id: userId });
    return NextResponse.json({ error: "nutrition_history_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
