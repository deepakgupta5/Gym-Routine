import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { CONFIG } from "@/lib/config";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth/cookies";

export async function POST(req: NextRequest) {
  const { passcode } = await req.json().catch(() => ({}));

  if (!passcode || typeof passcode !== "string") {
    return NextResponse.json({ error: "invalid_passcode" }, { status: 400 });
  }

  const ok = await bcrypt.compare(passcode, CONFIG.APP_PASSCODE_HASH || "");
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = {
    unlocked: true as const,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(payload.exp),
  });

  return res;
}
