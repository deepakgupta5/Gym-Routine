import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { getExerciseImageUrl } from "@/lib/engine/exerciseImages";
import SessionLogger from "./SessionLogger";

type PageProps = {
  params: Promise<{ date?: string }>;
  searchParams?: Promise<{ date?: string }>;
};

type ParsedDate = {
  iso: string;
  dmy: string;
  source: "iso" | "dmy";
};

function isValidIsoDate(value: string) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const dt = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === value;
}

function isoToDmy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function dmyToIso(dmy: string) {
  const m = dmy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

function parseSessionDate(raw: string): ParsedDate | null {
  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && isValidIsoDate(trimmed)) {
    return { iso: trimmed, dmy: isoToDmy(trimmed), source: "iso" };
  }

  const iso = dmyToIso(trimmed);
  if (!iso) return null;

  return { iso, dmy: trimmed, source: "dmy" };
}

export default async function SessionPage({ params, searchParams }: PageProps) {
  requireConfig();
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : {};

  const rawParam = typeof resolvedParams?.date === "string" ? resolvedParams.date : "";
  const rawQuery = typeof resolvedSearch?.date === "string" ? resolvedSearch.date : "";
  const raw = decodeURIComponent((rawParam || rawQuery || "").trim());

  const parsed = parseSessionDate(raw);

  if (!parsed) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Invalid date</h1>
        <p>Expected format: DD-MM-YYYY</p>
        <p>Received: {raw || "(empty)"}</p>
      </main>
    );
  }

  // Canonicalize legacy YYYY-MM-DD links to DD-MM-YYYY URLs.
  if (parsed.source === "iso") {
    redirect(`/session/${parsed.dmy}`);
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const sessionRes = await client.query(
      `select plan_session_id, date::text as date, session_type, is_deload,
              cardio_minutes, conditioning_minutes
       from plan_sessions
       where user_id = $1 and date = $2`,
      [CONFIG.SINGLE_USER_ID, parsed.iso]
    );

    if (sessionRes.rowCount === 0) {
      return (
        <main style={{ padding: 24 }}>
          <h1>No session scheduled</h1>
          <p>{parsed.dmy}</p>
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
