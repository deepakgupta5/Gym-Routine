import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { parseBodyStatsXlsxWithReport } from "@/lib/adaptive/parseExcel";
import { computeAdaptiveState } from "@/lib/adaptive/computeAdaptive";
import { logError } from "@/lib/logger";

function parseBiasState(input: any) {
  if (!input || typeof input !== "string") return {};
  try {
    const obj = JSON.parse(input);
    if (obj && typeof obj === "object" && obj.bias_state) return obj.bias_state;
    return {};
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", max_bytes: MAX_UPLOAD_BYTES },
      { status: 413 }
    );
  }

  const buffer = await file.arrayBuffer();
  const parsed = parseBodyStatsXlsxWithReport(buffer);
  const rows = parsed.rows;

  if (rows.length === 0) {
    return NextResponse.json({ error: "no_rows" }, { status: 400 });
  }

  const pool = await getDb();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const profileRes = await client.query(
      "select bias_balance, block_id, adaptive_enabled from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const profile = profileRes.rows[0];
    const biasBalance = profile.bias_balance ?? 0;
    const blockId = profile.block_id ?? null;

    if (!blockId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "no_block" }, { status: 400 });
    }

    const blockRes = await client.query(
      "select pending_reason from blocks where block_id = $1",
      [blockId]
    );
    const biasState = parseBiasState(blockRes.rows[0]?.pending_reason);

    const uploadId = crypto.randomUUID();

    const values: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const r of rows) {
      params.push(
        userId,
        r.date,
        r.weight_lb,
        r.bodyfat_pct,
        r.upper_pct,
        r.lower_pct,
        uploadId
      );
      values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    }

    await client.query(
      `insert into body_stats_daily
        (user_id, date, weight_lb, bodyfat_pct, upper_pct, lower_pct, source_upload_id)
       values ${values.join(",")}
       on conflict (user_id, date) do update set
         weight_lb = excluded.weight_lb,
         bodyfat_pct = excluded.bodyfat_pct,
         upper_pct = excluded.upper_pct,
         lower_pct = excluded.lower_pct,
         source_upload_id = excluded.source_upload_id,
         updated_at = now()`,
      params
    );

    const historyRes = await client.query(
      `select date::text as date, weight_lb, bodyfat_pct, upper_pct, lower_pct
       from body_stats_daily
       where user_id = $1`,
      [userId]
    );

    const adaptive = computeAdaptiveState(
      historyRes.rows,
      biasBalance,
      biasState
    );

    const hasPendingAtNextRegeneration =
      adaptive.weight_gate_pass &&
      (adaptive.updated_bias_balance !== biasBalance ||
        adaptive.pending_cardio_rule !== null);

    const pending = hasPendingAtNextRegeneration
      ? {
          weight_trend_class: adaptive.weight_trend_class,
          weight_trend_lbs_per_week: adaptive.weight_trend_lbs_per_week,
          segment_signal: adaptive.segment_signal,
          segment_delta_pp: adaptive.segment_delta_pp,
          bias_delta: adaptive.bias_delta,
          bias_state: {
            neutral_streak: adaptive.neutral_streak,
            flat_streak: adaptive.flat_streak,
          },
          gates: {
            weight_gate_pass: adaptive.weight_gate_pass,
            bf_gate_pass: adaptive.bf_gate_pass,
            segment_gate_pass: adaptive.segment_gate_pass,
          },
        }
      : null;

    await client.query(
      `update blocks
       set pending_bias_balance = $1,
           pending_cardio_rule = $2::jsonb,
           pending_reason = $3,
           pending_computed_at = $4::timestamptz
       where block_id = $5`,
      [
        hasPendingAtNextRegeneration ? adaptive.updated_bias_balance : null,
        hasPendingAtNextRegeneration && adaptive.pending_cardio_rule
          ? JSON.stringify(adaptive.pending_cardio_rule)
          : null,
        pending ? JSON.stringify(pending) : null,
        hasPendingAtNextRegeneration ? new Date().toISOString() : null,
        blockId,
      ]
    );

    await client.query(
      `update user_profile
       set adaptive_enabled = $1,
           updated_at = now()
       where user_id = $2`,
      [adaptive.adaptive_enabled, userId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      rows_upserted: rows.length,
      warnings: parsed.warnings,
      adaptive,
      pending_at_next_regeneration: hasPendingAtNextRegeneration,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("body_stats_upload_failed", err, { user_id: userId });
    return NextResponse.json({ error: "body_stats_upload_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
