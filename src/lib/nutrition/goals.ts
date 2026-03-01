/**
 * Goal management helpers for nutrition_goals_daily.
 *
 * Change control rule (non-negotiable):
 *   Past rows (goal_date < fromDate) are FROZEN — never updated.
 *   Only future rows are regenerated when the user changes targets.
 *   This preserves historical accuracy for trend charts.
 */

import type { PoolClient } from "pg";
import { syncTrainingDay } from "@/lib/nutrition/syncTrainingDay";

export type DailyGoals = {
  goal_date:            string;
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

/**
 * Returns the nutrition_goals_daily row for (userId, date).
 * If the row doesn't exist yet, calls syncTrainingDay to create it first.
 * If nutrition_profile is missing, syncTrainingDay still works (uses defaults).
 */
export async function ensureTodayGoals(
  client: PoolClient,
  userId: string,
  date: string // "YYYY-MM-DD"
): Promise<DailyGoals> {
  // Try to read existing row first (fast path)
  const existing = await client.query<DailyGoals>(
    `SELECT
       goal_date::text            AS goal_date,
       is_training_day,
       target_calories::float     AS target_calories,
       target_protein_g::float    AS target_protein_g,
       target_carbs_g::float      AS target_carbs_g,
       target_fat_g::float        AS target_fat_g,
       target_fiber_g::float      AS target_fiber_g,
       target_sugar_g_max::float  AS target_sugar_g_max,
       target_sodium_mg_max::float AS target_sodium_mg_max,
       target_iron_mg::float      AS target_iron_mg,
       target_vitamin_d_mcg::float AS target_vitamin_d_mcg,
       target_water_ml::float     AS target_water_ml
     FROM nutrition_goals_daily
     WHERE user_id = $1 AND goal_date = $2`,
    [userId, date]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0];
  }

  // Row missing — sync from training schedule then re-read
  await syncTrainingDay(client, userId, date);

  const fresh = await client.query<DailyGoals>(
    `SELECT
       goal_date::text            AS goal_date,
       is_training_day,
       target_calories::float     AS target_calories,
       target_protein_g::float    AS target_protein_g,
       target_carbs_g::float      AS target_carbs_g,
       target_fat_g::float        AS target_fat_g,
       target_fiber_g::float      AS target_fiber_g,
       target_sugar_g_max::float  AS target_sugar_g_max,
       target_sodium_mg_max::float AS target_sodium_mg_max,
       target_iron_mg::float      AS target_iron_mg,
       target_vitamin_d_mcg::float AS target_vitamin_d_mcg,
       target_water_ml::float     AS target_water_ml
     FROM nutrition_goals_daily
     WHERE user_id = $1 AND goal_date = $2`,
    [userId, date]
  );

  // Should always exist after syncTrainingDay — return zero-value fallback if
  // somehow still missing (e.g. transaction isolation edge case).
  return fresh.rows[0] ?? zeroGoals(date);
}

/**
 * Regenerates goals for all dates >= fromDate by re-running syncTrainingDay.
 * Called when the user changes calorie/macro targets in settings.
 * Rows before fromDate are never touched.
 */
export async function regenerateFutureGoals(
  client: PoolClient,
  userId: string,
  fromDate: string // "YYYY-MM-DD" — only rows >= this date are regenerated
): Promise<void> {
  // Fetch all future goal rows that exist so we can re-sync each date
  const futureRes = await client.query<{ goal_date: string }>(
    `SELECT goal_date::text AS goal_date
     FROM nutrition_goals_daily
     WHERE user_id = $1 AND goal_date >= $2
     ORDER BY goal_date ASC`,
    [userId, fromDate]
  );

  for (const row of futureRes.rows) {
    await syncTrainingDay(client, userId, row.goal_date);
  }
}

function zeroGoals(date: string): DailyGoals {
  const targetCalories = 2050;
  const targetProteinG = 160;
  const targetFatG = 70;
  const targetCarbsG = Math.max(
    0,
    Math.round((targetCalories - (targetProteinG * 4 + targetFatG * 9)) / 4)
  );

  return {
    goal_date:            date,
    is_training_day:      false,
    target_calories:      targetCalories,
    target_protein_g:     targetProteinG,
    target_carbs_g:       targetCarbsG,
    target_fat_g:         targetFatG,
    target_fiber_g:       30,
    target_sugar_g_max:   45,
    target_sodium_mg_max: 2300,
    target_iron_mg:       8,
    target_vitamin_d_mcg: 15,
    target_water_ml:      3000,
  };
}
