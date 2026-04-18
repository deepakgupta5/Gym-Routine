import { redirect } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { ensureWorkoutPlanForDate } from "@/lib/scheduler/integration";
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
cardio_saved_at: string | null;

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
  next_target_load: string | number | null;
  name: string;
  alt_1_name: string | null;
  alt_2_name: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SetLogRow = {
  id: string;
  session_id: string;
  exercise_id: number;
  set_type: "top" | "backoff" | "straight" | "accessory";
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

function addDaysToDmy(dmy: string, delta: number) {
  const [dd, mm, yyyy] = dmy.split("-").map(Number);
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const y = dt.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

function headerDateFromDmy(dmy: string) {
  const [dd, mm, yyyy] = dmy.split("-").map(Number);
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
  let debugStep = "init";
  try {
    debugStep = "ensureWorkoutPlanForDate";
    try {
      await ensureWorkoutPlanForDate(client, CONFIG.SINGLE_USER_ID, parsed.iso);
    } catch (err) {
      const e = err as { message?: string; code?: string; detail?: string; stack?: string };
      // eslint-disable-next-line no-console
      console.error("[SESSION_PAGE_V1_DEBUG] ensureWorkoutPlanForDate failed", {
        iso: parsed.iso,
        dmy: parsed.dmy,
        userId: CONFIG.SINGLE_USER_ID,
        errMessage: e?.message,
        errCode: e?.code,
        errDetail: e?.detail,
        errStack: e?.stack,
      });
      throw err;
    }

    debugStep = "load_user_profile";
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

    debugStep = "load_plan_session";
    const sessionRes = await client.query<SessionRow>(
      `select plan_session_id,
              date::text as date,
              session_type,
              is_deload,
              cardio_minutes,
              cardio_saved_at::text as cardio_saved_at
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

      // Find the next upcoming session for "Go to next workout" CTA (#3)
      const nextSessionRes = await client.query<{ date: string }>(
        `select date::text as date
         from plan_sessions
         where user_id = $1 and block_id = $2 and date > $3 and performed_at is null
         order by date asc
         limit 1`,
        [CONFIG.SINGLE_USER_ID, activeBlockId, parsed.iso]
      );
      const nextSessionIso = nextSessionRes.rows[0]?.date ?? null;
      const nextSessionDmy = nextSessionIso ? isoToDmy(nextSessionIso) : null;

      const currentDmy = parsed.dmy;
      const prevDmy = addDaysToDmy(currentDmy, -1);
      const nextDmy = addDaysToDmy(currentDmy, 1);
      const headerDate = headerDateFromDmy(currentDmy);

      return (
        <main className="mx-auto max-w-5xl p-5 md:p-6">
          <BackForwardRefresh />
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-gray-700 bg-gray-800/70 px-3 py-3">
            <Link
              href={`/session/${prevDmy}`}
              className="min-h-[44px] px-3 py-2 text-sm text-gray-400 hover:text-gray-100"
            >
              ← Prev
            </Link>
            <h1 className="text-center text-2xl font-semibold text-gray-100">{headerDate}</h1>
            <Link
              href={`/session/${nextDmy}`}
              className="min-h-[44px] px-3 py-2 text-sm text-gray-400 hover:text-gray-100"
            >
              Next →
            </Link>
          </div>
          <SkipConfirmationBanner isoDate={parsed.iso} initialVisible={skipConfirmed} />
          <h2 className="text-2xl font-semibold text-gray-100">No session scheduled</h2>
          <p className="mt-2 text-sm text-gray-400">{currentDmy}</p>
          <p className="mt-1 text-sm text-gray-500">This is a rest day or has been skipped.</p>
          {nextSessionDmy && (
            <Link
              href={`/session/${nextSessionDmy}`}
              prefetch={false}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-blue-700 bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
            >
              Go to Next Workout →
            </Link>
          )}
        </main>
      );

    }

    const session = sessionRes.rows[0];

    debugStep = "load_plan_exercises";
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
              pe.next_target_load,
              e.name,
              e.movement_pattern,
              alt1.name as alt_1_name,
              alt2.name as alt_2_name
       from plan_exercises pe
       join exercises e on e.exercise_id = pe.exercise_id
       left join exercises alt1 on alt1.exercise_id = e.alt_1_exercise_id
       left join exercises alt2 on alt2.exercise_id = e.alt_2_exercise_id
       where pe.plan_session_id = $1
         and pe.skipped_at is null
       order by case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                pe.exercise_id asc`,
      [session.plan_session_id]
    ).catch((error) => {
      if (!isMissingSkippedAtColumn(error)) throw error;
      return client.query<ExerciseRow>(
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
                pe.next_target_load,
                e.name,
                e.movement_pattern,
                alt1.name as alt_1_name,
                alt2.name as alt_2_name
         from plan_exercises pe
         join exercises e on e.exercise_id = pe.exercise_id
         left join exercises alt1 on alt1.exercise_id = e.alt_1_exercise_id
         left join exercises alt2 on alt2.exercise_id = e.alt_2_exercise_id
         where pe.plan_session_id = $1
         order by case pe.role when 'primary' then 1 when 'secondary' then 2 else 3 end,
                  pe.exercise_id asc`,
        [session.plan_session_id]
      );
    });

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
      next_target_load: toNullableNumber(row.next_target_load),
      alt_1_name: row.alt_1_name ?? null,
      alt_2_name: row.alt_2_name ?? null,
    }));

    debugStep = "load_set_logs";
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

    debugStep = "load_top_set_history";
    // Top set history for progress widgets (last 3 per exercise) + PR max
    const exerciseIds = exercises.map((e) => e.exercise_id);
    const topSetHistoryRes = exerciseIds.length > 0
      ? await client.query<{ exercise_id: number; load: string; reps: number }>(
          `select tsh.exercise_id, tsh.load::text as load, tsh.reps
           from top_set_history tsh
           join set_logs sl on sl.id = tsh.source_set_log_id
           join plan_sessions ps on ps.plan_session_id = sl.session_id
           where tsh.user_id = $1
             and tsh.exercise_id = any($2::int[])
             and ps.user_id = $1
             and (
               ps.date < $4::date
               or (ps.date = $4::date and sl.session_id <> $3)
             )
           order by tsh.exercise_id, tsh.performed_at desc`,
          [CONFIG.SINGLE_USER_ID, exerciseIds, session.plan_session_id, session.date]
        )
      : { rows: [] };

    // Group by exercise_id, take first 3 (most recent)
    const recentTopSets: Record<number, Array<{ load: string; reps: number }>> = {};
    for (const row of topSetHistoryRes.rows) {
      const exId = Number(row.exercise_id);
      if (!recentTopSets[exId]) recentTopSets[exId] = [];
      if (recentTopSets[exId].length < 3) {
        recentTopSets[exId].push({ load: row.load, reps: row.reps });
      }
    }

    debugStep = "load_pr_max";
    // PR max (max estimated 1RM per exercise)
    const prMaxRes = exerciseIds.length > 0
      ? await client.query<{ exercise_id: number; max_1rm: number }>(
          `select tsh.exercise_id, max(tsh.estimated_1rm)::float as max_1rm
           from top_set_history tsh
           join set_logs sl on sl.id = tsh.source_set_log_id
           join plan_sessions ps on ps.plan_session_id = sl.session_id
           where tsh.user_id = $1
             and tsh.exercise_id = any($2::int[])
             and ps.user_id = $1
             and (
               ps.date < $4::date
               or (ps.date = $4::date and sl.session_id <> $3)
             )
           group by tsh.exercise_id`,
          [CONFIG.SINGLE_USER_ID, exerciseIds, session.plan_session_id, session.date]
        )
      : { rows: [] };

    const prMaxByExercise: Record<number, number> = {};
    for (const row of prMaxRes.rows) {
      prMaxByExercise[Number(row.exercise_id)] = Number(row.max_1rm);
    }

    return (
      <>
        <BackForwardRefresh />
        <SessionLogger
        session={session}
        exercises={exercises}
        logs={setLogsRes.rows}
        skipConfirmed={skipHintFromQuery}
        recentTopSets={recentTopSets}
        prMaxByExercise={prMaxByExercise}
      />
      </>
    );
  } catch (err) {
    const e = err as { message?: string; code?: string; detail?: string; stack?: string };
    // eslint-disable-next-line no-console
    console.error("[SESSION_PAGE_V1_DEBUG] SessionPage failed", {
      debugStep,
      iso: parsed.iso,
      dmy: parsed.dmy,
      userId: CONFIG.SINGLE_USER_ID,
      errMessage: e?.message,
      errCode: e?.code,
      errDetail: e?.detail,
      errStack: e?.stack,
    });
    throw err;
  } finally {
    client.release();
  }
}

function isMissingSkippedAtColumn(error: unknown): error is { code?: string; message?: string } {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string; message?: string };
  return pgError.code === "42703" && String(pgError.message || "").includes("skipped_at");
}
