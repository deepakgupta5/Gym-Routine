/**
 * Syncs the nutrition_goals_daily row for a given date with the training
 * schedule from the ACTIVE block only.
 *
 * Critical: block_id MUST be used in the plan_sessions query.
 * Omitting block_id would leak sessions from old/inactive blocks.
 *
 * Logic:
 *   session found AND is_deload = false  =>  training day: 2200 kcal
 *   no session OR is_deload = true       =>  rest day:     2050 kcal
 *   protein always 160 g regardless of day type
 */

import type { PoolClient } from "pg";

export async function syncTrainingDay(
  client: PoolClient,
  userId: string,
  date: string // "YYYY-MM-DD"
): Promise<void> {
  // Step 1: get the user's active block_id
  const profileRes = await client.query<{ block_id: string | null }>(
    `SELECT block_id FROM user_profile WHERE user_id = $1`,
    [userId]
  );

  const blockId = profileRes.rows[0]?.block_id ?? null;

  // Step 2: look up that date's session in the active block only
  let isTrainingDay = false;

  if (blockId) {
    const sessionRes = await client.query<{ is_deload: boolean }>(
      `SELECT is_deload
       FROM plan_sessions
       WHERE user_id = $1 AND block_id = $2 AND date = $3`,
      [userId, blockId, date]
    );

    if (sessionRes.rowCount && sessionRes.rowCount > 0) {
      const isDeload = sessionRes.rows[0].is_deload;
      isTrainingDay = !isDeload;
    }
  }

  const targetCalories = isTrainingDay ? 2200 : 2050;

  // Step 3: UPSERT the goals row; never touch past rows from other call sites
  await client.query(
    `INSERT INTO nutrition_goals_daily
       (user_id, goal_date, is_training_day,
        target_calories, target_protein_g, target_fat_g,
        target_fiber_g, target_sugar_g_max, target_sodium_mg_max,
        target_iron_mg, target_vitamin_d_mcg, target_water_ml)
     VALUES
       ($1, $2, $3,
        $4, 160, 70,
        30, 45, 2300,
        8, 15, 3000)
     ON CONFLICT (user_id, goal_date)
     DO UPDATE SET
       is_training_day  = EXCLUDED.is_training_day,
       target_calories  = EXCLUDED.target_calories,
       target_protein_g = EXCLUDED.target_protein_g`,
    [userId, date, isTrainingDay, targetCalories]
  );
}
