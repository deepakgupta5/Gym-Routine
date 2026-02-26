// PRIVACY CONTRACT (non-negotiable):
// - export const dynamic = "force-dynamic" MUST remain at the top
// - Do NOT log request body, form data, or any image variable
// - Log only: event name, error code, user_id
// - This route returns parsed items ONLY — writes nothing to DB

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError, logInfo } from "@/lib/logger";
import { parsePhotoMeal } from "@/lib/nutrition/photoParse";
import { readParseP95Last7Days, recordParseMetric } from "@/lib/nutrition/parseMetrics";
import { nutritionRateLimit } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "auto"] as const;
const PARSE_SLO_MS = 3000;
const LOW_CONFIDENCE_THRESHOLD = 0.3;

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function hasMeaningfulNutrition(item: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }): boolean {
  return item.calories > 0 || item.protein_g > 0 || item.carbs_g > 0 || item.fat_g > 0 || item.fiber_g > 0;
}


type PhotoParseFailureDetail =
  | "ai_not_configured"
  | "openai_timeout"
  | "openai_auth_failed"
  | "openai_rate_limited"
  | "openai_model_unavailable"
  | "openai_request_failed"
  | "photo_parse_invalid_json"
  | "unknown_photo_parse_failure";

type PhotoParseCallResult = {
  result: Awaited<ReturnType<typeof parsePhotoMeal>>;
  parseDurationMs: number;
  retriedAfterTimeout: boolean;
  usedModelFallback: boolean;
};

function mapPhotoParseFailureDetail(err: unknown): PhotoParseFailureDetail {
  if (err instanceof SyntaxError) return "photo_parse_invalid_json";

  const message = err instanceof Error ? err.message : String(err ?? "");

  if (message === "openai_key_missing") return "ai_not_configured";
  if (message === "openai_timeout") return "openai_timeout";
  if (message === "photo_parse_invalid_json") return "photo_parse_invalid_json";

  if (message.startsWith("openai_request_failed:")) {
    const statusToken = message.split(":", 3)[1] ?? "";
    const status = Number(statusToken);

    if (status === 401 || status === 403) return "openai_auth_failed";
    if (status === 404) return "openai_model_unavailable";
    if (status === 429) return "openai_rate_limited";
    return "openai_request_failed";
  }

  return "unknown_photo_parse_failure";
}

