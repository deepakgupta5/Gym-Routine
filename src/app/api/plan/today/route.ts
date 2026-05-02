import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";
import { logError } from "@/lib/logger";

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isValidIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const dateParam = req.nextUrl.searchParams.get("date");
  if (dateParam && !isValidIsoDate(dateParam)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  const date = dateParam || toDateString(new Date());

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const profileRes = await client.query(
      `select block_id
       from user_profile
       where user_id = $1`,
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id;
    if (!blockId) {
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    const sessionRes = await client.query(
      `select plan_session_id, user_id, block_id, week_in_block, date::text as date,
              session_type, is_required, is_deload, cardio_minutes,cardio_saved_at::text as cardio_saved_at
       from plan_sessions
       where user_id = $1 and block_id = $2 and date = $3`,
      [userId, blockId, date]
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
         and pe.skipped_at is null
       order by case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                pe.exercise_id asc`,
      [session.plan_session_id]
    );

    const exercises = exercisesRes.rows.map((row: { exercise_id: number; targeted_primary_muscle: string | null }) => ({
      ...row,
      image_url: getExerciseImageUrl(row.exercise_id, row.targeted_primary_muscle),
    }));

    return NextResponse.json({ session, exercises });
  } catch (err) {
    logError("plan_today_failed", err, { user_id: userId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
