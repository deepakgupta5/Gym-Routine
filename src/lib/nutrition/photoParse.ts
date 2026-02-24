/**
 * Photo meal parser — calls gpt-4o vision to estimate food items.
 *
 * CRITICAL PRIVACY CONTRACT (non-negotiable):
 *   1. imageBase64 is a LOCAL const inside this function only.
 *      It is NEVER returned, logged, stored, or exported.
 *   2. logError/logInfo must NEVER be called with image data, buffer,
 *      base64, or anything derived from the photo bytes.
 *   3. Only event names and error codes are logged.
 *   4. This function returns ParsedFoodItem[] only — zero image data.
 *   5. No image is written to DB, filesystem, or object storage.
 */

import { callOpenAI } from "@/lib/ai/openai";
import { buildPhotoParseSystemPrompt } from "@/lib/ai/prompts";
import type { MealParseResult, ParsedFoodItem } from "@/lib/ai/types";

const ALLOWED_PROTEINS = ["chicken", "shrimp", "eggs", "dairy", "plant"];

type OpenAIPhotoResponse = {
  items?: Array<Partial<ParsedFoodItem>>;
  overall_confidence?: number;
};

export async function parsePhotoMeal(imageBuffer: Buffer): Promise<MealParseResult> {
  // imageBase64 lives only in this function scope — eligible for GC after callOpenAI returns
  const imageBase64 = imageBuffer.toString("base64");

  const systemPrompt = buildPhotoParseSystemPrompt(ALLOWED_PROTEINS);

  const rawJson = await callOpenAI({
    model: "gpt-4o",
    systemPrompt,
    userContent: [
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
          detail: "high",
        },
      },
      {
        type: "text",
        text: "Analyse this meal photo and return the JSON with all food items and nutrients.",
      },
    ],
    maxTokens: 2048,
    responseFormat: "json_object",
    timeoutMs: 2500,
  });

  // imageBase64 goes out of scope here — no longer referenced

  let parsed: OpenAIPhotoResponse;
  try {
    parsed = JSON.parse(rawJson) as OpenAIPhotoResponse;
  } catch {
    throw new Error("photo_parse_invalid_json");
  }

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: ParsedFoodItem[] = rawItems.map((item, idx) => ({
    item_name:     String(item.item_name     ?? `Item ${idx + 1}`),
    quantity:      Number(item.quantity      ?? 1),
    unit:          String(item.unit          ?? "serving"),
    calories:      Math.max(0, Number(item.calories      ?? 0)),
    protein_g:     Math.max(0, Number(item.protein_g     ?? 0)),
    carbs_g:       Math.max(0, Number(item.carbs_g       ?? 0)),
    fat_g:         Math.max(0, Number(item.fat_g         ?? 0)),
    fiber_g:       Math.max(0, Number(item.fiber_g       ?? 0)),
    sugar_g:       Math.max(0, Number(item.sugar_g       ?? 0)),
    sodium_mg:     Math.max(0, Number(item.sodium_mg     ?? 0)),
    iron_mg:       Math.max(0, Number(item.iron_mg       ?? 0)),
    calcium_mg:    Math.max(0, Number(item.calcium_mg    ?? 0)),
    vitamin_d_mcg: Math.max(0, Number(item.vitamin_d_mcg ?? 0)),
    vitamin_c_mg:  Math.max(0, Number(item.vitamin_c_mg  ?? 0)),
    potassium_mg:  Math.max(0, Number(item.potassium_mg  ?? 0)),
    confidence:    Math.min(1, Math.max(0, Number(item.confidence ?? 0.7))),
  }));

  const overallConfidence =
    items.length > 0
      ? items.reduce((sum, i) => sum + i.confidence, 0) / items.length
      : Number(parsed?.overall_confidence ?? 0.7);

  return {
    items,
    confidence: Math.min(1, Math.max(0, overallConfidence)),
    model: "gpt-4o",
  };
}
