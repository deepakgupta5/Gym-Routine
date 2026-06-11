// GET + PATCH /api/plan/frequency
// Returns and updates the user's target sessions per week (PRD Section 6.5).
// Range: 3-6 inclusive. Default: 4.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MIN_SESSIONS = 3;
const MAX_SESSIONS = 6;

export async function GET() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const pool   = await getDb();
  const client = await pool.connect();
  try {
    const res = await client.query<{ target_sessions_per_week: number }>(
      `select target_sessions_per_week
       from user_profile
       where user_id = $1`,
      [userId]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      target_sessions_per_week: Number(res.rows[0].target_sessions_per_week),
    });
  } catch (err) {
    logError("frequency_get_failed", err, {});
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as unknown;
  const raw  = typeof body === "object" && body !== null
    ? (body as Record<string, unknown>).target_sessions_per_week
    : undefined;

  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < MIN_SESSIONS || value > MAX_SESSIONS) {
    return NextResponse.json(
      { error: "invalid_value", detail: `target_sessions_per_week must be an integer ${MIN_SESSIONS}-${MAX_SESSIONS}` },
      { status: 400 }
    );
  }

  const pool   = await getDb();
  const client = await pool.connect();
  try {
    const res = await client.query<{ target_sessions_per_week: number }>(
      `update user_profile
       set    target_sessions_per_week = $1,
              updated_at               = now()
       where  user_id = $2
       returning target_sessions_per_week`,
      [value, userId]
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      target_sessions_per_week: Number(res.rows[0].target_sessions_per_week),
    });
  } catch (err) {
    logError("frequency_patch_failed", err, { value });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
