import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError, logInfo } from "@/lib/logger";
import { callOpenAI } from "@/lib/ai/openai";
import { buildMealParseSystemPrompt, buildMealParseUserPrompt } from "@/lib/ai/prompts";
import { readParseP95Last7Days, recordParseMetric } from "@/lib/nutrition/parseMetrics";

export const dynamic = "force-dynamic";

const ALLOWED_PROTEINS = ["chicken", "shrimp", "eggs", "dairy", "plant"];
const PARSE_SLO_MS = 3000;
const LOW_CONFIDENCE_THRESHOLD = 0.3;

type ParsedFoodItem = {
  item_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  vitamin_d_mcg: number;
  vitamin_c_mg: number;
  potassium_mg: number;
  source: "ai";
  confidence: number;
  is_user_edited: boolean;
  sort_order: number;
};

type OpenAIParseResponse = {
  items?: Array<Partial<ParsedFoodItem>>;
  overall_confidence?: number;
};

function hasMeaningfulNutrition(item: ParsedFoodItem): boolean {
  return (
    item.calories > 0 ||
    item.protein_g > 0 ||
    item.carbs_g > 0 ||
    item.fat_g > 0 ||
    item.fiber_g > 0
  );
}

type ParseFailureDetail =
  | "ai_not_configured"
  | "openai_timeout"
  | "openai_auth_failed"
  | "openai_rate_limited"
  | "openai_model_unavailable"
  | "openai_request_failed"
  | "openai_empty_response"
  | "openai_response_invalid_json"
  | "parse_empty_items"
  | "parse_no_meaningful_nutrition"
  | "unknown_parse_failure";

function mapParseFailureDetail(err: unknown): ParseFailureDetail {
  if (err instanceof SyntaxError) {
    return "openai_response_invalid_json";
  }

  const message = err instanceof Error ? err.message : String(err ?? "");

  if (message === "openai_key_missing") return "ai_not_configured";
  if (message === "openai_timeout") return "openai_timeout";
  if (message === "openai_empty_response") return "openai_empty_response";

  if (message.startsWith("openai_request_failed:")) {
    const statusToken = message.split(":", 3)[1] ?? "";
    const status = Number(statusToken);

    if (status === 401 || status === 403) return "openai_auth_failed";
    if (status === 404) return "openai_model_unavailable";
    if (status === 429) return "openai_rate_limited";
    return "openai_request_failed";
  }

  return "unknown_parse_failure";
}


type OpenAIRetryResult = {
  rawJson: string;
  parseDurationMs: number;
  retriedAfterTimeout: boolean;
  modelUsed: "gpt-4o-mini" | "gpt-4o";
  usedModelFallback: boolean;
};

