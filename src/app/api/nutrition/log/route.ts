import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError, logInfo } from "@/lib/logger";
import { callOpenAI } from "@/lib/ai/openai";
import { buildMealParseSystemPrompt, buildMealParseUserPrompt } from "@/lib/ai/prompts";
import { ensureNutritionProfile } from "@/lib/nutrition/profile";
import { syncTrainingDay } from "@/lib/nutrition/syncTrainingDay";
import { recomputeDailyRollup } from "@/lib/nutrition/rollups";
import { readParseP95Last7Days, recordParseMetric } from "@/lib/nutrition/parseMetrics";
import type { MealItemInput } from "@/lib/nutrition/types";
import type { ParsedFoodItem } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const ALLOWED_PROTEINS = ["chicken", "shrimp", "eggs", "dairy", "plant"];
const FORBIDDEN_PROTEIN_REGEX = /\b(fish|beef|lamb|pork|goat)\b/i;
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const PARSE_SLO_MS = 3000;
const LOW_CONFIDENCE_THRESHOLD = 0.3;
type MealType = (typeof VALID_MEAL_TYPES)[number];

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function containsForbiddenProtein(text: string | null | undefined): boolean {
  if (!text) return false;
  return FORBIDDEN_PROTEIN_REGEX.test(text);
}

function hasForbiddenProteinInItems(items: Array<{ item_name: string }>): boolean {
  return items.some((item) => containsForbiddenProtein(item.item_name));
}

function resolveAutoHour(clientTzOffsetMin: number | null): number {
  const now = new Date();
  if (clientTzOffsetMin == null) return now.getUTCHours();

  const utcTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localMinutes = ((utcTotalMinutes - clientTzOffsetMin) % 1440 + 1440) % 1440;
  return Math.floor(localMinutes / 60);
}

function resolveMealType(raw: string, clientTzOffsetMin: number | null): MealType {
  if ((VALID_MEAL_TYPES as readonly string[]).includes(raw)) return raw as MealType;

  const hour = resolveAutoHour(clientTzOffsetMin);
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
}

function validateItemFields(item: Partial<MealItemInput>): boolean {
  const numericFields: Array<keyof MealItemInput> = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
    "sugar_g", "sodium_mg", "iron_mg", "calcium_mg",
    "vitamin_d_mcg", "vitamin_c_mg", "potassium_mg",
    "quantity", "sort_order",
  ];

  for (const f of numericFields) {
    const v = Number(item[f]);
    if (!Number.isFinite(v) || v < 0) return false;
  }

  if (!item.item_name || typeof item.item_name !== "string") return false;
  if (!["ai", "manual"].includes(item.source as string)) return false;
  return true;
}

function hasMeaningfulNutrition(item: ParsedFoodItem): boolean {
  return (
    item.calories > 0 ||
    item.protein_g > 0 ||
    item.carbs_g > 0 ||
    item.fat_g > 0 ||
    item.fiber_g > 0
  );
}

function parsedItemsUsable(items: ParsedFoodItem[]): boolean {
  return items.length > 0 && items.some(hasMeaningfulNutrition);
}

type OpenAIParseResponse = {
  items?: Array<Partial<ParsedFoodItem>>;
  overall_confidence?: number;
};

