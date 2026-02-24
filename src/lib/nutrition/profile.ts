/**
 * Ensures a nutrition_profile row exists for the user.
 * Uses INSERT ON CONFLICT DO NOTHING — safe to call on every request.
 * Defaults are user-scoped profile values, not schema-level defaults.
 */

import type { PoolClient } from "pg";

export async function ensureNutritionProfile(
  client: PoolClient,
  userId: string
): Promise<void> {
  await client.query(
    `INSERT INTO nutrition_profile
       (user_id, age, height_cm, sex, nutrition_goal,
        allowed_proteins, allergies, meal_pattern, tdee_calculated)
     VALUES
       ($1, 49, 178, 'male', 'cut',
        '["chicken","shrimp","eggs","dairy","plant"]'::jsonb,
        '[]'::jsonb,
        '["breakfast","lunch","dinner","snack"]'::jsonb,
        2550)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}
