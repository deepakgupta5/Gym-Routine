import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import {
  getWeekStartFromTimestamp,
  recomputeSessionPerformed,
  recomputeWeeklyRollup,
} from "@/lib/db/logs";
import { updateCurrentBlockWeek } from "@/lib/db/blockState";
import { estimate1RM } from "@/lib/engine/progression";

type AllowedSetType = "top" | "backoff";

const ALLOWED_SET_TYPES: readonly AllowedSetType[] = ["top", "backoff"];

function isAllowedSetType(value: unknown): value is AllowedSetType {
  return typeof value === "string" && ALLOWED_SET_TYPES.includes(value as AllowedSetType);
}

type SetLogInput = {
  performed_at?: string;
  session_id?: string | null;
  exercise_id: number;
  movement_pattern?: string;
  targeted_primary_muscle?: string;
  targeted_secondary_muscle?: string | null;
  set_type: AllowedSetType;
  set_index: number;
  load: number;
  reps: number;
  rpe?: number | null;
  notes?: string | null;
  role?: "primary" | "secondary" | "accessory";
  is_primary?: boolean;
  is_secondary?: boolean;
};

function normalizeBody(body: any): SetLogInput[] {
  if (!body) return [];
  if (Array.isArray(body)) return body as SetLogInput[];
  if (Array.isArray(body.sets)) return body.sets as SetLogInput[];
  return [body as SetLogInput];
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const body = await req.json().catch(() => null);
    const sets = normalizeBody(body);

    if (sets.length === 0) {
      return NextResponse.json({ error: "no_sets" }, { status: 400 });
    }

    if (sets.some((set) => !isAllowedSetType(set.set_type))) {
      return NextResponse.json(
        { error: "invalid_set_type", allowed_set_types: ALLOWED_SET_TYPES },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const profileRes = await client.query(
      "select bias_balance, block_id from user_profile where user_id = $1",
      [userId]
    );
    const biasBalance = profileRes.rows[0]?.bias_balance ?? 0;
    const blockId = profileRes.rows[0]?.block_id ?? null;

    const missingExerciseIds = Array.from(
      new Set(
        sets
          .filter(
            (s) =>
              !s.movement_pattern ||
              !s.targeted_primary_muscle ||
              s.targeted_primary_muscle === ""
          )
          .map((s) => s.exercise_id)
      )
    );

    let exerciseById = new Map<number, any>();
    if (missingExerciseIds.length > 0) {
      const exRes = await client.query(
        `select exercise_id, movement_pattern, default_targeted_primary_muscle, default_targeted_secondary_muscle
         from exercises where exercise_id = any($1)` ,
        [missingExerciseIds]
      );
      exerciseById = new Map(exRes.rows.map((r: any) => [r.exercise_id, r]));
    }

    const records = sets.map((s) => {
      const ex = exerciseById.get(s.exercise_id);
      const movement_pattern = s.movement_pattern || ex?.movement_pattern || "";
      const targeted_primary_muscle =
        s.targeted_primary_muscle || ex?.default_targeted_primary_muscle || "";
      const targeted_secondary_muscle =
        s.targeted_secondary_muscle ?? ex?.default_targeted_secondary_muscle ?? null;

      const is_primary = s.is_primary ?? s.role === "primary";
      const is_secondary = s.is_secondary ?? s.role === "secondary";

      return {
        user_id: userId,
        performed_at: s.performed_at || new Date().toISOString(),
        session_id: s.session_id ?? null,
        exercise_id: s.exercise_id,
        movement_pattern,
        targeted_primary_muscle,
        targeted_secondary_muscle,
        is_primary: !!is_primary,
        is_secondary: !!is_secondary,
        set_type: s.set_type,
        set_index: s.set_index,
        load: s.load,
        reps: s.reps,
        rpe: s.rpe ?? null,
        notes: s.notes ?? null,
      };
    });

    const values: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const r of records) {
      params.push(
        r.user_id,
        r.performed_at,
        r.session_id,
        r.exercise_id,
        r.movement_pattern,
        r.targeted_primary_muscle,
        r.targeted_secondary_muscle,
        r.is_primary,
        r.is_secondary,
        r.set_type,
        r.set_index,
        r.load,
        r.reps,
        r.rpe,
        r.notes
      );
      values.push(
        `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
      );
    }

    const insertSql = `
      insert into set_logs
        (user_id, performed_at, session_id, exercise_id, movement_pattern,
         targeted_primary_muscle, targeted_secondary_muscle,
         is_primary, is_secondary, set_type, set_index, load, reps, rpe, notes)
      values
        ${values.join(",")}
      returning id, performed_at, session_id, set_type, exercise_id, load, reps
    `;

    const insertedRes = await client.query(insertSql, params);
    const inserted = insertedRes.rows as Array<any>;

    const impactedSessions = Array.from(
      new Set(inserted.map((r) => r.session_id).filter(Boolean))
    ) as string[];

    const weekStarts = new Set<string>();
    for (const r of inserted) {
      if (r.performed_at) {
        weekStarts.add(getWeekStartFromTimestamp(r.performed_at));
      }
    }

    for (const sessionId of impactedSessions) {
      await recomputeSessionPerformed(client, sessionId);
    }

    for (const weekStart of weekStarts) {
      await recomputeWeeklyRollup(client, userId, weekStart);
    }

    const topRows = inserted.filter((r) => r.set_type === "top");
    if (topRows.length > 0) {
      const sessionMap = new Map<string, any>();
      const sessionIds = Array.from(
        new Set(topRows.map((r) => r.session_id).filter(Boolean))
      ) as string[];
      if (sessionIds.length > 0) {
        const sessionRes = await client.query(
          `select plan_session_id, block_id, week_in_block
           from plan_sessions where plan_session_id = any($1)` ,
          [sessionIds]
        );
        for (const row of sessionRes.rows) {
          sessionMap.set(row.plan_session_id, row);
        }
      }

      const topValues: string[] = [];
      const topParams: any[] = [];
      let t = 1;
      for (const r of topRows) {
        const session = r.session_id ? sessionMap.get(r.session_id) : null;
        const est = estimate1RM(Number(r.load), Number(r.reps));
        topParams.push(
          userId,
          r.performed_at,
          r.exercise_id,
          r.load,
          r.reps,
          est,
          session?.block_id ?? null,
          session?.week_in_block ?? null,
          biasBalance,
          r.id
        );
        topValues.push(
          `($${t++}, $${t++}, $${t++}, $${t++}, $${t++}, $${t++}, $${t++}, $${t++}, $${t++}, $${t++})`
        );
      }

      const topSql = `
        insert into top_set_history
          (user_id, performed_at, exercise_id, load, reps, estimated_1rm,
           block_id, week_in_block, bias_balance_at_time, source_set_log_id)
        values
          ${topValues.join(",")}
        on conflict (source_set_log_id) do update set
          performed_at = excluded.performed_at,
          load = excluded.load,
          reps = excluded.reps,
          estimated_1rm = excluded.estimated_1rm,
          block_id = excluded.block_id,
          week_in_block = excluded.week_in_block,
          bias_balance_at_time = excluded.bias_balance_at_time
      `;

      await client.query(topSql, topParams);
    }

    if (blockId) {
      await updateCurrentBlockWeek(client, userId, blockId);
    }

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, inserted: inserted.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("set_log_insert_failed", err);
    return NextResponse.json({ error: "set_log_insert_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
