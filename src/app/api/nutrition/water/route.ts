import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const date = typeof body.date === "string" && body.date ? body.date : isoToday();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const waterMl = Number(body.water_ml);
  if (!Number.isFinite(waterMl) || waterMl < 0 || waterMl > 10000) {
    return NextResponse.json({ error: "invalid_water_ml" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const upsertRes = await client.query<{
      rollup_date: string;
      water_ml: number;
      meal_count: number;
    }>(
      `INSERT INTO daily_nutrition_rollups
         (user_id, rollup_date,
          total_calories, total_protein_g, total_carbs_g, total_fat_g,
          total_fiber_g, total_sugar_g, total_sodium_mg, total_iron_mg,
          total_calcium_mg, total_vitamin_d_mcg, total_vitamin_c_mg,
          total_potassium_mg, water_ml, meal_count, updated_at)
       VALUES
         ($1, $2,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0,
          0, $3, 0, now())
       ON CONFLICT (user_id, rollup_date)
       DO UPDATE SET
         water_ml = EXCLUDED.water_ml,
         updated_at = now()
       RETURNING rollup_date::text AS rollup_date, water_ml::float AS water_ml, meal_count`,
      [userId, date, Math.round(waterMl)]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      date,
      water_ml: upsertRes.rows[0]?.water_ml ?? Math.round(waterMl),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_water_update_failed", err, { user_id: userId, date });
    return NextResponse.json({ error: "nutrition_water_update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
