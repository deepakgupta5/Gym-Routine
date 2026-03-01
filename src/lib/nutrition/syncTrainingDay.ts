/**
 * Syncs nutrition_goals_daily for a given date with active-block training status,
 * TDEE profile settings, and weekly weight-trend adjustment.
 *
 * Rule summary:
 * - Training day base calories = effective_tdee - 350
 * - Rest/deload base calories = effective_tdee - 500
 * - Effective TDEE = tdee_override if set, else tdee_calculated, else 2550
 * - Weekly trend adjustment from body_stats_daily (last 14 days ending on date):
 *   * <= -1.5 lb/week: +100 kcal (loss too fast)
 *   * >= -0.25 lb/week: -100 kcal (loss too slow / plateau)
 *   * otherwise: 0 kcal
 * - Protein remains 160g for all day types.
 */

import type { PoolClient } from "pg";

type ProfileCalories = {
  tdee_calculated: number | null;
  tdee_override: number | null;
};

type WeightPoint = {
  date: string;
  weight_lb: number;
};

/** Default daily macro targets. Edit here to update all sync operations globally. */
export const DEFAULT_MACRO_TARGETS = {
  protein_g: 160,
  fat_g: 70,
  fiber_g: 30,
  sugar_g_max: 45,
  sodium_mg_max: 2300,
  iron_mg: 8,
  vitamin_d_mcg: 15,
  water_ml: 3000,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo25(value: number): number {
  return Math.round(value / 25) * 25;
}

function dayDiff(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}

async function resolveEffectiveTdee(client: PoolClient, userId: string): Promise<number> {
  const res = await client.query<ProfileCalories>(
    `SELECT
       tdee_calculated::float AS tdee_calculated,
       tdee_override::float   AS tdee_override
     FROM nutrition_profile
     WHERE user_id = $1`,
    [userId]
  );

  const row = res.rows[0];
  const raw = row?.tdee_override ?? row?.tdee_calculated ?? 2550;
  return clamp(roundTo25(raw), 1800, 4200);
}

async function resolveWeeklyTrendAdjustment(
  client: PoolClient,
  userId: string,
  date: string
): Promise<number> {
  const res = await client.query<WeightPoint>(
    `SELECT
       date::text AS date,
       weight_lb::float AS weight_lb
     FROM body_stats_daily
     WHERE user_id = $1
       AND date <= $2::date
       AND date > ($2::date - INTERVAL '14 day')
     ORDER BY date ASC`,
    [userId, date]
  );

  if (res.rows.length < 4) return 0;

  const first = res.rows[0];
  const last = res.rows[res.rows.length - 1];
  const days = dayDiff(first.date, last.date);
  if (days < 7) return 0;

  const weeklyDeltaLb = ((last.weight_lb - first.weight_lb) / days) * 7;

  if (weeklyDeltaLb <= -1.5) return 100;
  if (weeklyDeltaLb >= -0.25) return -100;
  return 0;
}

export async function syncTrainingDay(
  client: PoolClient,
  userId: string,
  date: string // "YYYY-MM-DD"
): Promise<void> {
  const profileRes = await client.query<{ block_id: string | null; skipped_dates: string[] | null }>(
    `SELECT block_id, skipped_dates FROM user_profile WHERE user_id = $1`,
    [userId]
  );

  const blockId = profileRes.rows[0]?.block_id ?? null;
  const skippedDates = profileRes.rows[0]?.skipped_dates ?? [];
  const isSkippedDate = skippedDates.includes(date);

  let isTrainingDay = false;

  if (blockId && !isSkippedDate) {
    const sessionRes = await client.query<{ is_deload: boolean }>(
      `SELECT is_deload
       FROM plan_sessions
       WHERE user_id = $1 AND block_id = $2 AND date = $3`,
      [userId, blockId, date]
    );

    if (sessionRes.rowCount && sessionRes.rowCount > 0) {
      isTrainingDay = !sessionRes.rows[0].is_deload;
    }
  }

  const effectiveTdee = await resolveEffectiveTdee(client, userId);
  const trendAdjustment = await resolveWeeklyTrendAdjustment(client, userId, date);

  const baseTrainingCalories = effectiveTdee - 350;
  const baseRestCalories = effectiveTdee - 500;
  const baseCalories = isTrainingDay ? baseTrainingCalories : baseRestCalories;

  const targetCalories = clamp(roundTo25(baseCalories + trendAdjustment), 1200, 4200);

  const m = DEFAULT_MACRO_TARGETS;
  const targetCarbsG = Math.max(
    0,
    Math.round((targetCalories - (m.protein_g * 4 + m.fat_g * 9)) / 4)
  );
  await client.query(
    `INSERT INTO nutrition_goals_daily
       (user_id, goal_date, is_training_day,
        target_calories, target_protein_g, target_carbs_g, target_fat_g,
        target_fiber_g, target_sugar_g_max, target_sodium_mg_max,
        target_iron_mg, target_vitamin_d_mcg, target_water_ml)
     VALUES
       ($1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13)
     ON CONFLICT (user_id, goal_date)
     DO UPDATE SET
       is_training_day      = EXCLUDED.is_training_day,
       target_calories      = EXCLUDED.target_calories,
       target_protein_g     = EXCLUDED.target_protein_g,
        target_carbs_g       = EXCLUDED.target_carbs_g,
       target_fat_g         = EXCLUDED.target_fat_g,
       target_fiber_g       = EXCLUDED.target_fiber_g,
       target_sugar_g_max   = EXCLUDED.target_sugar_g_max,
       target_sodium_mg_max = EXCLUDED.target_sodium_mg_max,
       target_iron_mg       = EXCLUDED.target_iron_mg,
       target_vitamin_d_mcg = EXCLUDED.target_vitamin_d_mcg,
       target_water_ml      = EXCLUDED.target_water_ml`,
    [
      userId, date, isTrainingDay, targetCalories,
      m.protein_g, targetCarbsG, m.fat_g, m.fiber_g, m.sugar_g_max,
      m.sodium_mg_max, m.iron_mg, m.vitamin_d_mcg, m.water_ml,
    ]
  );
}
