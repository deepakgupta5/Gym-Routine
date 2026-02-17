import crypto from "crypto";
import { NextRequest } from "next/server";
import { CONFIG } from "@/lib/config";

const COOKIE_NAME = "paifpe_session";

// Node runtime HMAC verification lives here; Edge runtime verification is duplicated in
// src/middleware.ts because Edge lacks Node crypto APIs like timingSafeEqual.
const HMAC_HEX_RE = /^[0-9a-f]{64}$/i;

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

function constantTimeEqualHex(expectedHex: string, providedHex: string) {
  if (!HMAC_HEX_RE.test(expectedHex) || !HMAC_HEX_RE.test(providedHex)) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");

  if (expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
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

  const expected = hmac(raw);
  if (!constantTimeEqualHex(expected, sig)) return null;

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
