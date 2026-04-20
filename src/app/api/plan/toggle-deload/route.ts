import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type Body = {
  session_id: string;
  is_deload: boolean;
};

export async function PUT(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.session_id !== "string" || typeof body.is_deload !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    const res = await client.query<{ plan_session_id: string; is_deload: boolean }>(
      `update plan_sessions
       set is_deload = $1
       where plan_session_id = $2 and user_id = $3
         and performed_at is null
       returning plan_session_id, is_deload`,
      [body.is_deload, body.session_id, userId]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ error: "session_not_found_or_already_performed" }, { status: 404 });
    }

    return NextResponse.json({ session: res.rows[0] });
  } finally {
    client.release();
  }
}
