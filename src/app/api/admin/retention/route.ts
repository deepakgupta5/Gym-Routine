import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  requireConfig();
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== CONFIG.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    const res = await client.query(
      `delete from set_logs
       where performed_at < now() - interval '12 months'
       returning id`
    );

    return NextResponse.json({ ok: true, deleted: res.rowCount });
  } finally {
    client.release();
  }
}
