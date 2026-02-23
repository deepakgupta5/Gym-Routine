import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { logError } from "@/lib/logger";
import { recomputeDailyRollup } from "@/lib/nutrition/rollups";
import type { MealItemInput } from "@/lib/nutrition/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

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

// PUT /api/nutrition/log/:id
export async function PUT(req: Request, ctx: RouteContext) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const { id: mealLogId } = await ctx.params;

  const pool = await getDb();
  const client = await pool.connect();
  try {
    // Verify the log belongs to this user and get meal_date
    const checkRes = await client.query<{ meal_log_id: string; meal_date: string }>(
      `SELECT meal_log_id, meal_date::text AS meal_date
       FROM meal_logs
       WHERE meal_log_id = $1 AND user_id = $2`,
      [mealLogId, userId]
    );
    if (!checkRes.rowCount || checkRes.rowCount === 0) {
      return NextResponse.json({ error: "meal_log_not_found" }, { status: 404 });
    }
    const mealDate = checkRes.rows[0].meal_date;

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const items: MealItemInput[] = Array.isArray(body.items)
      ? (body.items as MealItemInput[])
      : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
    }
    for (const item of items) {
      if (!validateItemFields(item)) {
        return NextResponse.json({ error: "invalid_item_fields" }, { status: 400 });
      }
    }

    await client.query("BEGIN");

    // Update meal_logs metadata
    const newMealType =
      typeof body.meal_type === "string" && VALID_MEAL_TYPES.includes(body.meal_type)
        ? body.meal_type
        : null;
    const newNotes = typeof body.notes === "string" ? body.notes : null;

    await client.query(
      `UPDATE meal_logs
       SET meal_type  = COALESCE($1, meal_type),
           notes      = $2,
           updated_at = now()
       WHERE meal_log_id = $3`,
      [newMealType, newNotes, mealLogId]
    );

    // Full item replacement:
    // 1. Collect incoming IDs for items that already exist
    const incomingIds = items
      .map((i) => i.meal_item_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // 2. Delete items not present in the incoming list
    if (incomingIds.length > 0) {
      await client.query(
        `DELETE FROM meal_items
         WHERE meal_log_id = $1 AND meal_item_id != ALL($2::uuid[])`,
        [mealLogId, incomingIds]
      );
    } else {
      // No existing items to keep — delete all
      await client.query(
        `DELETE FROM meal_items WHERE meal_log_id = $1`,
        [mealLogId]
      );
    }

    // 3. Upsert each item
    let sortOrder = 1;
    for (const item of items) {
      const so = sortOrder++;
      if (item.meal_item_id) {
        // UPDATE in place — mark as user-edited
        await client.query(
          `UPDATE meal_items SET
             item_name      = $1,
             quantity       = $2,
             unit           = $3,
             calories       = $4,
             protein_g      = $5,
             carbs_g        = $6,
             fat_g          = $7,
             fiber_g        = $8,
             sugar_g        = $9,
             sodium_mg      = $10,
             iron_mg        = $11,
             calcium_mg     = $12,
             vitamin_d_mcg  = $13,
             vitamin_c_mg   = $14,
             potassium_mg   = $15,
             source         = $16,
             confidence     = $17,
             is_user_edited = true,
             sort_order     = $18
           WHERE meal_item_id = $19 AND meal_log_id = $20`,
          [
            item.item_name, item.quantity, item.unit,
            item.calories, item.protein_g, item.carbs_g, item.fat_g, item.fiber_g,
            item.sugar_g, item.sodium_mg, item.iron_mg, item.calcium_mg,
            item.vitamin_d_mcg, item.vitamin_c_mg, item.potassium_mg,
            item.source, item.confidence ?? null, so,
            item.meal_item_id, mealLogId,
          ]
        );
      } else {
        // INSERT new item
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
            item.source, item.confidence ?? null, item.is_user_edited ?? false, so,
          ]
        );
      }
    }

    const rollup = await recomputeDailyRollup(client, userId, mealDate);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      meal_log_id: mealLogId,
      items_saved: items.length,
      rollup,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_log_update_failed", err, { user_id: userId, meal_log_id: mealLogId });
    return NextResponse.json({ error: "nutrition_log_update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/nutrition/log/:id
export async function DELETE(_req: Request, ctx: RouteContext) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const { id: mealLogId } = await ctx.params;

  const pool = await getDb();
  const client = await pool.connect();
  try {
    // Verify log belongs to user and get meal_date
    const checkRes = await client.query<{ meal_log_id: string; meal_date: string }>(
      `SELECT meal_log_id, meal_date::text AS meal_date
       FROM meal_logs
       WHERE meal_log_id = $1 AND user_id = $2`,
      [mealLogId, userId]
    );
    if (!checkRes.rowCount || checkRes.rowCount === 0) {
      return NextResponse.json({ error: "meal_log_not_found" }, { status: 404 });
    }
    const mealDate = checkRes.rows[0].meal_date;

    await client.query("BEGIN");

    // Delete the meal log — meal_items cascade via FK ON DELETE CASCADE
    await client.query(
      `DELETE FROM meal_logs WHERE meal_log_id = $1`,
      [mealLogId]
    );

    const rollup = await recomputeDailyRollup(client, userId, mealDate);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      deleted_meal_log_id: mealLogId,
      rollup,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("nutrition_log_delete_failed", err, { user_id: userId, meal_log_id: mealLogId });
    return NextResponse.json({ error: "nutrition_log_delete_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
