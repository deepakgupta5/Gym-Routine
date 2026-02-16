import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";
import SessionLogger from "./SessionLogger";

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type PageProps = {
  params: Promise<{ date?: string }>;
  searchParams?: Promise<{ date?: string }>;
};

export default async function SessionPage({ params, searchParams }: PageProps) {
  requireConfig();
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const rawParam = typeof resolvedParams?.date === "string" ? resolvedParams.date : "";
  const rawQuery =
    typeof resolvedSearch?.date === "string" ? resolvedSearch.date : "";
  const raw = decodeURIComponent((rawParam || rawQuery || "").trim());
  const date = raw.slice(0, 10);

  if (!isDateString(date)) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Invalid date</h1>
        <p>Expected format: YYYY-MM-DD</p>
        <p>Received: {raw || "(empty)"}</p>
      </main>
    );
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const sessionRes = await client.query(
      `select plan_session_id, date::text as date, session_type, is_deload,
              cardio_minutes, conditioning_minutes
       from plan_sessions
       where user_id = $1 and date = $2`,
      [CONFIG.SINGLE_USER_ID, date]
    );

    if (sessionRes.rowCount === 0) {
      return (
        <main style={{ padding: 24 }}>
          <h1>No session scheduled</h1>
          <p>{date}</p>
        </main>
      );
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

    const setLogsRes = await client.query(
      `select id, session_id, exercise_id, set_type, set_index,
              load::text as load, reps, notes, performed_at
       from set_logs
       where user_id = $1 and session_id = $2
       order by exercise_id asc, set_index asc, performed_at asc`,
      [CONFIG.SINGLE_USER_ID, session.plan_session_id]
    );

    return (
      <SessionLogger
        session={session}
        exercises={exercises}
        logs={setLogsRes.rows}
      />
    );
  } finally {
    client.release();
  }
}
