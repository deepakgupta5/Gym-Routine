import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

const PUBLIC_PATHS = ["/_next/", "/favicon.ico", "/unlock", "/api/auth/"];
const COOKIE_NAME = "paifpe_session";

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

async function verifySessionCookieEdge(req: NextRequest) {
  const value = req.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [raw, sig] = value.split(".");
  if (!raw || !sig) return null;

  const expected = await hmacEdge(raw, CONFIG.COOKIE_SIGNING_SECRET || "");
  if (expected !== sig) return null;

  try {
    const payload = base64UrlToJson(raw);
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (!payload.unlocked) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin/")) {
    const adminSecret = req.headers.get("x-admin-secret");
    if (adminSecret && adminSecret === CONFIG.ADMIN_SECRET) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const session = await verifySessionCookieEdge(req);
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const nextParam = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/unlock?next=${nextParam}`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
