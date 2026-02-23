import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { ensureNutritionProfile } from "@/lib/nutrition/profile";
import { syncTrainingDay } from "@/lib/nutrition/syncTrainingDay";

export const dynamic = "force-dynamic";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type GoalsRow = {
  is_training_day:      boolean;
  target_calories:      number;
  target_protein_g:     number;
  target_carbs_g:       number;
  target_fat_g:         number;
  target_fiber_g:       number;
  target_sugar_g_max:   number;
  target_sodium_mg_max: number;
  target_iron_mg:       number;
  target_vitamin_d_mcg: number;
  target_water_ml:      number;
};

type RollupRow = {
  total_calories:      number;
  total_protein_g:     number;
  total_carbs_g:       number;
  total_fat_g:         number;
  total_fiber_g:       number;
  total_sugar_g:       number;
  total_sodium_mg:     number;
  total_iron_mg:       number;
  total_vitamin_d_mcg: number;
  water_ml:            number;
  meal_count:          number;
};

const DEFAULT_GOALS: GoalsRow = {
  is_training_day:      false,
  target_calories:      2050,
  target_protein_g:     160,
  target_carbs_g:       0,
  target_fat_g:         70,
  target_fiber_g:       30,
  target_sugar_g_max:   45,
  target_sodium_mg_max: 2300,
  target_iron_mg:       8,
  target_vitamin_d_mcg: 15,
  target_water_ml:      3000,
};

const ZERO_ROLLUP: RollupRow = {
  total_calories:      0,
  total_protein_g:     0,
  total_carbs_g:       0,
  total_fat_g:         0,
  total_fiber_g:       0,
  total_sugar_g:       0,
  total_sodium_mg:     0,
  total_iron_mg:       0,
  total_vitamin_d_mcg: 0,
  water_ml:            0,
  meal_count:          0,
};

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ?? todayUtc();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    // Ensure profile exists and sync training-day goals for this date
    await ensureNutritionProfile(client, userId);
    await syncTrainingDay(client, userId, date);

    // Parallel queries: goals, rollup, meals+items
    const [goalsRes, rollupRes, mealsRes] = await Promise.all([
      client.query<GoalsRow>(
        `SELECT
           is_training_day,
           target_calories::float      AS target_calories,
           target_protein_g::float     AS target_protein_g,
           target_carbs_g::float       AS target_carbs_g,
           target_fat_g::float         AS target_fat_g,
           target_fiber_g::float       AS target_fiber_g,
           target_sugar_g_max::float   AS target_sugar_g_max,
           target_sodium_mg_max::float AS target_sodium_mg_max,
           target_iron_mg::float       AS target_iron_mg,
           target_vitamin_d_mcg::float AS target_vitamin_d_mcg,
           target_water_ml::float      AS target_water_ml
         FROM nutrition_goals_daily
         WHERE user_id = $1 AND goal_date = $2`,
        [userId, date]
      ),
      client.query<RollupRow>(
        `SELECT
           total_calories::float      AS total_calories,
           total_protein_g::float     AS total_protein_g,
           total_carbs_g::float       AS total_carbs_g,
           total_fat_g::float         AS total_fat_g,
           total_fiber_g::float       AS total_fiber_g,
           total_sugar_g::float       AS total_sugar_g,
           total_sodium_mg::float     AS total_sodium_mg,
           total_iron_mg::float       AS total_iron_mg,
           total_vitamin_d_mcg::float AS total_vitamin_d_mcg,
           water_ml::float            AS water_ml,
           meal_count
         FROM daily_nutrition_rollups
         WHERE user_id = $1 AND rollup_date = $2`,
        [userId, date]
      ),
      client.query(
        `SELECT
           ml.meal_log_id,
           ml.meal_type,
           ml.raw_input,
           ml.input_mode,
           ml.ai_confidence::float AS ai_confidence,
           ml.notes,
           ml.created_at::text     AS created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'meal_item_id',   mi.meal_item_id,
                 'item_name',      mi.item_name,
                 'quantity',       mi.quantity::float,
                 'unit',           mi.unit,
                 'calories',       mi.calories::float,
                 'protein_g',      mi.protein_g::float,
                 'carbs_g',        mi.carbs_g::float,
                 'fat_g',          mi.fat_g::float,
                 'fiber_g',        mi.fiber_g::float,
                 'sugar_g',        mi.sugar_g::float,
                 'sodium_mg',      mi.sodium_mg::float,
                 'iron_mg',        mi.iron_mg::float,
                 'calcium_mg',     mi.calcium_mg::float,
                 'vitamin_d_mcg',  mi.vitamin_d_mcg::float,
                 'vitamin_c_mg',   mi.vitamin_c_mg::float,
                 'potassium_mg',   mi.potassium_mg::float,
                 'source',         mi.source,
                 'confidence',     mi.confidence::float,
                 'is_user_edited', mi.is_user_edited,
                 'sort_order',     mi.sort_order
               ) ORDER BY mi.sort_order
             ) FILTER (WHERE mi.meal_item_id IS NOT NULL),
             '[]'
           ) AS items
         FROM meal_logs ml
         LEFT JOIN meal_items mi ON mi.meal_log_id = ml.meal_log_id
         WHERE ml.user_id = $1 AND ml.meal_date = $2
         GROUP BY ml.meal_log_id
         ORDER BY ml.created_at ASC`,
        [userId, date]
      ),
    ]);

    // Sparse-data fallback — never return null
    const goals: GoalsRow = goalsRes.rows[0] ?? DEFAULT_GOALS;
    const totals: RollupRow = rollupRes.rows[0] ?? ZERO_ROLLUP;
    const meals = mealsRes.rows;

    const deltas = {
      calories_remaining:    Math.max(0, goals.target_calories - totals.total_calories),
      protein_remaining_g:   Math.max(0, goals.target_protein_g - totals.total_protein_g),
      fat_remaining_g:       Math.max(0, goals.target_fat_g - totals.total_fat_g),
      carbs_remaining_g:     Math.max(0, goals.target_carbs_g - totals.total_carbs_g),
      fiber_remaining_g:     Math.max(0, goals.target_fiber_g - totals.total_fiber_g),
      sugar_headroom_g:      goals.target_sugar_g_max - totals.total_sugar_g,
      sodium_headroom_mg:    goals.target_sodium_mg_max - totals.total_sodium_mg,
      iron_remaining_mg:     Math.max(0, goals.target_iron_mg - totals.total_iron_mg),
      vitamin_d_remaining_mcg: Math.max(0, goals.target_vitamin_d_mcg - totals.total_vitamin_d_mcg),
      water_remaining_ml:    Math.max(0, goals.target_water_ml - totals.water_ml),
    };

    return NextResponse.json({ date, goals, totals, deltas, meals });
  } catch (err) {
    logError("nutrition_today_failed", err, { user_id: userId, date });
    return NextResponse.json({ error: "nutrition_today_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
