import crypto from "crypto";
import { NextRequest } from "next/server";
import { CONFIG } from "@/lib/config";

const COOKIE_NAME = "paifpe_session";

type SessionPayload = {
  unlocked: true;
  exp: number;
};

function hmac(value: string) {
  return crypto
    .createHmac("sha256", CONFIG.COOKIE_SIGNING_SECRET)
    .update(value)
    .digest("hex");
}

export function signSession(payload: SessionPayload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(raw);
  return `${raw}.${sig}`;
}

export function verifySessionCookie(req: NextRequest): SessionPayload | null {
  const value = req.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [raw, sig] = value.split(".");
  if (!raw || !sig) return null;
  if (hmac(raw) !== sig) return null;

  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (!payload.unlocked) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
