import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { recomputeWeeklyRollup } from "@/lib/db/logs";
import { getMondayUtc, toDateString } from "@/lib/engine/utils";

type UpdateSessionMinutesBody = {
  session_id?: string;
  cardio_minutes?: number;
  conditioning_minutes?: number;
};

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

  if (!isNonNegativeInteger(body.cardio_minutes) || !isNonNegativeInteger(body.conditioning_minutes)) {
    return NextResponse.json(
      { error: "invalid_minutes", detail: "cardio_minutes and conditioning_minutes must be integers >= 0" },
      { status: 400 }
    );
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updatedRes = await client.query(
      `update plan_sessions
       set cardio_minutes = $1,
           conditioning_minutes = $2
       where plan_session_id = $3
         and user_id = $4
       returning plan_session_id, date::text as date, performed_at`,
      [body.cardio_minutes, body.conditioning_minutes, body.session_id, userId]
    );

    if (updatedRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const session = updatedRes.rows[0];

    if (session.performed_at) {
      const weekStart = toDateString(getMondayUtc(new Date(`${session.date}T00:00:00Z`)));
      await recomputeWeeklyRollup(client, userId, weekStart);
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      session_id: session.plan_session_id,
      cardio_minutes: body.cardio_minutes,
      conditioning_minutes: body.conditioning_minutes,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("update_session_minutes_failed", err);
    return NextResponse.json({ error: "update_session_minutes_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
