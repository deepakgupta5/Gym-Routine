import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

type ExerciseSettingRow = {
  exercise_id: number;
  name: string;
  muscle_primary: string;
  is_enabled: boolean;
  user_preference_score: number;
  load_increment_lb: number;
};

export async function GET() {
  try {
    requireConfig();
    const pool = await getDb();
    const client = await pool.connect();
    try {
      const res = await client.query<ExerciseSettingRow>(
        `select exercise_id,
                name,
                coalesce(muscle_primary, 'other') as muscle_primary,
                coalesce(is_enabled, true)               as is_enabled,
                coalesce(user_preference_score, 0)       as user_preference_score,
                coalesce(load_increment_lb, 5)           as load_increment_lb
         from exercises
         where coalesce(array_length(allowed_day_types, 1), 0) > 0
           and coalesce(muscle_primary, '') <> 'conditioning'
         order by muscle_primary asc, name asc`
      );
      return NextResponse.json({ exercises: res.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    logError("exercise_settings_get_failed", err, {});
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

type PutBody = {
  exercise_id: number;
  is_enabled?: boolean;
  user_preference_score?: number;
  load_increment_lb?: number;
};

export async function PUT(req: Request) {
  try {
    requireConfig();

    const body = (await req.json().catch(() => null)) as PutBody | null;
    if (!body || typeof body.exercise_id !== "number") {
      return NextResponse.json({ error: "exercise_id required" }, { status: 400 });
    }

    const { exercise_id, is_enabled, user_preference_score, load_increment_lb } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (typeof is_enabled === "boolean") {
      updates.push(`is_enabled = $${idx++}`);
      values.push(is_enabled);
    }
    if (typeof user_preference_score === "number") {
      if (user_preference_score < 0 || user_preference_score > 3) {
        return NextResponse.json({ error: "user_preference_score must be 0-3" }, { status: 400 });
      }
      updates.push(`user_preference_score = $${idx++}`);
      values.push(user_preference_score);
    }
    if (typeof load_increment_lb === "number") {
      if (load_increment_lb < 1 || load_increment_lb > 50) {
        return NextResponse.json({ error: "load_increment_lb must be 1-50" }, { status: 400 });
      }
      updates.push(`load_increment_lb = $${idx++}`);
      values.push(load_increment_lb);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    values.push(exercise_id);

    const pool = await getDb();
    const client = await pool.connect();
    try {
      const res = await client.query<ExerciseSettingRow>(
        `update exercises
         set ${updates.join(", ")}
         where exercise_id = $${idx}
         returning exercise_id, name,
                   coalesce(muscle_primary, 'other') as muscle_primary,
                   coalesce(is_enabled, true)               as is_enabled,
                   coalesce(user_preference_score, 0)       as user_preference_score,
                   coalesce(load_increment_lb, 5)           as load_increment_lb`,
        values
      );

      if (res.rowCount === 0) {
        return NextResponse.json({ error: "exercise_not_found" }, { status: 404 });
      }

      return NextResponse.json({ exercise: res.rows[0] });
    } finally {
      client.release();
    }
  } catch (err) {
    logError("exercise_settings_put_failed", err, {});
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
