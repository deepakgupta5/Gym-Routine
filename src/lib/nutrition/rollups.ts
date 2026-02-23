/**
 * Daily nutrition rollup — mirrors pattern of recomputeWeeklyRollup()
 * in src/lib/db/logs.ts.
 *
 * Must be called inside an open transaction at every write site:
 *   POST /api/nutrition/log
 *   PUT  /api/nutrition/log/[id]
 *   DELETE /api/nutrition/log/[id]
 */

import type { PoolClient } from "pg";

export type DailyRollup = {
  rollup_date:         string;
  total_calories:      number;
  total_protein_g:     number;
  total_carbs_g:       number;
  total_fat_g:         number;
  total_fiber_g:       number;
  total_sugar_g:       number;
  total_sodium_mg:     number;
  total_iron_mg:       number;
  total_calcium_mg:    number;
  total_vitamin_d_mcg: number;
  total_vitamin_c_mg:  number;
  total_potassium_mg:  number;
  water_ml:            number;
  meal_count:          number;
};

/**
 * SUMs all meal_items via JOIN on meal_logs for (userId, date),
 * then UPSERTs daily_nutrition_rollups.
 * Returns the upserted row.
 */
export async function recomputeDailyRollup(
  client: PoolClient,
  userId: string,
  date: string // "YYYY-MM-DD"
): Promise<DailyRollup> {
  const totalsRes = await client.query<{
    total_calories:      string;
    total_protein_g:     string;
    total_carbs_g:       string;
    total_fat_g:         string;
    total_fiber_g:       string;
    total_sugar_g:       string;
    total_sodium_mg:     string;
    total_iron_mg:       string;
    total_calcium_mg:    string;
    total_vitamin_d_mcg: string;
    total_vitamin_c_mg:  string;
    total_potassium_mg:  string;
    meal_count:          string;
  }>(
    `SELECT
       COALESCE(SUM(mi.calories),      0) AS total_calories,
       COALESCE(SUM(mi.protein_g),     0) AS total_protein_g,
       COALESCE(SUM(mi.carbs_g),       0) AS total_carbs_g,
       COALESCE(SUM(mi.fat_g),         0) AS total_fat_g,
       COALESCE(SUM(mi.fiber_g),       0) AS total_fiber_g,
       COALESCE(SUM(mi.sugar_g),       0) AS total_sugar_g,
       COALESCE(SUM(mi.sodium_mg),     0) AS total_sodium_mg,
       COALESCE(SUM(mi.iron_mg),       0) AS total_iron_mg,
       COALESCE(SUM(mi.calcium_mg),    0) AS total_calcium_mg,
       COALESCE(SUM(mi.vitamin_d_mcg), 0) AS total_vitamin_d_mcg,
       COALESCE(SUM(mi.vitamin_c_mg),  0) AS total_vitamin_c_mg,
       COALESCE(SUM(mi.potassium_mg),  0) AS total_potassium_mg,
       COUNT(DISTINCT ml.meal_log_id)      AS meal_count
     FROM meal_logs ml
     JOIN meal_items mi ON mi.meal_log_id = ml.meal_log_id
     WHERE ml.user_id = $1 AND ml.meal_date = $2`,
    [userId, date]
  );

  const t = totalsRes.rows[0];

  const upserted = await client.query<DailyRollup>(
    `INSERT INTO daily_nutrition_rollups
       (user_id, rollup_date,
        total_calories, total_protein_g, total_carbs_g, total_fat_g,
        total_fiber_g, total_sugar_g, total_sodium_mg, total_iron_mg,
        total_calcium_mg, total_vitamin_d_mcg, total_vitamin_c_mg,
        total_potassium_mg, water_ml, meal_count, updated_at)
     VALUES
       ($1, $2,
        $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, 0, $15, now())
     ON CONFLICT (user_id, rollup_date)
     DO UPDATE SET
       total_calories      = EXCLUDED.total_calories,
       total_protein_g     = EXCLUDED.total_protein_g,
       total_carbs_g       = EXCLUDED.total_carbs_g,
       total_fat_g         = EXCLUDED.total_fat_g,
       total_fiber_g       = EXCLUDED.total_fiber_g,
       total_sugar_g       = EXCLUDED.total_sugar_g,
       total_sodium_mg     = EXCLUDED.total_sodium_mg,
       total_iron_mg       = EXCLUDED.total_iron_mg,
       total_calcium_mg    = EXCLUDED.total_calcium_mg,
       total_vitamin_d_mcg = EXCLUDED.total_vitamin_d_mcg,
       total_vitamin_c_mg  = EXCLUDED.total_vitamin_c_mg,
       total_potassium_mg  = EXCLUDED.total_potassium_mg,
       meal_count          = EXCLUDED.meal_count,
       updated_at          = now()
     RETURNING
       rollup_date::text    AS rollup_date,
       total_calories::float,
       total_protein_g::float,
       total_carbs_g::float,
       total_fat_g::float,
       total_fiber_g::float,
       total_sugar_g::float,
       total_sodium_mg::float,
       total_iron_mg::float,
       total_calcium_mg::float,
       total_vitamin_d_mcg::float,
       total_vitamin_c_mg::float,
       total_potassium_mg::float,
       water_ml::float,
       meal_count`,
    [
      userId,
      date,
      t.total_calories,
      t.total_protein_g,
      t.total_carbs_g,
      t.total_fat_g,
      t.total_fiber_g,
      t.total_sugar_g,
      t.total_sodium_mg,
      t.total_iron_mg,
      t.total_calcium_mg,
      t.total_vitamin_d_mcg,
      t.total_vitamin_c_mg,
      t.total_potassium_mg,
      t.meal_count,
    ]
  );

  return upserted.rows[0];
}
