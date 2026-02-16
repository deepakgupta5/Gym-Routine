import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { generateInitialBlock } from "@/lib/engine/generateBlock";
import { getNextMondayUtc, hashGenerationRules } from "@/lib/engine/utils";
import { insertPlanExercisesIdempotent, upsertPlanSessionsReturnMap } from "@/lib/db/planInserts";
import { computeBlockProgress } from "@/lib/db/blockState";
import { normalizePrimaryLiftMap, rotatePrimaryLiftMap } from "@/lib/engine/rotation";

export async function POST() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileRes = await client.query(
      "select * from user_profile where user_id = $1 for update",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_profile" }, { status: 400 });
    }

    const profile = profileRes.rows[0];
    const oldBlockId = profile.block_id;

    const progress = await computeBlockProgress(client, userId, oldBlockId);
    if (!progress.blockComplete) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "block_not_complete", current_block_week: progress.currentBlockWeek },
        { status: 400 }
      );
    }

    const maxDateRes = await client.query(
      "select max(date) as max_date from plan_sessions where user_id = $1 and block_id = $2",
      [userId, oldBlockId]
    );
    const maxDate = maxDateRes.rows[0]?.max_date;
    if (!maxDate) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_sessions" }, { status: 400 });
    }

    const nextStart = getNextMondayUtc(new Date(maxDate));
    const nextStartStr = nextStart.toISOString().slice(0, 10);

    const normalizedMap = normalizePrimaryLiftMap(profile.primary_lift_map);
    const rotatedMap = rotatePrimaryLiftMap(normalizedMap);

    const newBlockId = crypto.randomUUID();

    await client.query(
      `update user_profile
       set start_date = $1,
           block_id = $2,
           current_block_week = 1,
           primary_lift_map = $3::jsonb,
           rest_inserted_by_week = '{}'::jsonb,
           updated_at = now()
       where user_id = $4`,
      [nextStartStr, newBlockId, JSON.stringify(rotatedMap), userId]
    );

    await client.query(
      "update blocks set pending_applied = true where block_id = $1",
      [oldBlockId]
    );

    await client.query(
      `insert into blocks
        (block_id, user_id, start_date, generation_rules_hash, pending_applied)
       values ($1, $2, $3, $4, false)`,
      [newBlockId, userId, nextStartStr, hashGenerationRules()]
    );

    const exercisesRes = await client.query(
      "select * from exercises order by exercise_id asc"
    );

    const plan = generateInitialBlock({
      userProfile: {
        start_date: nextStartStr,
        block_id: newBlockId,
        bias_balance: profile.bias_balance,
        primary_lift_map: rotatedMap,
      },
      exercises: exercisesRes.rows,
      blockId: newBlockId,
    });

    const sessionIdByKey = await upsertPlanSessionsReturnMap(
      client,
      userId,
      newBlockId,
      plan.sessions
    );

    await insertPlanExercisesIdempotent(client, sessionIdByKey, plan.exercises);

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      old_block_id: oldBlockId,
      new_block_id: newBlockId,
      sessions_count: plan.sessions.length,
      exercises_count: plan.exercises.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("plan_regenerate_failed", err);
    return NextResponse.json({ error: "plan_regenerate_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
