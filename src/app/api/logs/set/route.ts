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
import { logError } from "@/lib/logger";

type AllowedSetType = "top" | "backoff";
type ExerciseRole = "primary" | "secondary" | "accessory";

const ALLOWED_SET_TYPES: readonly AllowedSetType[] = ["top", "backoff"];

function isAllowedSetType(value: unknown): value is AllowedSetType {
  return typeof value === "string" && ALLOWED_SET_TYPES.includes(value as AllowedSetType);
}

function isExerciseRole(value: unknown): value is ExerciseRole {
  return value === "primary" || value === "secondary" || value === "accessory";
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
  role?: ExerciseRole;
  is_primary?: boolean;
  is_secondary?: boolean;
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredNumber(obj: Record<string, unknown>, key: string, label: string) {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a number`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string, label: string) {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string`);
  }
  return value;
}

function optionalNullableString(obj: Record<string, unknown>, key: string, label: string) {
  const value = obj[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new Error(`${label}.${key} must be a string or null`);
  }
  return value;
}

function optionalBoolean(obj: Record<string, unknown>, key: string, label: string) {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean`);
  }
  return value;
}

function optionalNumberOrNull(obj: Record<string, unknown>, key: string, label: string) {
  const value = obj[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a number or null`);
  }
  return value;
}

function parseSetLogInput(rawInput: unknown, index: number): SetLogInput {
  const label = `sets[${index}]`;
  const raw = asObject(rawInput, label);

  const setType = raw.set_type;
  if (!isAllowedSetType(setType)) {
    throw new Error(`${label}.set_type must be one of: ${ALLOWED_SET_TYPES.join(", ")}`);
  }

  const role = raw.role;
  if (role !== undefined && !isExerciseRole(role)) {
    throw new Error(`${label}.role must be primary, secondary, or accessory`);
  }

  return {
    performed_at: optionalString(raw, "performed_at", label),
    session_id: optionalNullableString(raw, "session_id", label),
    exercise_id: requiredNumber(raw, "exercise_id", label),
    movement_pattern: optionalString(raw, "movement_pattern", label),
    targeted_primary_muscle: optionalString(raw, "targeted_primary_muscle", label),
    targeted_secondary_muscle: optionalNullableString(raw, "targeted_secondary_muscle", label),
    set_type: setType,
    set_index: requiredNumber(raw, "set_index", label),
    load: requiredNumber(raw, "load", label),
    reps: requiredNumber(raw, "reps", label),
    rpe: optionalNumberOrNull(raw, "rpe", label),
    notes: optionalNullableString(raw, "notes", label),
    role,
    is_primary: optionalBoolean(raw, "is_primary", label),
    is_secondary: optionalBoolean(raw, "is_secondary", label),
  };
}

function normalizeBody(body: unknown): SetLogInput[] {
  if (!body) return [];

  const rawSets = Array.isArray(body)
    ? body
    : (() => {
        const obj = asObject(body, "body");
        return Array.isArray(obj.sets) ? obj.sets : [obj];
      })();

  if (rawSets.length === 0) return [];

  return rawSets.map((entry, idx) => parseSetLogInput(entry, idx));
}

function validateSetValues(sets: SetLogInput[]) {
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const label = `sets[${i}]`;

    if (!Number.isInteger(s.exercise_id) || s.exercise_id <= 0) {
      return `${label}.exercise_id must be a positive integer`;
    }

    if (!Number.isInteger(s.set_index) || s.set_index <= 0) {
      return `${label}.set_index must be a positive integer`;
    }

    if (!Number.isFinite(s.load) || s.load <= 0 || s.load > 2000) {
      return `${label}.load must be > 0 and <= 2000`;
    }

    if (!Number.isInteger(s.reps) || s.reps <= 0 || s.reps > 200) {
      return `${label}.reps must be a positive integer <= 200`;
    }
  }

  return null;
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const body = await req.json().catch(() => null);

    let sets: SetLogInput[];
    try {
      sets = normalizeBody(body);
    } catch (err) {
      return NextResponse.json(
        { error: "invalid_body", detail: err instanceof Error ? err.message : "invalid request body" },
        { status: 400 }
      );
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "no_sets" }, { status: 400 });
    }

    if (sets.some((set) => !isAllowedSetType(set.set_type))) {
      return NextResponse.json(
        { error: "invalid_set_type", allowed_set_types: ALLOWED_SET_TYPES },
        { status: 400 }
      );
    }

    const valueError = validateSetValues(sets);
    if (valueError) {
      return NextResponse.json({ error: "invalid_set_values", detail: valueError }, { status: 400 });
    }

    await client.query("BEGIN");

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

    const referencedExerciseIds = Array.from(
      new Set(sets.map((s) => s.exercise_id).filter((id) => Number.isInteger(id) && id > 0))
    );

    const exerciseRes = await client.query(
      `select exercise_id, movement_pattern, default_targeted_primary_muscle, default_targeted_secondary_muscle
       from exercises
       where exercise_id = any($1::int[])`,
      [referencedExerciseIds]
    );

    const exerciseById = new Map<number, any>(
      exerciseRes.rows.map((row: any) => [Number(row.exercise_id), row])
    );

    const invalidExerciseIds = referencedExerciseIds.filter((id) => !exerciseById.has(id));
    if (invalidExerciseIds.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: "invalid_exercise_ids",
          invalid_exercise_ids: invalidExerciseIds.sort((a, b) => a - b),
        },
        { status: 400 }
      );
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
           from plan_sessions where plan_session_id = any($1)`,
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
    logError("set_log_insert_failed", err, { user_id: userId });
    return NextResponse.json({ error: "set_log_insert_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
