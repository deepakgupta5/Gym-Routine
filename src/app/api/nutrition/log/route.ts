import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { callOpenAI } from "@/lib/ai/openai";
import { buildMealParseSystemPrompt, buildMealParseUserPrompt } from "@/lib/ai/prompts";
import { ensureNutritionProfile } from "@/lib/nutrition/profile";
import { syncTrainingDay } from "@/lib/nutrition/syncTrainingDay";
import { recomputeDailyRollup } from "@/lib/nutrition/rollups";
import type { MealItemInput } from "@/lib/nutrition/types";
import type { ParsedFoodItem } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const ALLOWED_PROTEINS = ["chicken", "shrimp", "eggs", "dairy", "plant"];
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof VALID_MEAL_TYPES)[number];

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function resolveMealType(raw: string): MealType {
  if ((VALID_MEAL_TYPES as readonly string[]).includes(raw)) return raw as MealType;
  // "auto" — derive from server UTC hour
  const hour = new Date().getUTCHours();
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
  });

  const parsed = JSON.parse(rawJson) as OpenAIParseResponse;
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: ParsedFoodItem[] = rawItems.map((item, idx) => ({
    item_name:     String(item.item_name ?? `Item ${idx + 1}`),
    quantity:      Math.max(0, Number(item.quantity ?? 1)),
    unit:          String(item.unit ?? "serving"),
    calories:      Math.max(0, Number(item.calories ?? 0)),
    protein_g:     Math.max(0, Number(item.protein_g ?? 0)),
    carbs_g:       Math.max(0, Number(item.carbs_g ?? 0)),
    fat_g:         Math.max(0, Number(item.fat_g ?? 0)),
    fiber_g:       Math.max(0, Number(item.fiber_g ?? 0)),
    sugar_g:       Math.max(0, Number(item.sugar_g ?? 0)),
    sodium_mg:     Math.max(0, Number(item.sodium_mg ?? 0)),
    iron_mg:       Math.max(0, Number(item.iron_mg ?? 0)),
    calcium_mg:    Math.max(0, Number(item.calcium_mg ?? 0)),
    vitamin_d_mcg: Math.max(0, Number(item.vitamin_d_mcg ?? 0)),
    vitamin_c_mg:  Math.max(0, Number(item.vitamin_c_mg ?? 0)),
    potassium_mg:  Math.max(0, Number(item.potassium_mg ?? 0)),
    confidence:    Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
  }));

  const overallConfidence =
    items.length > 0
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : Number(parsed?.overall_confidence ?? 0.8);

  return { items, confidence: overallConfidence, model: "gpt-4o-mini" };
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // Validate meal_date
  const mealDate = typeof body.meal_date === "string" ? body.meal_date : "";
  if (!mealDate || !isIsoDate(mealDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  // Validate and resolve meal_type
  const rawMealType = typeof body.meal_type === "string" ? body.meal_type : "";
  const allowedMealTypeValues = [...VALID_MEAL_TYPES, "auto"];
  if (!rawMealType || !allowedMealTypeValues.includes(rawMealType)) {
    return NextResponse.json({ error: "invalid_meal_type" }, { status: 400 });
  }
  const mealType = resolveMealType(rawMealType);

  // Validate save_mode
  const saveMode = body.save_mode;
  if (saveMode !== "ai_parse" && saveMode !== "manual") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Parse user-supplied items (optional supplement for ai_parse; required for manual)
  const userItems: MealItemInput[] = Array.isArray(body.items)
    ? (body.items as MealItemInput[])
    : [];

  let aiItems: ParsedFoodItem[] = [];
  let aiConfidence: number | null = null;
  let aiModel: string | null = null;
  let inputMode: "text" | "manual" = "manual";
  const rawInput = typeof body.raw_input === "string" ? body.raw_input.trim() : null;

  if (saveMode === "ai_parse") {
    if (!rawInput) {
      return NextResponse.json({ error: "missing_raw_input" }, { status: 400 });
    }
    if (!CONFIG.OPENAI_API_KEY) {
      return NextResponse.json({ error: "parse_failed_manual_required" }, { status: 422 });
    }
    try {
      const result = await parseMealText(rawInput);
      aiItems = result.items;
      aiConfidence = result.confidence;
      aiModel = result.model;
      inputMode = "text";
    } catch {
      return NextResponse.json({ error: "parse_failed_manual_required" }, { status: 422 });
    }
  } else {
    // manual mode
    if (userItems.length === 0) {
      return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
    }
    for (const item of userItems) {
      if (!validateItemFields(item)) {
        return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
      }
    }
  }

  // Merge: AI items first, then any user-supplied items
  const allAiItems: MealItemInput[] = aiItems.map((item, idx) => ({
    item_name:     item.item_name,
    quantity:      item.quantity,
    unit:          item.unit,
    calories:      item.calories,
    protein_g:     item.protein_g,
    carbs_g:       item.carbs_g,
    fat_g:         item.fat_g,
    fiber_g:       item.fiber_g,
    sugar_g:       item.sugar_g,
    sodium_mg:     item.sodium_mg,
    iron_mg:       item.iron_mg,
    calcium_mg:    item.calcium_mg,
    vitamin_d_mcg: item.vitamin_d_mcg,
    vitamin_c_mg:  item.vitamin_c_mg,
    potassium_mg:  item.potassium_mg,
    source:        "ai",
    confidence:    item.confidence,
    is_user_edited: false,
    sort_order:    idx + 1,
  }));

  const allItems: MealItemInput[] = [
    ...allAiItems,
    ...userItems.map((item, idx) => ({
      ...item,
      sort_order: allAiItems.length + idx + 1,
    })),
  ];

  const pool = await getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureNutritionProfile(client, userId);
    await syncTrainingDay(client, userId, mealDate);

    // Insert meal_logs row
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

    // Insert meal_items rows
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
          item.item_name, item.quantity, item.unit,
          item.calories, item.protein_g, item.carbs_g, item.fat_g, item.fiber_g,
          item.sugar_g, item.sodium_mg, item.iron_mg, item.calcium_mg,
          item.vitamin_d_mcg, item.vitamin_c_mg, item.potassium_mg,
          item.source, item.confidence ?? null, item.is_user_edited, item.sort_order,
        ]
      );
    }

    const rollup = await recomputeDailyRollup(client, userId, mealDate);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      meal_log_id: mealLogId,
      input_mode: inputMode,
      ai_model: aiModel,
      ai_confidence: aiConfidence,
      items_saved: allItems.length,
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
