import type { PoolClient } from "pg";
import { computeBlockProgressFromSessions } from "@/lib/engine/block";
import { PlanSessionRow } from "@/lib/engine/schedule";

export async function computeBlockProgress(
  client: PoolClient,
  userId: string,
  blockId: string
) {
  const res = await client.query<{
    plan_session_id: string;
    date: string;
    session_type: PlanSessionRow["session_type"];
    is_required: boolean;
    performed_at: string | null;
    week_in_block: number;
  }>(
    `select plan_session_id, date, session_type, is_required, performed_at, week_in_block
     from plan_sessions
     where user_id = $1 and block_id = $2`,
    [userId, blockId]
  );

  const sessions: PlanSessionRow[] = res.rows.map((r) => ({
    plan_session_id: r.plan_session_id,
    date: r.date,
    session_type: r.session_type,
    is_required: r.is_required,
    performed_at: r.performed_at,
    week_in_block: r.week_in_block,
  }));

  return computeBlockProgressFromSessions(sessions);
}

export async function updateCurrentBlockWeek(
  client: PoolClient,
  userId: string,
  blockId: string
) {
  const progress = await computeBlockProgress(client, userId, blockId);

  await client.query(
    `update user_profile
     set current_block_week = $1, updated_at = now()
     where user_id = $2`,
    [progress.currentBlockWeek, userId]
  );

  return progress;
}
