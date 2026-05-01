import { NextResponse } from "next/server";

const BOT_TOKEN = "8344058040:AAEAcaKNzmbygKqNnLEBEl7vT2OY3TMgre4";
const CHAT_ID = "6481884643";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { msg?: string } | null;
  const msg = body?.msg ?? "(empty)";

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: `[SKIP DEBUG] ${msg}` }),
    });
  } catch (_) { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