async function parsePhotoMealWithRetry(imageBuffer: Buffer, userId: string): Promise<PhotoParseCallResult> {
  const firstStartedAt = Date.now();
  try {
    const result = await parsePhotoMeal(imageBuffer, {
      model: "gpt-4o",
      timeoutMs: 4500,
      maxTokens: 900,
      imageDetail: "low",
    });

    return {
      result,
      parseDurationMs: Date.now() - firstStartedAt,
      retriedAfterTimeout: false,
      usedModelFallback: false,
    };
  } catch (firstErr) {
    const firstDetail = mapPhotoParseFailureDetail(firstErr);
    let lastErr: unknown = firstErr;

    if (firstDetail === "openai_timeout") {
      logInfo("nutrition_photo_parse_timeout_retry", {
        user_id: userId,
        timeout_ms: 4500,
        retry_timeout_ms: 10000,
      });

      const retryStartedAt = Date.now();
      try {
        const result = await parsePhotoMeal(imageBuffer, {
          model: "gpt-4o",
          timeoutMs: 10000,
          maxTokens: 900,
          imageDetail: "low",
        });

        return {
          result,
          parseDurationMs: Date.now() - retryStartedAt,
          retriedAfterTimeout: true,
          usedModelFallback: false,
        };
      } catch (retryErr) {
        lastErr = retryErr;
      }
    }

    const lastDetail = mapPhotoParseFailureDetail(lastErr);
    if (lastDetail === "openai_timeout" || lastDetail === "openai_model_unavailable") {
      logInfo("nutrition_photo_parse_model_fallback", {
        user_id: userId,
        from_model: "gpt-4o",
        to_model: "gpt-4o-mini",
        reason: lastDetail,
      });

      const fallbackStartedAt = Date.now();
      const result = await parsePhotoMeal(imageBuffer, {
        model: "gpt-4o-mini",
        timeoutMs: 10000,
        maxTokens: 900,
        imageDetail: "low",
      });

      return {
        result,
        parseDurationMs: Date.now() - fallbackStartedAt,
        retriedAfterTimeout: firstDetail === "openai_timeout",
        usedModelFallback: true,
      };
    }

    throw lastErr;
  }
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = nutritionRateLimit(`log-photo:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Validate photo field
  const photoField = formData.get("photo");
  if (!photoField || !(photoField instanceof File)) {
    return NextResponse.json({ error: "photo_missing" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.includes(photoField.type)) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  if (photoField.size > MAX_BYTES) {
    return NextResponse.json({ error: "photo_too_large" }, { status: 413 });
  }

  // Validate optional fields (meal_date, meal_type)
  const mealDateRaw = formData.get("meal_date");
  if (mealDateRaw !== null) {
    const mealDateStr = String(mealDateRaw);
    if (!isIsoDate(mealDateStr)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
  }

  const mealTypeRaw = formData.get("meal_type");
  if (mealTypeRaw !== null && !(VALID_MEAL_TYPES as readonly string[]).includes(String(mealTypeRaw))) {
    return NextResponse.json({ error: "invalid_meal_type" }, { status: 400 });
  }

  if (!CONFIG.OPENAI_API_KEY) {
    return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
  }

  // Convert photo to Buffer — imageBase64 is created INSIDE parsePhotoMeal only
  let imageBuffer: Buffer;
  try {
    const arrayBuffer = await photoField.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch {
    // Log only event + user_id — never log image bytes
    logError("photo_read_failed", new Error("arrayBuffer failed"), { user_id: userId });
    return NextResponse.json({ error: "image_unreadable" }, { status: 422 });
  }

  let result: Awaited<ReturnType<typeof parsePhotoMeal>>;
  let parseDurationMs: number | null = null;
  let retriedAfterTimeout = false;
  let usedModelFallback = false;
  try {
    const parsed = await parsePhotoMealWithRetry(imageBuffer, userId);
    result = parsed.result;
    parseDurationMs = parsed.parseDurationMs;
    retriedAfterTimeout = parsed.retriedAfterTimeout;
    usedModelFallback = parsed.usedModelFallback;
  } catch (err) {
    const detail = mapPhotoParseFailureDetail(err);
    logError("photo_parse_failed", err, { user_id: userId, detail });

    if (detail === "ai_not_configured") {
      return NextResponse.json({ error: "openai_unavailable", detail }, { status: 503 });
    }

    if (
      detail === "openai_auth_failed" ||
      detail === "openai_rate_limited" ||
      detail === "openai_model_unavailable" ||
      detail === "openai_request_failed"
    ) {
      return NextResponse.json({ error: "openai_unavailable", detail }, { status: 503 });
    }

    return NextResponse.json({ error: "parse_failed", detail }, { status: 422 });
  }

  if (!result.items || result.items.length === 0 || !result.items.some(hasMeaningfulNutrition)) {
    return NextResponse.json({ error: "parse_failed", detail: "parse_no_meaningful_nutrition" }, { status: 422 });
  }

  const warnings: string[] = [];
  if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push("low_confidence_parse");
  }
  if (retriedAfterTimeout) {
    warnings.push("parse_timeout_retried");
  }
  if (usedModelFallback) {
    warnings.push("parse_model_fallback_used");
  }
  if (parseDurationMs != null && parseDurationMs > PARSE_SLO_MS) {
    warnings.push("parse_slo_missed");
    logInfo("nutrition_photo_parse_slo_missed", {
      user_id: userId,
      parse_duration_ms: parseDurationMs,
    });
  }

  let parseP95Ms: number | null = null;
  if (parseDurationMs != null) {
    try {
      const pool = await getDb();
      const client = await pool.connect();
      try {
        await recordParseMetric(client, userId, "log_photo", parseDurationMs);
        parseP95Ms = await readParseP95Last7Days(client, userId);
      } finally {
        client.release();
      }
    } catch (metricErr) {
      logInfo("nutrition_parse_metrics_unavailable", {
        user_id: userId,
        endpoint: "log_photo",
        error: metricErr instanceof Error ? metricErr.message : "unknown_error",
      });
    }
  }

  // Return parsed items only — zero image data in response
  return NextResponse.json({
    ok: true,
    input_mode: "photo",
    ai_model: result.model,
    ai_confidence: result.confidence,
    parse_duration_ms: parseDurationMs,
    parse_slo_met: parseDurationMs == null ? null : parseDurationMs <= PARSE_SLO_MS,
    parse_p95_7d_ms: parseP95Ms,
    items: result.items.map((item, idx) => ({
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      iron_mg: item.iron_mg,
      calcium_mg: item.calcium_mg,
      vitamin_d_mcg: item.vitamin_d_mcg,
      vitamin_c_mg: item.vitamin_c_mg,
      potassium_mg: item.potassium_mg,
      source: "ai" as const,
      confidence: item.confidence,
      is_user_edited: false,
      sort_order: idx + 1,
    })),
    warnings,
  });
}
