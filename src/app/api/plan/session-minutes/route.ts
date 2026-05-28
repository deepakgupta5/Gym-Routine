import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { recomputeWeeklyRollup } from "@/lib/db/logs";
import { syncCompletedWorkoutAndState } from "@/lib/scheduler/integration";
import { getMondayUtc, toDateString } from "@/lib/engine/utils";
import { logError } from "@/lib/logger";

type UpdateSessionMinutesBody = {
  session_id?: string;
  cardio_minutes?: number;
  cardio_type?: string;
};

const MAX_CARDIO_MINUTES = 300;

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

export async function PUT(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as UpdateSessionMinutesBody | null;
  if (!body || typeof body.session_id !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!isNonNegativeInteger(body.cardio_minutes) || Number(body.cardio_minutes) > MAX_CARDIO_MINUTES) {
    return NextResponse.json(
      { error: "invalid_minutes", detail: `cardio_minutes must be an integer 0-${MAX_CARDIO_MINUTES}` },
      { status: 400 }
    );
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cardioType = body.cardio_type === "hiit" ? "hiit" : "zone2";

    const updatedRes = await client.query(
      `update plan_sessions
       set cardio_minutes = $1,
           cardio_saved_at = now(),
           cardio_type = $4
       where user_id = $2
         and plan_session_id = $3
       returning plan_session_id, cardio_minutes, cardio_saved_at,
                 date::text as date, performed_at`,
      [body.cardio_minutes, userId, body.session_id, cardioType]
    );

    if (updatedRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = updatedRes.rows[0];

    // If all exercises in this session are skipped (none remain unskipped),
    // mark the session as performed now so cardio counts in weekly rollup.
    // This covers the "skipped all exercises but did cardio" use-case where
    // performed_at is never set by set-logging.
    if (!session.performed_at) {
      const unfinishedRes = await client.query<{ remaining: string }>(
        `select count(*) as remaining
         from plan_exercises
         where plan_session_id = $1
           and skipped_at is null`,
        [body.session_id]
      );
      const remaining = Number(unfinishedRes.rows[0]?.remaining ?? 1);
      if (remaining === 0) {
        // All exercises skipped - stamp performed_at so this session is tracked
        await client.query(
          `update plan_sessions
           set performed_at = now()
           where plan_session_id = $1 and performed_at is null`,
          [body.session_id]
        );
        session.performed_at = new Date().toISOString();
      }
    }

    if (session.performed_at) {
      const weekStart = toDateString(getMondayUtc(new Date(`${session.date}T00:00:00Z`)));
      await recomputeWeeklyRollup(client, userId, weekStart);
    }

    await syncCompletedWorkoutAndState(client, userId, body.session_id);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      session_id: session.plan_session_id,
      cardio_minutes: body.cardio_minutes,
      cardio_saved_at: session.cardio_saved_at,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("update_session_minutes_failed", err, { user_id: userId, session_id: body.session_id });
    return NextResponse.json({ error: "update_session_minutes_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
