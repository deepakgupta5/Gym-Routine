// POST /api/plan/force-regen-session
//
// Force-regenerate a v2 session for a specific date.
// Used by the "Force regenerate" and "Change day type" actions on the
// dashboard hero card (PRD Section 6.1).
//
// Body: { date: "YYYY-MM-DD", day_type?: V2DayType }
//   date     - ISO date of the session to regenerate
//   day_type - optional: if provided, the new session uses this day type
//              instead of the rotation (Change day type action).
//              if omitted, the rotation determines the day type (Force regen).
//
// Guards:
//   - Only works when GYM_V2_ENABLED is true.
//   - Rejected if the session has been performed (performed_at IS NOT NULL)
//     or has any logged sets (protects completed workout data).

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { ensureWorkoutPlanForDateV2 } from "@/lib/scheduler/v2";
import { V2_ROTATION } from "@/lib/scheduler/v2/constants";
import type { V2DayType } from "@/lib/scheduler/v2/types";
import { logError } from "@/lib/logger";

function isValidIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

function isV2DayType(s: string): s is V2DayType {
  return (V2_ROTATION as readonly string[]).includes(s);
}

export async function POST(req: Request) {
  requireConfig();

  if (!CONFIG.GYM_V2_ENABLED) {
    return NextResponse.json(
      { error: "v2_not_enabled" },
      { status: 400 }
    );
  }

  const userId = CONFIG.SINGLE_USER_ID;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawDate = (body as Record<string, unknown>)?.date;
  const rawDayType = (body as Record<string, unknown>)?.day_type;

  if (typeof rawDate !== "string" || !isValidIsoDate(rawDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const forcedDayType: V2DayType | undefined =
    typeof rawDayType === "string" && isV2DayType(rawDayType) ? rawDayType : undefined;

  if (rawDayType !== undefined && !forcedDayType) {
    return NextResponse.json(
      { error: "invalid_day_type", allowed: V2_ROTATION },
      { status: 400 }
    );
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    // Look up the existing session and block.
    const profileRes = await client.query(
      `select block_id, current_block_week
       from user_profile
       where user_id = $1`,
      [userId]
    );
    if (profileRes.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    const { block_id: blockId, current_block_week: blockWeek } = profileRes.rows[0];
    if (!blockId) {
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    const sessionRes = await client.query<{
      plan_session_id: string;
      performed_at: string | null;
    }>(
      `select plan_session_id, performed_at
       from plan_sessions
       where user_id = $1 and block_id = $2 and date = $3
       limit 1`,
      [userId, blockId, rawDate]
    );

    const session = sessionRes.rows[0] ?? null;

    if (session?.performed_at) {
      return NextResponse.json(
        { error: "session_already_performed" },
        { status: 409 }
      );
    }

    if (session) {
      // Verify no logged sets exist for this session (protect completed work).
      const setLogRes = await client.query<{ cnt: string }>(
        `select count(*) as cnt from set_logs where session_id = $1`,
        [session.plan_session_id]
      );
      const setCount = Number(setLogRes.rows[0]?.cnt ?? 0);
      if (setCount > 0) {
        return NextResponse.json(
          { error: "session_has_logged_sets", set_count: setCount },
          { status: 409 }
        );
      }
    }

    // Delete existing session (cascade removes plan_exercises).
    await client.query("BEGIN");
    try {
      if (session) {
        await client.query(
          `delete from plan_sessions where plan_session_id = $1`,
          [session.plan_session_id]
        );
      }

      // Regenerate immediately.
      const newSessionId = await ensureWorkoutPlanForDateV2(
        client,
        userId,
        rawDate,
        blockId,
        Number(blockWeek),
        forcedDayType
      );

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        session_id: newSessionId,
        day_type: forcedDayType ?? "rotation",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    logError("force_regen_session_failed", err, { user_id: userId, date: rawDate });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
