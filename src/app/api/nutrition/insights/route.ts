import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type InsightCandidate = {
  insight_type: "deficiency_alert" | "coaching" | "supplement";
  recommendation_text: string;
  context_json: Record<string, unknown>;
};

type RollupData = {
  total_protein_g:     number;
  total_fiber_g:       number;
  total_sugar_g:       number;
  total_iron_mg:       number;
  total_vitamin_d_mcg: number;
  water_ml:            number;
};

type GoalsData = {
  target_protein_g: number;
};

// Rule-based checks per Section 5.8 trigger table
function generateCandidates(rollup: RollupData, goals: GoalsData): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];

  if (rollup.total_protein_g < goals.target_protein_g * 0.8) {
    candidates.push({
      insight_type: "deficiency_alert",
      recommendation_text: `Protein is ${rollup.total_protein_g.toFixed(0)} g today vs ${goals.target_protein_g} g target. Add a high-protein meal or snack to close the gap.`,
      context_json: { metric: "protein_g", value: rollup.total_protein_g, target: goals.target_protein_g },
    });
  }

  if (rollup.total_fiber_g < 25) {
    candidates.push({
      insight_type: "deficiency_alert",
      recommendation_text: `Fiber is ${rollup.total_fiber_g.toFixed(0)} g today vs 30 g target. Add legumes, vegetables, or whole grains at dinner.`,
      context_json: { metric: "fiber_g", value: rollup.total_fiber_g, target: 30 },
    });
  }

  if (rollup.total_sugar_g > 40) {
    candidates.push({
      insight_type: "coaching",
      recommendation_text: `Added sugar is ${rollup.total_sugar_g.toFixed(0)} g today, above the 45 g daily limit. Consider reducing sweetened drinks or snacks.`,
      context_json: { metric: "sugar_g", value: rollup.total_sugar_g, target: 45 },
    });
  }

  if (rollup.total_iron_mg < 6) {
    candidates.push({
      insight_type: "deficiency_alert",
      recommendation_text: `Iron is ${rollup.total_iron_mg.toFixed(1)} mg today vs 8 mg target. Include eggs, legumes, or fortified cereals to boost intake.`,
      context_json: { metric: "iron_mg", value: rollup.total_iron_mg, target: 8 },
    });
  }

  if (rollup.total_vitamin_d_mcg < 10) {
    candidates.push({
      insight_type: "supplement",
      recommendation_text: `Vitamin D is ${rollup.total_vitamin_d_mcg.toFixed(1)} mcg today vs 15 mcg target. Consider a daily supplement or fortified dairy.`,
      context_json: { metric: "vitamin_d_mcg", value: rollup.total_vitamin_d_mcg, target: 15 },
    });
  }

  if (rollup.water_ml < 2000) {
    candidates.push({
      insight_type: "coaching",
      recommendation_text: `Water intake is ${rollup.water_ml.toFixed(0)} ml today vs 3000 ml target. Drink a large glass of water now and before each meal.`,
      context_json: { metric: "water_ml", value: rollup.water_ml, target: 3000 },
    });
  }

  return candidates;
}

export async function GET(req: NextRequest) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ?? todayUtc();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();
  try {
    // Fetch rollup for this date
    const rollupRes = await client.query<RollupData>(
      `SELECT
         total_protein_g::float     AS total_protein_g,
         total_fiber_g::float       AS total_fiber_g,
         total_sugar_g::float       AS total_sugar_g,
         total_iron_mg::float       AS total_iron_mg,
         total_vitamin_d_mcg::float AS total_vitamin_d_mcg,
         water_ml::float            AS water_ml
       FROM daily_nutrition_rollups
       WHERE user_id = $1 AND rollup_date = $2`,
      [userId, date]
    );

    // No meals logged → no insights
    if (!rollupRes.rowCount || rollupRes.rowCount === 0) {
      return NextResponse.json({ date, insights: [] });
    }

    // Fetch goals for threshold comparison
    const goalsRes = await client.query<GoalsData>(
      `SELECT target_protein_g::float AS target_protein_g
       FROM nutrition_goals_daily
       WHERE user_id = $1 AND goal_date = $2`,
      [userId, date]
    );

    const rollup = rollupRes.rows[0];
    const goals: GoalsData = goalsRes.rows[0] ?? { target_protein_g: 160 };

    const candidates = generateCandidates(rollup, goals);

    // Upsert each candidate — ON CONFLICT uses uq_insights_user_type_day index
    for (const c of candidates) {
      await client.query(
        `INSERT INTO nutrition_insights
           (user_id, insight_type, generated_at, context_json, recommendation_text, is_dismissed)
         VALUES
           ($1, $2, now(), $3::jsonb, $4, false)
         ON CONFLICT (user_id, insight_type, (generated_at::date))
         DO UPDATE SET
           recommendation_text = EXCLUDED.recommendation_text,
           context_json        = EXCLUDED.context_json,
           is_dismissed        = false`,
        [userId, c.insight_type, JSON.stringify(c.context_json), c.recommendation_text]
      );
    }

    // Return all non-dismissed insights generated today
    const insightsRes = await client.query(
      `SELECT
         insight_id,
         insight_type,
         generated_at::text AS generated_at,
         recommendation_text,
         is_dismissed,
         context_json
       FROM nutrition_insights
       WHERE user_id = $1
         AND generated_at::date = $2::date
         AND is_dismissed = false
       ORDER BY generated_at ASC`,
      [userId, date]
    );

    return NextResponse.json({ date, insights: insightsRes.rows });
  } catch (err) {
    logError("nutrition_insights_failed", err, { user_id: userId, date });
    return NextResponse.json({ error: "nutrition_insights_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
