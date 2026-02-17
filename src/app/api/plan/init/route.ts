import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { generateInitialBlock } from "@/lib/engine/generateBlock";
import { getMondayUtc, hashGenerationRules } from "@/lib/engine/utils";
import { insertPlanExercisesIdempotent, upsertPlanSessionsReturnMap } from "@/lib/db/planInserts";
import { logError } from "@/lib/logger";

export async function POST() {
  requireConfig();
  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userId = CONFIG.SINGLE_USER_ID;

    // 1) Lock or create user_profile
    let profileRes = await client.query(
      "select * from user_profile where user_id = $1 for update",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      const blockId = crypto.randomUUID();
      const startDate = getMondayUtc();

      await client.query(
        `insert into user_profile
          (user_id, start_date, block_id, current_block_week, bias_balance, adaptive_enabled,
           primary_lift_map, secondary_lift_map, progression_state, rest_inserted_by_week)
         values
          ($1, $2, $3, 1, 0, false, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
        [userId, startDate, blockId]
      );

      profileRes = await client.query(
        "select * from user_profile where user_id = $1 for update",
        [userId]
      );
    }

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const profile = profileRes.rows[0];

    // 2) Ensure blocks row exists
    const blockRes = await client.query(
      "select * from blocks where block_id = $1 for update",
      [profile.block_id]
    );

    if (blockRes.rowCount === 0) {
      await client.query(
        `insert into blocks
          (block_id, user_id, start_date, generation_rules_hash, pending_applied)
         values
          ($1, $2, $3, $4, false)`,
        [profile.block_id, userId, profile.start_date, hashGenerationRules()]
      );
    }

    // 3) Generate plan (pure engine)
    const exercisesRes = await client.query(
      "select * from exercises order by exercise_id asc"
    );

    const plan = generateInitialBlock({
      userProfile: profile,
      exercises: exercisesRes.rows,
      blockId: profile.block_id,
    });

    // 4) Insert sessions, get id map
    const sessionIdByKey = await upsertPlanSessionsReturnMap(
      client,
      userId,
      profile.block_id,
      plan.sessions
    );

    // 5) Insert exercises idempotently
    await insertPlanExercisesIdempotent(client, sessionIdByKey, plan.exercises);

    await client.query("COMMIT");

    return NextResponse.json({
      initialized: true,
      block_id: profile.block_id,
      sessions_count: plan.sessions.length,
      exercises_count: plan.exercises.length,
    });
  } catch (err) {
  await client.query("ROLLBACK");
  logError("plan_init_failed", err, { user_id: CONFIG.SINGLE_USER_ID });
  const detail =
    process.env.NODE_ENV === "production" ? undefined : String(err);
  return NextResponse.json(
    { error: "plan_init_failed", detail },
    { status: 500 }
  );
} finally {
  client.release();
}
}
