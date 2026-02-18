import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import SessionLogger from "./SessionLogger";
import BackForwardRefresh from "./components/BackForwardRefresh";
import SkipConfirmationBanner from "./components/SkipConfirmationBanner";

type PageProps = {
  params: Promise<{ date?: string }>;
  searchParams?: Promise<{ date?: string; skipped?: string }>;
};

type ParsedDate = {
  iso: string;
  dmy: string;
  source: "iso" | "dmy";
};

type SessionRow = {
  plan_session_id: string;
  date: string;
  session_type: string;
  is_deload: boolean;
  cardio_minutes: number;
};

type ExerciseRow = {
  plan_exercise_id: string;
  exercise_id: number;
  role: "primary" | "secondary" | "accessory";
  movement_pattern: string;
  targeted_primary_muscle: string | null;
  targeted_secondary_muscle: string | null;
  prescribed_sets: number;
  prescribed_reps_min: number;
  prescribed_reps_max: number;
  prescribed_load: string;
  rest_seconds: number;
  tempo: string;
  prev_load: string | number | null;
  prev_reps: number | null;
  name: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SetLogRow = {
  id: string;
  session_id: string;
  exercise_id: number;
  set_type: "top" | "backoff" | "accessory";
  set_index: number;
  load: string;
  reps: number;
  notes: string | null;
  performed_at: string;
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

function toNullableNumber(value: string | number | null) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function SessionPage({ params, searchParams }: PageProps) {
  requireConfig();
  noStore();
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : {};

  const rawParam = typeof resolvedParams?.date === "string" ? resolvedParams.date : "";
  const rawQuery = typeof resolvedSearch?.date === "string" ? resolvedSearch.date : "";
  const raw = decodeURIComponent((rawParam || rawQuery || "").trim());
  const skipHintFromQuery = resolvedSearch?.skipped === "1";

  const parsed = parseSessionDate(raw);

  if (!parsed) {
    return (
      <main className="mx-auto max-w-5xl p-5 md:p-6">
        <BackForwardRefresh />
        <h1 className="text-2xl font-semibold text-gray-100">Invalid date</h1>
        <p className="mt-2 text-sm text-gray-400">Expected format: DD-MM-YYYY</p>
        <p className="text-sm text-gray-500">Received: {raw || "(empty)"}</p>
      </main>
    );
  }

  if (parsed.source === "iso") {
    const suffix = skipHintFromQuery ? "?skipped=1" : "";
    redirect(`/session/${parsed.dmy}${suffix}`);
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const profileRes = await client.query<{ block_id: string | null }>(
      `select block_id
       from user_profile
       where user_id = $1`,
      [CONFIG.SINGLE_USER_ID]
    );

    if (profileRes.rowCount === 0) {
      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <BackForwardRefresh />
          <h1 className="text-2xl font-semibold text-gray-100">Profile not found</h1>
        </main>
      );
    }

    const activeBlockId = profileRes.rows[0]?.block_id;
    if (!activeBlockId) {
      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <BackForwardRefresh />
          <h1 className="text-2xl font-semibold text-gray-100">No active block</h1>
        </main>
      );
    }

    const sessionRes = await client.query<SessionRow>(
      `select plan_session_id,
              date::text as date,
              session_type,
              is_deload,
              cardio_minutes
       from plan_sessions
       where user_id = $1 and block_id = $2 and date = $3`,
      [CONFIG.SINGLE_USER_ID, activeBlockId, parsed.iso]
    );

    if (sessionRes.rowCount === 0) {
      const skippedRes = await client.query<{ was_skipped: boolean }>(
        `select $1 = any(skipped_dates) as was_skipped
         from user_profile
         where user_id = $2`,
        [parsed.iso, CONFIG.SINGLE_USER_ID]
      );

      const wasSkippedInDb = Boolean(skippedRes.rows[0]?.was_skipped);
      const skipConfirmed = skipHintFromQuery || wasSkippedInDb;

      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <BackForwardRefresh />
          <SkipConfirmationBanner isoDate={parsed.iso} initialVisible={skipConfirmed} />
          <h1 className="text-2xl font-semibold text-gray-100">No session scheduled</h1>
          <p className="mt-2 text-sm text-gray-400">{parsed.dmy}</p>
          <p className="mt-1 text-sm text-gray-500">This is a rest day or has been skipped.</p>
        </main>
      );
    }

    const session = sessionRes.rows[0];

    const exercisesRes = await client.query<ExerciseRow>(
      `select pe.plan_exercise_id,
              pe.exercise_id,
              pe.role,
              pe.targeted_primary_muscle,
              pe.targeted_secondary_muscle,
              pe.prescribed_sets,
              pe.prescribed_reps_min,
              pe.prescribed_reps_max,
              pe.prescribed_load::text as prescribed_load,
              pe.rest_seconds,
              pe.tempo,
              pe.prev_load,
              pe.prev_reps,
              e.name,
              e.movement_pattern
       from plan_exercises pe
       join exercises e on e.exercise_id = pe.exercise_id
       where pe.plan_session_id = $1
       order by case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                pe.exercise_id asc`,
      [session.plan_session_id]
    );

    const exercises = exercisesRes.rows.map((row) => ({
      plan_exercise_id: row.plan_exercise_id,
      exercise_id: Number(row.exercise_id),
      role: row.role,
      name: row.name,
      movement_pattern: row.movement_pattern,
      targeted_primary_muscle: row.targeted_primary_muscle,
      targeted_secondary_muscle: row.targeted_secondary_muscle,
      prescribed_sets: Number(row.prescribed_sets),
      prescribed_reps_min: Number(row.prescribed_reps_min),
      prescribed_reps_max: Number(row.prescribed_reps_max),
      prescribed_load: row.prescribed_load,
      rest_seconds: Number(row.rest_seconds),
      tempo: row.tempo,
      prev_load: toNullableNumber(row.prev_load),
      prev_reps: row.prev_reps === null ? null : Number(row.prev_reps),
    }));

    const setLogsRes = await client.query<SetLogRow>(
      `select id,
              session_id,
              exercise_id,
              set_type,
              set_index,
              load::text as load,
              reps,
              notes,
              performed_at::text as performed_at
       from set_logs
       where user_id = $1 and session_id = $2
       order by exercise_id asc, set_index asc, performed_at asc`,
      [CONFIG.SINGLE_USER_ID, session.plan_session_id]
    );

    return (
      <>
        <BackForwardRefresh />
        <SessionLogger
        session={session}
        exercises={exercises}
        logs={setLogsRes.rows}
        skipConfirmed={skipHintFromQuery}
      />
      </>
    );
  } finally {
    client.release();
  }
}
