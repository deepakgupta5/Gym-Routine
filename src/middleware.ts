import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";
import { logInfo } from "@/lib/logger";

const PUBLIC_PATHS = [
  "/_next/",
  "/favicon.ico",
  "/apple-icon.png",
  "/icon.png",
  "/unlock",
  "/api/auth/",
  "/api/debug/",
  "/manifest.json",
  "/manifest.webmanifest",
  "/robots.txt",
  "/icons/",
  "/exercises/",
];

const COOKIE_NAME = "paifpe_session";
const HEX_RE = /^[0-9a-f]+$/i;

function base64UrlToJson(raw: string) {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLength);
  const json = atob(b64);
  return JSON.parse(json);
}

async function hmacEdge(value: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Edge runtime lacks crypto.timingSafeEqual. HMAC verify is duplicated for Edge here,
// while Node runtime verification lives in src/lib/auth/cookies.ts.
function constantTimeEqualHex(expected: string, provided: string) {
  if (
    !HEX_RE.test(expected) ||
    !HEX_RE.test(provided) ||
    expected.length % 2 !== 0 ||
    provided.length % 2 !== 0
  ) {
    return false;
  }

  let mismatch = expected.length ^ provided.length;
  const max = Math.max(expected.length, provided.length);

  for (let i = 0; i < max; i++) {
    const a = i < expected.length ? expected.charCodeAt(i) : 0;
    const b = i < provided.length ? provided.charCodeAt(i) : 0;
    mismatch |= a ^ b;
  }

  return mismatch === 0;
}

async function verifySessionCookieEdge(req: NextRequest) {
  const value = req.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [raw, sig] = value.split(".");
  if (!raw || !sig) return null;

  const expected = await hmacEdge(raw, CONFIG.COOKIE_SIGNING_SECRET || "");
  if (!constantTimeEqualHex(expected, sig)) return null;

  try {
    const payload = base64UrlToJson(raw);
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (!payload.unlocked) return null;
    return payload;
  } catch {
    return null;
  }
}

function finalize(req: NextRequest, startMs: number, res: NextResponse) {
  if (!req.nextUrl.pathname.startsWith("/api")) {
    return res;
  }

  const durationMs = Date.now() - startMs;
  res.headers.set("X-Response-Time", `${durationMs}ms`);

  logInfo("api_response_time", {
    method: req.method,
    path: req.nextUrl.pathname,
    status: res.status,
    duration_ms: durationMs,
  });

  return res;
}

export async function middleware(req: NextRequest) {
  const startMs = Date.now();
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return finalize(req, startMs, NextResponse.next());
  }

  if (pathname.startsWith("/api/admin/")) {
    const adminSecret = req.headers.get("x-admin-secret");
    if (adminSecret && adminSecret === CONFIG.ADMIN_SECRET) {
      return finalize(req, startMs, NextResponse.next());
    }

    return finalize(
      req,
      startMs,
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    );
  }

  const session = await verifySessionCookieEdge(req);
  if (!session) {
    if (pathname.startsWith("/api")) {
      return finalize(
        req,
        startMs,
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
      );
    }

    const nextParam = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/unlock?next=${nextParam}`, req.url));
  }

  return finalize(req, startMs, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
