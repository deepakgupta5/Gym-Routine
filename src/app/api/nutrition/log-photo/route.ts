// PRIVACY CONTRACT (non-negotiable):
// - export const dynamic = "force-dynamic" MUST remain at the top
// - Do NOT log request body, form data, or any image variable
// - Log only: event name, error code, user_id
// - This route returns parsed items ONLY — writes nothing to DB

import { NextResponse } from "next/server";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { parsePhotoMeal } from "@/lib/nutrition/photoParse";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "auto"];

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

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
  if (mealTypeRaw !== null && !VALID_MEAL_TYPES.includes(String(mealTypeRaw))) {
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
  try {
    result = await parsePhotoMeal(imageBuffer);
  } catch (err) {
    // Log only event + user_id — never log image bytes or base64
    logError("photo_parse_failed", err, { user_id: userId });
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("openai_request_failed") || message === "openai_key_missing") {
      return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
    }
    if (message === "photo_parse_invalid_json" || result!?.items?.length === 0) {
      return NextResponse.json({ error: "parse_failed" }, { status: 422 });
    }
    return NextResponse.json({ error: "nutrition_photo_parse_failed" }, { status: 500 });
  }

  if (!result.items || result.items.length === 0) {
    return NextResponse.json({ error: "parse_failed" }, { status: 422 });
  }

  // Return parsed items only — zero image data in response
  return NextResponse.json({
    ok: true,
    input_mode: "photo",
    ai_model: result.model,
    ai_confidence: result.confidence,
    items: result.items.map((item, idx) => ({
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
      source:        "ai" as const,
      confidence:    item.confidence,
      is_user_edited: false,
      sort_order:    idx + 1,
    })),
    warnings: [],
  });
}
