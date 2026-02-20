import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import {
  getWeekStartFromTimestamp,
  recomputeSessionPerformed,
  recomputeWeeklyRollup,
} from "@/lib/db/logs";
import { updateCurrentBlockWeek } from "@/lib/db/blockState";
import { estimate1RM, computeNextTopSetLoad, LoadSemantic } from "@/lib/engine/progression";
import { logError } from "@/lib/logger";

type AllowedSetType = "top" | "backoff";

const ALLOWED_SET_TYPES: readonly AllowedSetType[] = ["top", "backoff"];

function isAllowedSetType(value: unknown): value is AllowedSetType {
  return typeof value === "string" && ALLOWED_SET_TYPES.includes(value as AllowedSetType);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateOptionalSetLogUpdate(body: SetLogUpdate) {
  if (body.exercise_id !== undefined && !isPositiveInteger(body.exercise_id)) {
    return "exercise_id must be a positive integer";
  }

  if (body.set_index !== undefined && !isPositiveInteger(body.set_index)) {
    return "set_index must be a positive integer";
  }

  if (
    body.load !== undefined &&
    (typeof body.load !== "number" || !Number.isFinite(body.load) || body.load <= 0 || body.load > 2000)
  ) {
    return "load must be > 0 and <= 2000";
  }

  if (
    body.reps !== undefined &&
    (!Number.isInteger(body.reps) || body.reps <= 0 || body.reps > 200)
  ) {
    return "reps must be a positive integer <= 200";
  }

  return null;
}

type SetLogUpdate = {
  performed_at?: string;
  session_id?: string | null;
  exercise_id?: number;
  movement_pattern?: string;
  targeted_primary_muscle?: string;
  targeted_secondary_muscle?: string | null;
  set_type?: AllowedSetType;
  set_index?: number;
  load?: number;
  reps?: number;
  rpe?: number | null;
  notes?: string | null;
  role?: "primary" | "secondary" | "accessory";
  is_primary?: boolean;
  is_secondary?: boolean;
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const { id } = await params;

  const pool = await getDb();
  const client = await pool.connect();

  try {
    const parsedBody = await req.json().catch(() => ({}));
    const body =
      parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
        ? (parsedBody as SetLogUpdate)
        : ({} as SetLogUpdate);

    if (body.set_type !== undefined && !isAllowedSetType(body.set_type)) {
      return NextResponse.json(
        { error: "invalid_set_type", allowed_set_types: ALLOWED_SET_TYPES },
        { status: 400 }
      );
    }

    const valueError = validateOptionalSetLogUpdate(body);
    if (valueError) {
      return NextResponse.json({ error: "invalid_set_values", detail: valueError }, { status: 400 });
    }

    await client.query("BEGIN");

    const existingRes = await client.query(
      "select * from set_logs where id = $1 and user_id = $2",
      [id, userId]
    );

    if (existingRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const existing = existingRes.rows[0];

    if (body.exercise_id !== undefined) {
      const exerciseRes = await client.query(
        "select exercise_id from exercises where exercise_id = $1",
        [body.exercise_id]
      );

      if (exerciseRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "invalid_exercise_id", exercise_id: body.exercise_id },
          { status: 400 }
        );
      }
    }

    const updated = {
      performed_at: body.performed_at ?? existing.performed_at,
      session_id: body.session_id ?? existing.session_id,
      exercise_id: body.exercise_id ?? existing.exercise_id,
      movement_pattern: body.movement_pattern ?? existing.movement_pattern,
      targeted_primary_muscle:
        body.targeted_primary_muscle ?? existing.targeted_primary_muscle,
      targeted_secondary_muscle:
        body.targeted_secondary_muscle ?? existing.targeted_secondary_muscle,
      set_type: body.set_type ?? existing.set_type,
      set_index: body.set_index ?? existing.set_index,
      load: body.load ?? existing.load,
      reps: body.reps ?? existing.reps,
      rpe: body.rpe ?? existing.rpe,
      notes: body.notes ?? existing.notes,
      is_primary:
        body.is_primary ??
        (body.role === undefined ? existing.is_primary : body.role === "primary"),
      is_secondary:
        body.is_secondary ??
        (body.role === undefined ? existing.is_secondary : body.role === "secondary"),
    };

    const updateRes = await client.query(
      `update set_logs
       set performed_at = $1,
           session_id = $2,
           exercise_id = $3,
           movement_pattern = $4,
           targeted_primary_muscle = $5,
           targeted_secondary_muscle = $6,
           is_primary = $7,
           is_secondary = $8,
           set_type = $9,
           set_index = $10,
           load = $11,
           reps = $12,
           rpe = $13,
           notes = $14
       where id = $15 and user_id = $16
       returning *`,
      [
        updated.performed_at,
        updated.session_id,
        updated.exercise_id,
        updated.movement_pattern,
        updated.targeted_primary_muscle,
        updated.targeted_secondary_muscle,
        updated.is_primary,
        updated.is_secondary,
        updated.set_type,
        updated.set_index,
        updated.load,
        updated.reps,
        updated.rpe,
        updated.notes,
        id,
        userId,
      ]
    );

    const row = updateRes.rows[0];

    const impactedSessions = new Set<string>();
    if (existing.session_id) impactedSessions.add(existing.session_id);
    if (row.session_id) impactedSessions.add(row.session_id);

    for (const sessionId of impactedSessions) {
      await recomputeSessionPerformed(client, sessionId);
    }

    const weekStarts = new Set<string>();
    if (existing.performed_at)
      weekStarts.add(getWeekStartFromTimestamp(existing.performed_at));
    if (row.performed_at)
      weekStarts.add(getWeekStartFromTimestamp(row.performed_at));

    for (const weekStart of weekStarts) {
      await recomputeWeeklyRollup(client, userId, weekStart);
    }

    const profileRes = await client.query(
      "select bias_balance, block_id from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const biasBalance = profileRes.rows[0]?.bias_balance ?? 0;
    const blockId = profileRes.rows[0]?.block_id ?? null;

    if (row.set_type === "top") {
      let session = null;
      if (row.session_id) {
        const sessionRes = await client.query(
          `select block_id, week_in_block from plan_sessions where plan_session_id = $1`,
          [row.session_id]
        );
        session = sessionRes.rows[0] ?? null;
      }

      const est = estimate1RM(Number(row.load), Number(row.reps));
      await client.query(
        `insert into top_set_history
          (user_id, performed_at, exercise_id, load, reps, estimated_1rm,
           block_id, week_in_block, bias_balance_at_time, source_set_log_id)
         values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (source_set_log_id) do update set
           performed_at = excluded.performed_at,
           load = excluded.load,
           reps = excluded.reps,
           estimated_1rm = excluded.estimated_1rm,
           block_id = excluded.block_id,
           week_in_block = excluded.week_in_block,
           bias_balance_at_time = excluded.bias_balance_at_time`,
        [
          userId,
          row.performed_at,
          row.exercise_id,
          row.load,
          row.reps,
          est,
          session?.block_id ?? null,
          session?.week_in_block ?? null,
          biasBalance,
          row.id,
        ]
      );

      // --- Compute and persist next_target_load for future weeks ---
      if (session?.block_id && session?.week_in_block) {
        const metaRes = await client.query(
          `select load_increment_lb, load_semantic from exercises where exercise_id = $1`,
          [row.exercise_id]
        );
        const meta = metaRes.rows[0];
        if (meta) {
          const nextLoad = computeNextTopSetLoad({
            last_prescribed_load: Number(row.load),
            last_performed_reps: Number(row.reps),
            cap_pct: 0.03,
            increment: Number(meta.load_increment_lb),
            load_semantic: (meta.load_semantic || "normal") as LoadSemantic,
          });

          await client.query(
            `update plan_exercises pe
             set next_target_load = $1
             from plan_sessions ps
             where pe.plan_session_id = ps.plan_session_id
               and ps.block_id = $2
               and ps.week_in_block > $3
               and pe.exercise_id = $4`,
            [nextLoad, session.block_id, session.week_in_block, row.exercise_id]
          );
        }
      }
    } else if (existing.set_type === "top") {
      await client.query("delete from top_set_history where source_set_log_id = $1", [
        row.id,
      ]);
    }

    if (blockId) {
      await updateCurrentBlockWeek(client, userId, blockId);
    }

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, updated: row.id });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("set_log_update_failed", err, { user_id: userId, set_log_id: id });
    return NextResponse.json({ error: "set_log_update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const { id } = await params;

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingRes = await client.query(
      "select * from set_logs where id = $1 and user_id = $2",
      [id, userId]
    );

    if (existingRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const existing = existingRes.rows[0];

    await client.query("delete from set_logs where id = $1 and user_id = $2", [
      id,
      userId,
    ]);

    if (existing.session_id) {
      await recomputeSessionPerformed(client, existing.session_id);
    }

    if (existing.performed_at) {
      const weekStart = getWeekStartFromTimestamp(existing.performed_at);
      await recomputeWeeklyRollup(client, userId, weekStart);
    }

    if (existing.set_type === "top") {
      await client.query("delete from top_set_history where source_set_log_id = $1", [
        id,
      ]);
    }

    const profileRes = await client.query(
      "select block_id from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const blockId = profileRes.rows[0]?.block_id ?? null;
    if (blockId) {
      await updateCurrentBlockWeek(client, userId, blockId);
    }

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("set_log_delete_failed", err, { user_id: userId, set_log_id: id });
    return NextResponse.json({ error: "set_log_delete_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
