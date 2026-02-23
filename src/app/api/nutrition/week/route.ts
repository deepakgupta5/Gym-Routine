import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { getWeekStartDateUtc } from "@/lib/db/rollups";

export const dynamic = "force-dynamic";

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const weekStartParam = req.nextUrl.searchParams.get("weekStart");
  let weekStart: string;

  if (!weekStartParam) {
    weekStart = getWeekStartDateUtc(new Date());
  } else {
    if (!isIsoDate(weekStartParam)) {
      return NextResponse.json({ error: "invalid_weekStart" }, { status: 400 });
    }
    // Must be a Monday
    const d = new Date(`${weekStartParam}T00:00:00Z`);
    if (d.getUTCDay() !== 1) {
      return NextResponse.json({ error: "invalid_weekStart" }, { status: 400 });
    }
    weekStart = weekStartParam;
  }

  // Build the 7 date strings for the week
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7); // exclusive upper bound

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const [goalsRes, rollupsRes] = await Promise.all([
      client.query<{
        goal_date: string;
        is_training_day: boolean;
        target_calories: number;
      }>(
        `SELECT
           goal_date::text      AS goal_date,
           is_training_day,
           target_calories::float AS target_calories
         FROM nutrition_goals_daily
         WHERE user_id = $1 AND goal_date >= $2 AND goal_date < $3`,
        [userId, weekStart, weekEnd]
      ),
      client.query<{
        rollup_date: string;
        total_calories: number;
        total_protein_g: number;
        total_carbs_g: number;
        total_fat_g: number;
        meal_count: number;
      }>(
        `SELECT
           rollup_date::text      AS rollup_date,
           total_calories::float  AS total_calories,
           total_protein_g::float AS total_protein_g,
           total_carbs_g::float   AS total_carbs_g,
           total_fat_g::float     AS total_fat_g,
           meal_count
         FROM daily_nutrition_rollups
         WHERE user_id = $1 AND rollup_date >= $2 AND rollup_date < $3`,
        [userId, weekStart, weekEnd]
      ),
    ]);

    // Index by date for O(1) lookup
    const goalsByDate = new Map(goalsRes.rows.map((r) => [r.goal_date, r]));
    const rollupsByDate = new Map(rollupsRes.rows.map((r) => [r.rollup_date, r]));

    const days = weekDates.map((date) => {
      const g = goalsByDate.get(date);
      const r = rollupsByDate.get(date);

      const targetCalories = g?.target_calories ?? 2050;
      const totalCalories  = r?.total_calories  ?? 0;

      const adherencePct =
        targetCalories > 0
          ? Math.min(100, Math.round((totalCalories / targetCalories) * 100))
          : 0;

      return {
        date,
        is_training_day:  g?.is_training_day ?? false,
        target_calories:  targetCalories,
        total_calories:   totalCalories,
        total_protein_g:  r?.total_protein_g ?? 0,
        total_carbs_g:    r?.total_carbs_g   ?? 0,
        total_fat_g:      r?.total_fat_g     ?? 0,
        meal_count:       r?.meal_count       ?? 0,
        adherence_pct:    adherencePct,
      };
    });

    return NextResponse.json({ week_start: weekStart, days });
  } catch (err) {
    logError("nutrition_week_failed", err, { user_id: userId, week_start: weekStart });
    return NextResponse.json({ error: "nutrition_week_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
