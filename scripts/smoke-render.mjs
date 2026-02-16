#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || "").trim().replace(/\/$/, "");
const APP_PASSCODE = process.env.APP_PASSCODE || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const RUN_RETENTION = /^true$/i.test(process.env.RUN_RETENTION || "false");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

if (!BASE_URL) {
  fail("Missing BASE_URL. Example: BASE_URL=https://your-app.onrender.com npm run smoke:render");
}

if (!APP_PASSCODE) {
  fail("Missing APP_PASSCODE (plain unlock code used for /api/auth/unlock)");
}

if (!ADMIN_SECRET) {
  fail("Missing ADMIN_SECRET (used for /api/admin/health and optional retention)");
}

async function request(path, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    cookie,
    redirect = "follow",
  } = options;

  const reqHeaders = { ...headers };
  let payload;

  if (cookie) {
    reqHeaders.cookie = cookie;
  }

  if (body !== undefined) {
    reqHeaders["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: payload,
    redirect,
  });

  const text = await res.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { status: res.status, headers: res.headers, text, json };
}

function assertStatus(actual, expected, context, bodyText) {
  if (actual !== expected) {
    fail(`${context}: expected ${expected}, got ${actual}. Body: ${bodyText || "<empty>"}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

(async () => {
  const home = await request("/", { redirect: "manual" });
  assert([307, 308].includes(home.status), "Expected / to redirect before unlock");
  const homeLocation = home.headers.get("location") || "";
  assert(homeLocation.includes("/unlock"), `Expected redirect to /unlock, got location=${homeLocation}`);
  pass("Unauthenticated / redirects to /unlock");

  const blocked = await request("/api/plan/today");
  assertStatus(blocked.status, 401, "GET /api/plan/today without cookie", blocked.text);
  assert(blocked.json?.error === "unauthorized", "Expected unauthorized error from protected API");
  pass("Protected API is locked before session unlock");

  const unlock = await request("/api/auth/unlock", {
    method: "POST",
    body: { passcode: APP_PASSCODE },
  });
  assertStatus(unlock.status, 200, "POST /api/auth/unlock", unlock.text);
  assert(unlock.json?.ok === true, "Expected { ok: true } from unlock endpoint");

  const setCookie = unlock.headers.get("set-cookie") || "";
  const match = setCookie.match(/paifpe_session=[^;]+/);
  assert(Boolean(match), "Unlock response did not set paifpe_session cookie");
  const sessionCookie = match[0];
  pass("Unlock endpoint issued valid session cookie");

  const initFirst = await request("/api/plan/init", {
    method: "POST",
    cookie: sessionCookie,
  });
  assertStatus(initFirst.status, 200, "POST /api/plan/init (first)", initFirst.text);
  assert(initFirst.json?.initialized === true, "Expected initialized=true on first init call");

  const initSecond = await request("/api/plan/init", {
    method: "POST",
    cookie: sessionCookie,
  });
  assertStatus(initSecond.status, 200, "POST /api/plan/init (second)", initSecond.text);
  assert(initSecond.json?.initialized === true, "Expected initialized=true on second init call");
  pass("Plan init endpoint is idempotent across repeated calls");

  const today = await request("/api/plan/today", { cookie: sessionCookie });
  assertStatus(today.status, 200, "GET /api/plan/today", today.text);
  assert(today.json && "session" in today.json && "exercises" in today.json, "Expected session/exercises payload from /api/plan/today");
  pass("Today endpoint returns structured payload");

  const week = await request("/api/plan/week", { cookie: sessionCookie });
  assertStatus(week.status, 200, "GET /api/plan/week", week.text);
  assert(week.json && Array.isArray(week.json.sessions) && Array.isArray(week.json.exercises), "Expected sessions/exercises arrays from /api/plan/week");
  pass("Week endpoint returns session and exercise arrays");

  const dashboard = await request("/api/dashboard", { cookie: sessionCookie });
  assertStatus(dashboard.status, 200, "GET /api/dashboard", dashboard.text);
  assert(dashboard.json?.ok === true, "Expected ok=true from dashboard endpoint");
  pass("Dashboard endpoint responds with adaptive and rollup payload");

  const health = await request("/api/admin/health", {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  assertStatus(health.status, 200, "GET /api/admin/health", health.text);
  assert(health.json?.ok === true, "Expected ok=true from admin health");
  assert(typeof health.json?.plan_sessions_current_block === "number", "Expected plan_sessions_current_block in admin health payload");
  assert(typeof health.json?.plan_exercises_current_block === "number", "Expected plan_exercises_current_block in admin health payload");
  pass("Admin health endpoint returns total and current-block counts");

  if (RUN_RETENTION) {
    const retention = await request("/api/admin/retention", {
      method: "POST",
      headers: { "x-admin-secret": ADMIN_SECRET },
    });
    assertStatus(retention.status, 200, "POST /api/admin/retention", retention.text);
    assert(retention.json?.ok === true, "Expected ok=true from retention endpoint");
    assert(typeof retention.json?.deleted === "number", "Expected numeric deleted count from retention endpoint");
    pass(`Retention endpoint ran successfully (deleted=${retention.json.deleted})`);
  } else {
    console.log("SKIP: Retention endpoint (set RUN_RETENTION=true to include it)");
  }

  console.log("Smoke test completed successfully.");
})().catch((err) => {
  fail(err?.stack || String(err));
});