async function parseMealText(
  rawInput: string
): Promise<{ items: ParsedFoodItem[]; confidence: number; model: string }> {
  const systemPrompt = buildMealParseSystemPrompt(ALLOWED_PROTEINS);
  const userPrompt = buildMealParseUserPrompt(rawInput);

  const rawJson = await callOpenAI({
    model: "gpt-4o-mini",
    systemPrompt,
    userContent: userPrompt,
    maxTokens: 2048,
    responseFormat: "json_object",
    timeoutMs: 2500,
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
    confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
  }));

  const overallConfidence =
    items.length > 0
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : Number(parsed?.overall_confidence ?? 0.8);

  return { items, confidence: Math.min(1, Math.max(0, overallConfidence)), model: "gpt-4o-mini" };
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const mealDate = typeof body.meal_date === "string" ? body.meal_date : "";
  if (!mealDate || !isIsoDate(mealDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  let clientTzOffsetMin: number | null = null;
  if (body.client_tz_offset_min != null) {
    const offset = Number(body.client_tz_offset_min);
    if (!Number.isInteger(offset) || offset < -720 || offset > 840) {
      return NextResponse.json({ error: "invalid_timezone_offset" }, { status: 400 });
    }
    clientTzOffsetMin = offset;
  }

  const rawMealType = typeof body.meal_type === "string" ? body.meal_type : "";
  const allowedMealTypeValues = [...VALID_MEAL_TYPES, "auto"];
  if (!rawMealType || !allowedMealTypeValues.includes(rawMealType)) {
    return NextResponse.json({ error: "invalid_meal_type" }, { status: 400 });
  }
  const mealType = resolveMealType(rawMealType, clientTzOffsetMin);

  const saveMode = body.save_mode;
  if (saveMode !== "ai_parse" && saveMode !== "manual" && saveMode !== "ai_reviewed") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userItems: MealItemInput[] = Array.isArray(body.items)
    ? (body.items as MealItemInput[])
    : [];

  let aiItems: ParsedFoodItem[] = [];
  let aiConfidence: number | null = null;
  let aiModel: string | null = null;
  let parseDurationMs: number | null = null;
  const warnings: string[] = [];
  let inputMode: "text" | "photo" | "text_photo" | "manual" = "manual";
  const RAW_INPUT_MAX_CHARS = 2000;
  const rawInputRaw = typeof body.raw_input === "string" ? body.raw_input.trim() : null;
  if (rawInputRaw && rawInputRaw.length > RAW_INPUT_MAX_CHARS) {
    return NextResponse.json(
      { error: "raw_input_too_long", detail: `max ${RAW_INPUT_MAX_CHARS} characters` },
      { status: 400 }
    );
  }
  const rawInput = rawInputRaw;

  if (saveMode === "ai_parse") {
    if (!rawInput) {
      return NextResponse.json({ error: "missing_raw_input" }, { status: 400 });
    }

    for (const item of userItems) {
      if (!validateItemFields(item)) {
        return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
      }
    }

    if (!CONFIG.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "parse_failed_manual_required", detail: "ai_not_configured" },
        { status: 422 }
      );
    }

    try {
      const startedAt = Date.now();
      const parsed = await parseMealText(rawInput);
      parseDurationMs = Date.now() - startedAt;

      if (!parsedItemsUsable(parsed.items)) {
        return NextResponse.json({ error: "parse_failed_manual_required" }, { status: 422 });
      }

      aiItems = parsed.items;
      aiConfidence = parsed.confidence;
      aiModel = parsed.model;
      inputMode = "text";

      if (aiConfidence < LOW_CONFIDENCE_THRESHOLD) {
        warnings.push("low_confidence_parse");
      }

      if (parseDurationMs > PARSE_SLO_MS) {
        warnings.push("parse_slo_missed");
        logInfo("nutrition_parse_slo_missed", {
          user_id: userId,
          parse_duration_ms: parseDurationMs,
        });
      }
    } catch {
      return NextResponse.json({ error: "parse_failed_manual_required" }, { status: 422 });
    }
  } else if (saveMode === "ai_reviewed") {
    if (userItems.length === 0) {
      return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
    }

    for (const item of userItems) {
      if (!validateItemFields(item)) {
        return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
      }
    }

    const inputModeHint = body.input_mode_hint === "photo" ? "photo" : "text";
    inputMode = inputModeHint;

    if (inputModeHint === "text" && !rawInput) {
      return NextResponse.json({ error: "missing_raw_input" }, { status: 400 });
    }

    const ALLOWED_AI_MODELS = ["gpt-4o", "gpt-4o-mini"];
    const requestedModel = typeof body.ai_model === "string" ? body.ai_model : null;
    aiModel =
      requestedModel && ALLOWED_AI_MODELS.includes(requestedModel)
        ? requestedModel
        : inputModeHint === "photo"
          ? "gpt-4o"
          : "gpt-4o-mini";

    const bodyConfidence = Number(body.ai_confidence);
    if (Number.isFinite(bodyConfidence)) {
      aiConfidence = Math.min(1, Math.max(0, bodyConfidence));
    } else {
      const confidences = userItems
        .map((item) => (item.source === "ai" ? Number(item.confidence ?? 0) : null))
        .filter((c): c is number => c !== null && Number.isFinite(c));

      aiConfidence = confidences.length
        ? confidences.reduce((sum, v) => sum + v, 0) / confidences.length
        : null;
    }

    const bodyParseDuration = Number(body.parse_duration_ms);
    if (Number.isFinite(bodyParseDuration) && bodyParseDuration >= 0) {
      parseDurationMs = Math.round(bodyParseDuration);
    }

    if (Array.isArray(body.warnings)) {
      for (const w of body.warnings) {
        if (typeof w === "string") warnings.push(w);
      }
    }
  } else {
    if (userItems.length === 0) {
      return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
    }
    for (const item of userItems) {
      if (!validateItemFields(item)) {
        return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
      }
    }
  }

  const allAiItems: MealItemInput[] = aiItems.map((item, idx) => ({
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
    source: "ai",
    confidence: item.confidence,
    is_user_edited: false,
    sort_order: idx + 1,
  }));

  const allItems: MealItemInput[] = [
    ...allAiItems,
    ...userItems.map((item, idx) => ({
      ...item,
      sort_order: allAiItems.length + idx + 1,
    })),
  ];

  if (containsForbiddenProtein(rawInput) || hasForbiddenProteinInItems(allItems)) {
    return NextResponse.json({ error: "forbidden_protein_in_meal_log" }, { status: 422 });
  }

  const pool = await getDb();
  const client = await pool.connect();
  let parseP95Ms: number | null = null;
  try {
    await client.query("BEGIN");

    await ensureNutritionProfile(client, userId);
    await syncTrainingDay(client, userId, mealDate);

    if (saveMode === "ai_parse" && parseDurationMs != null) {
      await recordParseMetric(client, userId, "log", parseDurationMs);
      parseP95Ms = await readParseP95Last7Days(client, userId);
    }

    const logRes = await client.query<{ meal_log_id: string }>(
      `INSERT INTO meal_logs
         (user_id, meal_date, meal_type, raw_input, input_mode, ai_model, ai_confidence, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING meal_log_id`,
      [
        userId,
        mealDate,
        mealType,
        rawInput ?? null,
        inputMode,
        aiModel,
        aiConfidence,
        typeof body.notes === "string" ? body.notes : null,
      ]
    );
    const mealLogId = logRes.rows[0].meal_log_id;

    for (const item of allItems) {
      await client.query(
        `INSERT INTO meal_items
           (meal_log_id, item_name, quantity, unit,
            calories, protein_g, carbs_g, fat_g, fiber_g,
            sugar_g, sodium_mg, iron_mg, calcium_mg,
            vitamin_d_mcg, vitamin_c_mg, potassium_mg,
            source, confidence, is_user_edited, sort_order)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          mealLogId,
          item.item_name,
          item.quantity,
          item.unit,
          item.calories,
          item.protein_g,
          item.carbs_g,
          item.fat_g,
          item.fiber_g,
          item.sugar_g,
          item.sodium_mg,
          item.iron_mg,
          item.calcium_mg,
          item.vitamin_d_mcg,
          item.vitamin_c_mg,
          item.potassium_mg,
          item.source,
          item.confidence ?? null,
          item.is_user_edited,
          item.sort_order,
        ]
      );
    }

    const rollup = await recomputeDailyRollup(client, userId, mealDate);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      meal_log_id: mealLogId,
      meal_type_resolved: mealType,
      input_mode: inputMode,
      ai_model: aiModel,
      ai_confidence: aiConfidence,
      parse_duration_ms: parseDurationMs,
      parse_slo_met: parseDurationMs == null ? null : parseDurationMs <= PARSE_SLO_MS,
      parse_p95_7d_ms: parseP95Ms,
      items_saved: allItems.length,
      warnings,
      rollup,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_log_save_failed", err, { user_id: userId });
    return NextResponse.json({ error: "nutrition_log_save_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
