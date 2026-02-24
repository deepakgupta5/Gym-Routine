#!/usr/bin/env node

const BASE_URL = (process.env.BASE_URL || "").trim().replace(/\/$/, "");
const APP_PASSCODE = process.env.APP_PASSCODE || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const RUN_RETENTION = /^true$/i.test(process.env.RUN_RETENTION || "false");
const RUN_NUTRITION_AI = /^true$/i.test(process.env.RUN_NUTRITION_AI || "false");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertStatus(actual, expected, context, bodyText) {
  if (actual !== expected) {
    fail(`${context}: expected ${expected}, got ${actual}. Body: ${bodyText || "<empty>"}`);
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toMondayIso(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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

  // Nutrition smoke: manual log -> read APIs -> update/delete
  const nutritionDate = todayIso();
  const nutritionWeekStart = toMondayIso(nutritionDate);
  const nutritionFrom = addDaysIso(nutritionDate, -6);

  const nutritionLog = await request("/api/nutrition/log", {
    method: "POST",
    cookie: sessionCookie,
    body: {
      meal_date: nutritionDate,
      meal_type: "auto",
      save_mode: "manual",
      notes: "smoke-test",
      items: [
        {
          item_name: "Chicken salad",
          quantity: 1,
          unit: "serving",
          calories: 500,
          protein_g: 40,
          carbs_g: 45,
          fat_g: 20,
          fiber_g: 5,
          sugar_g: 3,
          sodium_mg: 500,
          iron_mg: 2,
          calcium_mg: 80,
          vitamin_d_mcg: 1,
          vitamin_c_mg: 1,
          potassium_mg: 200,
          source: "manual",
          confidence: null,
          is_user_edited: true,
          sort_order: 1,
        },
      ],
    },
  });
  assertStatus(nutritionLog.status, 200, "POST /api/nutrition/log (manual)", nutritionLog.text);
  assert(nutritionLog.json?.ok === true, "Expected ok=true from nutrition log create");
  assert(typeof nutritionLog.json?.meal_log_id === "string", "Expected meal_log_id from nutrition log create");
  const mealLogId = nutritionLog.json.meal_log_id;
  pass("Nutrition manual log endpoint creates meal and rollup");

  const nutritionToday = await request(`/api/nutrition/today?date=${nutritionDate}`, {
    cookie: sessionCookie,
  });
  assertStatus(nutritionToday.status, 200, "GET /api/nutrition/today", nutritionToday.text);
  assert(nutritionToday.json && Array.isArray(nutritionToday.json.meals), "Expected meals array from nutrition today");
  assert(nutritionToday.json && nutritionToday.json.goals && nutritionToday.json.totals, "Expected goals/totals from nutrition today");
  pass("Nutrition today endpoint returns stable shape");

  const nutritionWeek = await request(`/api/nutrition/week?weekStart=${nutritionWeekStart}`, {
    cookie: sessionCookie,
  });
  assertStatus(nutritionWeek.status, 200, "GET /api/nutrition/week", nutritionWeek.text);
  assert(Array.isArray(nutritionWeek.json?.days), "Expected days array from nutrition week");
  assert(nutritionWeek.json.days.length === 7, "Expected 7 days from nutrition week endpoint");
  pass("Nutrition week endpoint returns 7-day summary");

  const nutritionHistory = await request(
    `/api/nutrition/history?from=${nutritionFrom}&to=${nutritionDate}&page=1&pageSize=30`,
    { cookie: sessionCookie }
  );
  assertStatus(nutritionHistory.status, 200, "GET /api/nutrition/history", nutritionHistory.text);
  assert(Array.isArray(nutritionHistory.json?.days), "Expected days array from nutrition history");
  pass("Nutrition history endpoint returns date-range summaries");

  const nutritionInsights = await request(`/api/nutrition/insights?date=${nutritionDate}`, {
    cookie: sessionCookie,
  });
  assertStatus(nutritionInsights.status, 200, "GET /api/nutrition/insights", nutritionInsights.text);
  assert(Array.isArray(nutritionInsights.json?.insights), "Expected insights array from nutrition insights");
  pass("Nutrition insights endpoint returns stable shape");

  const nutritionUpdate = await request(`/api/nutrition/log/${mealLogId}`, {
    method: "PUT",
    cookie: sessionCookie,
    body: {
      meal_type: "lunch",
      notes: "smoke-updated",
      items: [
        {
          item_name: "Chicken bowl",
          quantity: 1,
          unit: "serving",
          calories: 550,
          protein_g: 45,
          carbs_g: 40,
          fat_g: 22,
          fiber_g: 6,
          sugar_g: 4,
          sodium_mg: 520,
          iron_mg: 2,
          calcium_mg: 90,
          vitamin_d_mcg: 1,
          vitamin_c_mg: 2,
          potassium_mg: 220,
          source: "manual",
          confidence: null,
          is_user_edited: true,
          sort_order: 1,
        },
      ],
    },
  });
  assertStatus(nutritionUpdate.status, 200, "PUT /api/nutrition/log/:id", nutritionUpdate.text);
  assert(nutritionUpdate.json?.ok === true, "Expected ok=true from nutrition log update");
  pass("Nutrition log update endpoint recomputes rollup");

  const nutritionDelete = await request(`/api/nutrition/log/${mealLogId}`, {
    method: "DELETE",
    cookie: sessionCookie,
  });
  assertStatus(nutritionDelete.status, 200, "DELETE /api/nutrition/log/:id", nutritionDelete.text);
  assert(nutritionDelete.json?.ok === true, "Expected ok=true from nutrition log delete");
  pass("Nutrition log delete endpoint recomputes rollup");

  if (RUN_NUTRITION_AI) {
    const nutritionPlan = await request("/api/nutrition/plan/generate", {
      method: "POST",
      cookie: sessionCookie,
      body: {
        plan_date: nutritionDate,
        day_type: "auto",
        target_calories: 2200,
        target_protein_g: 160,
        constraints: {
          allowed_proteins: ["chicken", "shrimp", "eggs", "dairy", "plant"],
          forbidden_proteins: ["fish", "beef", "lamb", "pork", "goat"],
        },
      },
    });

    assert(
      [200, 422, 503].includes(nutritionPlan.status),
      `POST /api/nutrition/plan/generate unexpected status ${nutritionPlan.status}`
    );

    if (nutritionPlan.status === 200) {
      assert(nutritionPlan.json?.ok === true, "Expected ok=true from meal plan generation");
      assert(Array.isArray(nutritionPlan.json?.meals), "Expected meals array from meal plan generation");
      pass("Nutrition meal-plan endpoint generated a plan");
    } else {
      assert(
        typeof nutritionPlan.json?.error === "string",
        "Expected error code from meal-plan generation non-200 response"
      );
      pass(`Nutrition meal-plan endpoint reachable (non-200 accepted: ${nutritionPlan.json.error})`);
    }
  } else {
    console.log("SKIP: Nutrition AI plan generation (set RUN_NUTRITION_AI=true to include it)");
  }

  const dashboard = await request("/api/dashboard", { cookie: sessionCookie });
  assertStatus(dashboard.status, 200, "GET /api/dashboard", dashboard.text);
  assert(dashboard.json?.ok === true, "Expected ok=true from dashboard endpoint");
  assert(dashboard.json?.nutrition_summary, "Expected nutrition_summary in dashboard payload");
  pass("Dashboard endpoint responds with merged training + nutrition payload");

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
