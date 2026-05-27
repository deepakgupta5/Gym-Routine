import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";
import { logInfo } from "@/lib/logger";

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
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/admin/")) {
    const adminSecret = req.headers.get("x-admin-secret");
    const expected = CONFIG.ADMIN_SECRET || "";
    // Constant-time comparison to prevent timing-based secret brute-force.
    const provided = adminSecret || "";
    const enc = new TextEncoder();
    const expectedBytes = enc.encode(expected);
    const providedBytes = enc.encode(provided);
    let mismatch = expectedBytes.length ^ providedBytes.length;
    const max = Math.max(expectedBytes.length, providedBytes.length);
    for (let i = 0; i < max; i++) {
      mismatch |= (expectedBytes[i] ?? 0) ^ (providedBytes[i] ?? 0);
    }
    if (mismatch === 0 && expected.length > 0) {
      return finalize(req, startMs, NextResponse.next());
    }

    return finalize(
      req,
      startMs,
      NextResponse.json({ error: "unauthorized" }, { status: 401 })
    );
  }

  return finalize(req, startMs, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
