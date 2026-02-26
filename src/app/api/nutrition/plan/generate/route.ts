import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { callOpenAI } from "@/lib/ai/openai";
import { buildMealPlanSystemPrompt } from "@/lib/ai/prompts";
import { nutritionRateLimit } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

const DEFAULT_ALLOWED_PROTEINS  = ["chicken", "shrimp", "eggs", "dairy", "plant"];
const DEFAULT_FORBIDDEN_PROTEINS = ["fish", "beef", "lamb", "pork", "goat"];
const FORBIDDEN_REGEX = /fish|beef|lamb|pork|goat/i;
const VALID_DAY_TYPES = ["training", "rest", "auto"] as const;
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type PlanMealFromAI = {
  meal_type:       string;
  description:     string;
  items?:          unknown[];
  total_calories:  number;
  total_protein_g: number;
  total_carbs_g:   number;
  total_fat_g:     number;
};

type AIResponse = {
  meals?: PlanMealFromAI[];
};

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = nutritionRateLimit(`plan-generate:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // Validate required fields
  const planDate = typeof body.plan_date === "string" ? body.plan_date : "";
  if (!planDate || !isIsoDate(planDate)) {
    return NextResponse.json({ error: "invalid_constraints" }, { status: 400 });
  }

  const dayType = body.day_type;
  if (!dayType || !(VALID_DAY_TYPES as readonly unknown[]).includes(dayType)) {
    return NextResponse.json({ error: "invalid_constraints" }, { status: 400 });
  }

  const targetCalories = Number(body.target_calories);
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) {
    return NextResponse.json({ error: "invalid_constraints" }, { status: 400 });
  }

  const targetProteinG = Number(body.target_protein_g);
  if (!Number.isFinite(targetProteinG) || targetProteinG <= 0) {
    return NextResponse.json({ error: "invalid_constraints" }, { status: 400 });
  }

  // Merge constraints with defaults
  const constraintsInput = body.constraints as Record<string, unknown> | undefined;
  const allowedProteins: string[] =
    Array.isArray(constraintsInput?.allowed_proteins)
      ? (constraintsInput!.allowed_proteins as string[])
      : DEFAULT_ALLOWED_PROTEINS;
  const forbiddenProteins: string[] =
    Array.isArray(constraintsInput?.forbidden_proteins)
      ? (constraintsInput!.forbidden_proteins as string[])
      : DEFAULT_FORBIDDEN_PROTEINS;

  // Guard: no forbidden protein may appear in allowed list
  const overlap = allowedProteins.filter((p) => forbiddenProteins.includes(p));
  if (overlap.length > 0) {
    return NextResponse.json({ error: "invalid_constraints" }, { status: 400 });
  }

  // Require OPENAI_API_KEY
  if (!CONFIG.OPENAI_API_KEY) {
    return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
  }

  // Call gpt-4o
  let aiResponse: AIResponse;
  try {
    const systemPrompt = buildMealPlanSystemPrompt({
      allowed_proteins:   allowedProteins,
      forbidden_proteins: forbiddenProteins,
      target_calories:    targetCalories,
      target_protein_g:   targetProteinG,
    });

    const rawJson = await callOpenAI({
      model: "gpt-4o",
      systemPrompt,
      userContent: `Generate a complete daily meal plan for ${planDate} with ${targetCalories} kcal and ${targetProteinG}g protein. Return JSON only.`,
      maxTokens: 4096,
      responseFormat: "json_object",
    });

    aiResponse = JSON.parse(rawJson) as AIResponse;
  } catch {
    return NextResponse.json({ error: "plan_generation_failed" }, { status: 422 });
  }

  const meals = Array.isArray(aiResponse?.meals) ? aiResponse.meals : [];
  if (meals.length < 2) {
    return NextResponse.json({ error: "plan_generation_failed" }, { status: 422 });
  }

  // Server-side forbidden protein check — before any DB write
  for (const meal of meals) {
    const textToCheck = `${meal.description ?? ""} ${JSON.stringify(meal.items ?? [])}`;
    if (FORBIDDEN_REGEX.test(textToCheck)) {
      return NextResponse.json({ error: "forbidden_protein_in_plan" }, { status: 422 });
    }
  }

  // Compute day totals from meals
  const dayTotalCalories  = meals.reduce((s, m) => s + Number(m.total_calories  ?? 0), 0);
  const dayTotalProtein   = meals.reduce((s, m) => s + Number(m.total_protein_g ?? 0), 0);

  const pool = await getDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert nutrition_plans
    const planRes = await client.query<{ plan_id: string }>(
      `INSERT INTO nutrition_plans
         (user_id, plan_date, target_calories, target_protein_g,
          constraints_json, ai_model)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING plan_id`,
      [
        userId,
        planDate,
        targetCalories,
        targetProteinG,
        JSON.stringify({ allowed_proteins: allowedProteins, forbidden_proteins: forbiddenProteins }),
        "gpt-4o",
      ]
    );
    const planId = planRes.rows[0].plan_id;

    // Insert nutrition_plan_meals
    const savedMeals: Array<{
      plan_meal_id:    string;
      meal_type:       string;
      description:     string;
      total_calories:  number;
      total_protein_g: number;
      total_carbs_g:   number;
      total_fat_g:     number;
      items_json:      unknown[];
    }> = [];

    for (const meal of meals) {
      const mealType =
        (VALID_MEAL_TYPES as readonly string[]).includes(meal.meal_type)
          ? meal.meal_type
          : "snack";

      const mealRes = await client.query<{ plan_meal_id: string }>(
        `INSERT INTO nutrition_plan_meals
           (plan_id, meal_type, description, items_json,
            total_calories, total_protein_g, total_carbs_g, total_fat_g)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         RETURNING plan_meal_id`,
        [
          planId,
          mealType,
          meal.description ?? "",
          JSON.stringify(meal.items ?? []),
          Number(meal.total_calories  ?? 0),
          Number(meal.total_protein_g ?? 0),
          Number(meal.total_carbs_g   ?? 0),
          Number(meal.total_fat_g     ?? 0),
        ]
      );

      savedMeals.push({
        plan_meal_id:    mealRes.rows[0].plan_meal_id,
        meal_type:       mealType,
        description:     meal.description ?? "",
        total_calories:  Number(meal.total_calories  ?? 0),
        total_protein_g: Number(meal.total_protein_g ?? 0),
        total_carbs_g:   Number(meal.total_carbs_g   ?? 0),
        total_fat_g:     Number(meal.total_fat_g     ?? 0),
        items_json:      meal.items ?? [],
      });
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok:               true,
      plan_id:          planId,
      plan_date:        planDate,
      ai_model:         "gpt-4o",
      total_calories:   Math.round(dayTotalCalories),
      total_protein_g:  Math.round(dayTotalProtein),
      meals:            savedMeals,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_plan_generate_failed", err, { user_id: userId });
    return NextResponse.json({ error: "nutrition_plan_generate_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
