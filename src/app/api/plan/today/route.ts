import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam || toDateString(new Date());

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const sessionRes = await client.query(
      `select plan_session_id, user_id, block_id, week_in_block, date::text as date,
              session_type, is_required, is_deload, cardio_minutes
       from plan_sessions
       where user_id = $1 and date = $2`,
      [userId, date]
    );

    if (sessionRes.rowCount === 0) {
      return NextResponse.json({ session: null, exercises: [] });
    }

    const session = sessionRes.rows[0];

    const exercisesRes = await client.query(
      `select pe.*, e.name, e.movement_pattern, e.equipment_type
       from plan_exercises pe
       join exercises e on e.exercise_id = pe.exercise_id
       where pe.plan_session_id = $1
       order by case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                pe.exercise_id asc`,
      [session.plan_session_id]
    );

    const exercises = exercisesRes.rows.map((row: any) => ({
      ...row,
      image_url: getExerciseImageUrl(row.exercise_id, row.targeted_primary_muscle),
    }));

    return NextResponse.json({ session, exercises });
  } finally {
    client.release();
  }
}