async function callOpenAIWithTimeoutRetry(params: {
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  responseFormat: "json_object";
  timeoutMs: number;
  retryTimeoutMs: number;
  modelFallbackTimeoutMs: number;
  userId: string;
}): Promise<OpenAIRetryResult> {
  function isTimeoutError(err: unknown): boolean {
    return err instanceof Error && err.message === "openai_timeout";
  }

  function isModelUnavailableError(err: unknown): boolean {
    return (
      err instanceof Error &&
      (err.message.startsWith("openai_request_failed:404:") ||
        err.message === "openai_model_unavailable")
    );
  }

  const firstStartedAt = Date.now();
  try {
    const rawJson = await callOpenAI({
      model: "gpt-4o-mini",
      systemPrompt: params.systemPrompt,
      userContent: params.userContent,
      maxTokens: params.maxTokens,
      responseFormat: params.responseFormat,
      timeoutMs: params.timeoutMs,
    });

    return {
      rawJson,
      parseDurationMs: Date.now() - firstStartedAt,
      retriedAfterTimeout: false,
      modelUsed: "gpt-4o-mini",
      usedModelFallback: false,
    };
  } catch (firstErr) {
    let lastErr: unknown = firstErr;

    if (isTimeoutError(firstErr)) {
      logInfo("nutrition_log_preview_timeout_retry", {
        user_id: params.userId,
        timeout_ms: params.timeoutMs,
        retry_timeout_ms: params.retryTimeoutMs,
      });

      const retryStartedAt = Date.now();
      try {
        const rawJson = await callOpenAI({
          model: "gpt-4o-mini",
          systemPrompt: params.systemPrompt,
          userContent: params.userContent,
          maxTokens: params.maxTokens,
          responseFormat: params.responseFormat,
          timeoutMs: params.retryTimeoutMs,
        });

        return {
          rawJson,
          parseDurationMs: Date.now() - retryStartedAt,
          retriedAfterTimeout: true,
          modelUsed: "gpt-4o-mini",
          usedModelFallback: false,
        };
      } catch (retryErr) {
        lastErr = retryErr;
      }
    }

    if (isModelUnavailableError(lastErr) || isTimeoutError(lastErr)) {
      logInfo("nutrition_log_preview_model_fallback", {
        user_id: params.userId,
        from_model: "gpt-4o-mini",
        to_model: "gpt-4o",
        reason: isModelUnavailableError(lastErr) ? "model_unavailable" : "timeout",
      });

      const fallbackStartedAt = Date.now();
      const rawJson = await callOpenAI({
        model: "gpt-4o",
        systemPrompt: params.systemPrompt,
        userContent: params.userContent,
        maxTokens: params.maxTokens,
        responseFormat: params.responseFormat,
        timeoutMs: params.modelFallbackTimeoutMs,
      });

      return {
        rawJson,
        parseDurationMs: Date.now() - fallbackStartedAt,
        retriedAfterTimeout: isTimeoutError(firstErr),
        modelUsed: "gpt-4o",
        usedModelFallback: true,
      };
    }

    throw lastErr;
  }
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const rawInput = typeof body.raw_input === "string" ? body.raw_input.trim() : "";
  if (!rawInput) {
    return NextResponse.json({ error: "missing_raw_input" }, { status: 400 });
  }

  if (!CONFIG.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "parse_failed_manual_required", detail: "ai_not_configured" },
      { status: 422 }
    );
  }

  const systemPrompt = buildMealParseSystemPrompt(ALLOWED_PROTEINS);
  const userPrompt = buildMealParseUserPrompt(rawInput);

  try {
    const { rawJson, parseDurationMs, retriedAfterTimeout, modelUsed, usedModelFallback } = await callOpenAIWithTimeoutRetry({
      systemPrompt,
      userContent: userPrompt,
      maxTokens: 900,
      responseFormat: "json_object",
      timeoutMs: 2500,
      retryTimeoutMs: 6000,
      modelFallbackTimeoutMs: 10000,
      userId,
    });

    const parsed = JSON.parse(rawJson) as OpenAIParseResponse;
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

    const items: ParsedFoodItem[] = rawItems.map((item, idx) => ({
      item_name: String(item.item_name ?? `Item ${idx + 1}`),
      quantity: Math.max(0, Number(item.quantity ?? 1)),
      unit: String(item.unit ?? "serving"),
      calories: Math.max(0, Number(item.calories ?? 0)),
      protein_g: Math.max(0, Number(item.protein_g ?? 0)),
      carbs_g: Math.max(0, Number(item.carbs_g ?? 0)),
      fat_g: Math.max(0, Number(item.fat_g ?? 0)),
      fiber_g: Math.max(0, Number(item.fiber_g ?? 0)),
      sugar_g: Math.max(0, Number(item.sugar_g ?? 0)),
      sodium_mg: Math.max(0, Number(item.sodium_mg ?? 0)),
      iron_mg: Math.max(0, Number(item.iron_mg ?? 0)),
      calcium_mg: Math.max(0, Number(item.calcium_mg ?? 0)),
      vitamin_d_mcg: Math.max(0, Number(item.vitamin_d_mcg ?? 0)),
      vitamin_c_mg: Math.max(0, Number(item.vitamin_c_mg ?? 0)),
      potassium_mg: Math.max(0, Number(item.potassium_mg ?? 0)),
      source: "ai",
      confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
      is_user_edited: false,
      sort_order: idx + 1,
    }));

    if (!items.length) {
      return NextResponse.json(
        { error: "parse_failed_manual_required", detail: "parse_empty_items" as ParseFailureDetail },
        { status: 422 }
      );
    }

    if (!items.some(hasMeaningfulNutrition)) {
      return NextResponse.json(
        { error: "parse_failed_manual_required", detail: "parse_no_meaningful_nutrition" as ParseFailureDetail },
        { status: 422 }
      );
    }

    const aiConfidence =
      items.reduce((sum, it) => sum + it.confidence, 0) / Math.max(1, items.length) ||
      Number(parsed?.overall_confidence ?? 0.8);

    const warnings: string[] = [];
    if (aiConfidence < LOW_CONFIDENCE_THRESHOLD) {
      warnings.push("low_confidence_parse");
    }
    if (retriedAfterTimeout) {
      warnings.push("parse_timeout_retried");
    }
    if (usedModelFallback) {
      warnings.push("parse_model_fallback_used");
    }
    if (parseDurationMs > PARSE_SLO_MS) {
      warnings.push("parse_slo_missed");
      logInfo("nutrition_parse_slo_missed", {
        user_id: userId,
        parse_duration_ms: parseDurationMs,
        endpoint: "log_preview",
      });
    }

    let parseP95Ms: number | null = null;
    try {
      const pool = await getDb();
      const client = await pool.connect();
      try {
        await recordParseMetric(client, userId, "log_preview", parseDurationMs);
        parseP95Ms = await readParseP95Last7Days(client, userId);
      } finally {
        client.release();
      }
    } catch (metricErr) {
      logInfo("nutrition_parse_metrics_unavailable", {
        user_id: userId,
        endpoint: "log_preview",
        error: metricErr instanceof Error ? metricErr.message : "unknown_error",
      });
    }

    return NextResponse.json({
      ok: true,
      input_mode: "text",
      ai_model: modelUsed,
      ai_confidence: Math.min(1, Math.max(0, aiConfidence)),
      parse_duration_ms: parseDurationMs,
      parse_slo_met: parseDurationMs <= PARSE_SLO_MS,
      parse_p95_7d_ms: parseP95Ms,
      items,
      warnings,
    });
  } catch (err) {
    const detail = mapParseFailureDetail(err);
    logError("nutrition_log_preview_failed", err, { user_id: userId, detail });
    return NextResponse.json({ error: "parse_failed_manual_required", detail }, { status: 422 });
  }
}
