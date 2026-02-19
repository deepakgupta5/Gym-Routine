import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { addDays, toDateString, getMondayUtc } from "@/lib/engine/utils";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const weekStartParam = req.nextUrl.searchParams.get("weekStart");

  let weekStart = weekStartParam;
  if (!weekStart) {
    weekStart = toDateString(getMondayUtc());
  } else if (!isDateString(weekStart)) {
    return NextResponse.json({ error: "invalid_weekStart" }, { status: 400 });
  }

  const startDate = new Date(weekStart + "T00:00:00Z");
  const endDate = toDateString(addDays(startDate, 6));

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

    const sessionsRes = await client.query(
      `select plan_session_id, user_id, block_id, week_in_block, date::text as date,
              session_type, is_required, is_deload, cardio_minutes,cardio_saved_at::text as cardio_saved_at
       from plan_sessions
       where user_id = $1 and block_id = $2 and date between $3 and $4
       order by date asc, session_type asc`,
      [userId, blockId, weekStart, endDate]
    );

    const sessions = sessionsRes.rows;
    if (sessions.length === 0) {
      return NextResponse.json({ week_start: weekStart, sessions: [], exercises: [] });
    }

    const sessionIds = sessions.map((s: any) => s.plan_session_id);
    const exercisesRes = await client.query(
      `select pe.*, e.name, e.movement_pattern, e.equipment_type
       from plan_exercises pe
       join exercises e on e.exercise_id = pe.exercise_id
       where pe.plan_session_id = any($1)
       order by pe.plan_session_id,
                case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                pe.exercise_id asc`,
      [sessionIds]
    );

    const exercises = exercisesRes.rows.map((row: any) => ({
      ...row,
      image_url: getExerciseImageUrl(row.exercise_id, row.targeted_primary_muscle),
    }));

    return NextResponse.json({
      week_start: weekStart,
      sessions,
      exercises,
    });
  } finally {
    client.release();
  }
}
