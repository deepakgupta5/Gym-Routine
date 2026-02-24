import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { ensureNutritionProfile } from "@/lib/nutrition/profile";
import { regenerateFutureGoals } from "@/lib/nutrition/goals";
import type { PoolClient } from "pg";

export const dynamic = "force-dynamic";

type ProfileRow = {
  age: number;
  height_cm: number;
  sex: string;
  nutrition_goal: string;
  tdee_calculated: number | null;
  tdee_override: number | null;
  allowed_proteins: unknown;
  allergies: unknown;
  meal_pattern: unknown;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo25(value: number): number {
  return Math.round(value / 25) * 25;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(input: unknown): number | null {
  if (input == null) return null;
  if (input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  return n;
}

function deriveTargets(tdee: number) {
  const effective = clamp(roundTo25(tdee), 1800, 4200);
  return {
    effective_tdee: effective,
    training_day_calories: clamp(roundTo25(effective - 350), 1200, 4200),
    rest_day_calories: clamp(roundTo25(effective - 500), 1200, 4200),
  };
}

async function readProfile(client: PoolClient, userId: string): Promise<ProfileRow> {
  const res = await client.query<ProfileRow>(
    `SELECT
       age,
       height_cm::float AS height_cm,
       sex,
       nutrition_goal,
       tdee_calculated::float AS tdee_calculated,
       tdee_override::float AS tdee_override,
       allowed_proteins,
       allergies,
       meal_pattern
     FROM nutrition_profile
     WHERE user_id = $1`,
    [userId]
  );

  if (res.rowCount && res.rowCount > 0) return res.rows[0];
  throw new Error("nutrition_profile_missing");
}

export async function GET() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await ensureNutritionProfile(client, userId);
    const profile = await readProfile(client, userId);

    const baseTdee = profile.tdee_override ?? profile.tdee_calculated ?? 2550;
    const targets = deriveTargets(baseTdee);

    return NextResponse.json({
      profile: {
        age: profile.age,
        height_cm: profile.height_cm,
        sex: profile.sex,
        nutrition_goal: profile.nutrition_goal,
        allowed_proteins: profile.allowed_proteins,
        allergies: profile.allergies,
        meal_pattern: profile.meal_pattern,
        tdee_calculated: profile.tdee_calculated,
        tdee_override: profile.tdee_override,
        ...targets,
      },
    });
  } catch (err) {
    logError("nutrition_profile_get_failed", err, { user_id: userId });
    return NextResponse.json({ error: "nutrition_profile_get_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const override = toNumberOrNull(body.tdee_override);
  if (body.tdee_override !== null && body.tdee_override !== "" && override == null) {
    return NextResponse.json({ error: "invalid_tdee_override" }, { status: 400 });
  }
  if (override != null && (override < 1400 || override > 5000)) {
    return NextResponse.json({ error: "invalid_tdee_override" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await ensureNutritionProfile(client, userId);

    await client.query(
      `UPDATE nutrition_profile
       SET tdee_override = $2,
           updated_at = now()
       WHERE user_id = $1`,
      [userId, override]
    );

    await regenerateFutureGoals(client, userId, todayUtc());

    const profile = await readProfile(client, userId);
    const baseTdee = profile.tdee_override ?? profile.tdee_calculated ?? 2550;
    const targets = deriveTargets(baseTdee);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      profile: {
        age: profile.age,
        height_cm: profile.height_cm,
        sex: profile.sex,
        nutrition_goal: profile.nutrition_goal,
        allowed_proteins: profile.allowed_proteins,
        allergies: profile.allergies,
        meal_pattern: profile.meal_pattern,
        tdee_calculated: profile.tdee_calculated,
        tdee_override: profile.tdee_override,
        ...targets,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_profile_put_failed", err, { user_id: userId });
    return NextResponse.json({ error: "nutrition_profile_put_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
