import type { PoolClient } from "pg";

export type ParseMetricEndpoint = "log" | "log_preview" | "log_photo";

export async function recordParseMetric(
  client: PoolClient,
  userId: string,
  endpoint: ParseMetricEndpoint,
  parseDurationMs: number
): Promise<void> {
  await client.query(
    `INSERT INTO nutrition_parse_metrics (user_id, endpoint, parse_duration_ms)
     VALUES ($1, $2, $3)`,
    [userId, endpoint, Math.max(0, Math.round(parseDurationMs))]
  );
}

export async function readParseP95Last7Days(
  client: PoolClient,
  userId: string
): Promise<number | null> {
  const res = await client.query<{ p95_ms: number | null }>(
    `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY parse_duration_ms)::float AS p95_ms
     FROM nutrition_parse_metrics
     WHERE user_id = $1
       AND created_at >= (now() - interval '7 day')`,
    [userId]
  );

  const value = res.rows[0]?.p95_ms;
  return Number.isFinite(value) ? value : null;
}
