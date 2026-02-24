import type { PoolClient } from "pg";
import { computeRollupFromSets, getWeekRangeUtc, type SetLogRow } from "@/lib/db/rollups";

export async function recomputeSessionPerformed(
  client: PoolClient,
  sessionId: string
): Promise<string | null> {
  const sql = `
    with s as (
      select ps.plan_session_id,
        case
          when ps.session_type = 'Fri' then (
            select min(sl.performed_at)
            from set_logs sl
            where sl.session_id = ps.plan_session_id
          )
          else (
            select min(sl.performed_at)
            from set_logs sl
            where sl.session_id = ps.plan_session_id
              and sl.set_type = 'top'
          )
        end as new_performed_at
      from plan_sessions ps
      where ps.plan_session_id = $1
    )
    update plan_sessions ps
    set performed_at = s.new_performed_at
    from s
    where ps.plan_session_id = s.plan_session_id
    returning ps.performed_at;
  `;

  const res = await client.query<{ performed_at: string | null }>(sql, [sessionId]);
  return res.rows[0]?.performed_at ?? null;
}

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function recomputeWeeklyRollup(
  client: PoolClient,
  userId: string,
  weekStart: string
) {
  const { start, end } = getWeekRangeUtc(weekStart);
  const endDate = toDateString(end);

  const setsRes = await client.query<{
    performed_at: string;
    load: number | string;
    reps: number | string;
    set_type: string;
    targeted_primary_muscle: string;
  }>(
    `select performed_at, load, reps, set_type, targeted_primary_muscle
     from set_logs
     where user_id = $1 and performed_at >= $2 and performed_at < $3`,
    [userId, start.toISOString(), end.toISOString()]
  );

  const rows: SetLogRow[] = setsRes.rows.flatMap((row) => {
    if (
      row.set_type !== "top" &&
      row.set_type !== "backoff" &&
      row.set_type !== "straight" &&
      row.set_type !== "accessory"
    ) {
      return [];
    }

    return [{
      performed_at: row.performed_at,
      load: Number(row.load),
      reps: Number(row.reps),
      set_type: row.set_type,
      targeted_primary_muscle: row.targeted_primary_muscle,
    }];
  });

  const rollup = computeRollupFromSets(rows);

  const cardioRes = await client.query<{ cardio_minutes: number | string }>(
    `select
       coalesce(sum(cardio_minutes), 0)::int as cardio_minutes
     from plan_sessions
     where user_id = $1
       and date >= $2::date
       and date < $3::date
       and cardio_saved_at is not null`,
    [userId, weekStart, endDate]
  );

  const cardioMinutes = Number(cardioRes.rows[0]?.cardio_minutes ?? 0);
  await client.query(
    `insert into weekly_rollups
       (user_id, week_start_date, total_sets, total_reps, total_tonnage,
        sets_by_muscle, tonnage_by_muscle, top_sets_by_muscle, top_sets_count,
        cardio_minutes, updated_at)
     values
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (user_id, week_start_date)
     do update set
       total_sets = excluded.total_sets,
       total_reps = excluded.total_reps,
       total_tonnage = excluded.total_tonnage,
       sets_by_muscle = excluded.sets_by_muscle,
       tonnage_by_muscle = excluded.tonnage_by_muscle,
       top_sets_by_muscle = excluded.top_sets_by_muscle,
       top_sets_count = excluded.top_sets_count,
       cardio_minutes = excluded.cardio_minutes,
       updated_at = now()`,
    [
      userId,
      weekStart,
      rollup.total_sets,
      rollup.total_reps,
      rollup.total_tonnage,
      JSON.stringify(rollup.sets_by_muscle),
      JSON.stringify(rollup.tonnage_by_muscle),
      JSON.stringify(rollup.top_sets_by_muscle),
      rollup.top_sets_count,
      cardioMinutes,
    ]
  );
}

export function getWeekStartFromTimestamp(ts: string): string {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function computePerformedAtFromSets(
  sessionType: string,
  rows: Array<{ performed_at: string; set_type: string }>
) {
  if (rows.length === 0) return null;
  const filtered =
    sessionType === "Fri"
      ? rows
      : rows.filter((r) => r.set_type === "top");
  if (filtered.length === 0) return null;
  const min = filtered
    .map((r) => new Date(r.performed_at).getTime())
    .reduce((a, b) => Math.min(a, b));
  return new Date(min).toISOString();
}
