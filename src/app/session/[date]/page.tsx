import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";

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
      image_url: getExerciseImageUrl(row.targeted_primary_muscle),
    }));

    return (
      <main style={{ padding: 24 }}>
        <h1>
          {session.session_type} Session — {session.date}
          {session.is_deload ? " (Deload)" : ""}
        </h1>
        <p>
          Cardio: {session.cardio_minutes} min | Conditioning:{" "}
          {session.conditioning_minutes} min
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Image</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Role</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Exercise</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Sets</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Reps</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Load</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Rest</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Tempo</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((ex: any) => (
              <tr key={ex.plan_exercise_id}>
                <td style={{ padding: "6px 0" }}>
                  <img
                    src={ex.image_url}
                    alt={ex.targeted_primary_muscle}
                    width={36}
                    height={36}
                    style={{ borderRadius: 6, background: "#111827" }}
                  />
                </td>
                <td style={{ padding: "6px 0" }}>{ex.role}</td>
                <td style={{ padding: "6px 0" }}>{ex.name}</td>
                <td style={{ padding: "6px 0" }}>{ex.prescribed_sets}</td>
                <td style={{ padding: "6px 0" }}>
                  {ex.prescribed_reps_min}-{ex.prescribed_reps_max}
                </td>
                <td style={{ padding: "6px 0" }}>{ex.prescribed_load}</td>
                <td style={{ padding: "6px 0" }}>{ex.rest_seconds}s</td>
                <td style={{ padding: "6px 0" }}>{ex.tempo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    );
  } finally {
    client.release();
  }
}
