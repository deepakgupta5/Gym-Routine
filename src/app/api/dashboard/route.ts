import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/pg";
import { CONFIG, requireConfig } from "@/lib/config";
import { computeAdaptiveState } from "@/lib/adaptive/computeAdaptive";
import { normalizePrimaryLiftMap } from "@/lib/engine/rotation";

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

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  requireConfig();
  const userId = CONFIG.SINGLE_USER_ID;
  const pool = await getDb();
  const client = await pool.connect();

  try {
    const profileRes = await client.query(
      "select bias_balance, adaptive_enabled, block_id, primary_lift_map from user_profile where user_id = $1",
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const profile = profileRes.rows[0];

    const blockRes = profile?.block_id
      ? await client.query(
          `select pending_bias_balance, pending_cardio_rule, pending_reason, pending_computed_at
           from blocks where block_id = $1`,
          [profile.block_id]
        )
      : { rows: [] };

    const block = blockRes.rows[0] ?? null;

    const bodyRes = await client.query(
      `select date::text as date, weight_lb, bodyfat_pct, upper_pct, lower_pct
       from body_stats_daily
       where user_id = $1
       order by date asc`,
      [userId]
    );

    const adaptive = computeAdaptiveState(
      bodyRes.rows,
      profile?.bias_balance ?? 0,
      parseBiasState(block?.pending_reason)
    );

    const rollupsRes = await client.query(
      `select * from weekly_rollups
       where user_id = $1
       order by week_start_date desc
       limit 12`,
      [userId]
    );

    const topSetRes = await client.query(
      `select performed_at, exercise_id, load, reps, estimated_1rm
       from top_set_history
       where user_id = $1
       order by performed_at desc
       limit 20`,
      [userId]
    );

    const primaryLiftIds = profile
      ? Array.from(
          new Set(
            Object.values(normalizePrimaryLiftMap(profile.primary_lift_map))
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v))
          )
        )
      : [];

    const primaryLiftMetaRes =
      primaryLiftIds.length > 0
        ? await client.query(
            `select exercise_id, name
             from exercises
             where exercise_id = any($1::int[])
             order by exercise_id asc`,
            [primaryLiftIds]
          )
        : { rows: [] };

    const primaryTopSetsRes =
      primaryLiftIds.length > 0
        ? await client.query(
            `select tsh.performed_at::text as performed_at,
                    tsh.exercise_id,
                    tsh.load,
                    tsh.reps,
                    tsh.estimated_1rm
             from top_set_history tsh
             where tsh.user_id = $1
               and tsh.exercise_id = any($2::int[])
             order by tsh.exercise_id asc, tsh.performed_at asc`,
            [userId, primaryLiftIds]
          )
        : { rows: [] };

    const seriesByExercise = new Map<
      number,
      {
        exercise_id: number;
        exercise_name: string;
        points: Array<{ performed_at: string; estimated_1rm: number; load: number; reps: number }>;
      }
    >();

    for (const row of primaryLiftMetaRes.rows) {
      seriesByExercise.set(Number(row.exercise_id), {
        exercise_id: Number(row.exercise_id),
        exercise_name: String(row.name),
        points: [],
      });
    }

    for (const row of primaryTopSetsRes.rows) {
      const exerciseId = Number(row.exercise_id);
      if (!seriesByExercise.has(exerciseId)) {
        seriesByExercise.set(exerciseId, {
          exercise_id: exerciseId,
          exercise_name: `Exercise ${exerciseId}`,
          points: [],
        });
      }

      seriesByExercise.get(exerciseId)!.points.push({
        performed_at: String(row.performed_at),
        estimated_1rm: Number(row.estimated_1rm),
        load: Number(row.load),
        reps: Number(row.reps),
      });
    }

    const oneRmSeriesByPrimaryLift = Array.from(seriesByExercise.values()).sort(
      (a, b) => a.exercise_id - b.exercise_id
    );

    const pendingAtNextRegeneration = Boolean(
      block &&
        (block.pending_bias_balance !== null ||
          block.pending_cardio_rule !== null ||
          block.pending_reason !== null)
    );

    const lastUploadDate =
      bodyRes.rows.length > 0 ? bodyRes.rows[bodyRes.rows.length - 1].date : null;

    const uploadReminder = lastUploadDate
      ? `Last upload: ${lastUploadDate} - pending updates will apply at next regeneration.`
      : "Last upload: none - pending updates will apply at next regeneration.";

    // Nutrition summary merged into dashboard payload
    const today = todayUtcIso();

    const [nutritionGoalsRes, nutritionRollupRes, nutritionSevenDayRes] = await Promise.all([
      client.query<{ target_calories: number; target_protein_g: number }>(
        `select
           target_calories::float as target_calories,
           target_protein_g::float as target_protein_g
         from nutrition_goals_daily
         where user_id = $1 and goal_date = $2`,
        [userId, today]
      ),
      client.query<{ total_calories: number; total_protein_g: number }>(
        `select
           total_calories::float as total_calories,
           total_protein_g::float as total_protein_g
         from daily_nutrition_rollups
         where user_id = $1 and rollup_date = $2`,
        [userId, today]
      ),
      client.query<{ total_calories: number; total_protein_g: number; target_calories: number }>(
        `select
           dnr.total_calories::float as total_calories,
           dnr.total_protein_g::float as total_protein_g,
           coalesce(ngd.target_calories, 2050)::float as target_calories
         from daily_nutrition_rollups dnr
         left join nutrition_goals_daily ngd
           on ngd.user_id = dnr.user_id
          and ngd.goal_date = dnr.rollup_date
         where dnr.user_id = $1
           and dnr.rollup_date >= ($2::date - interval '6 day')
           and dnr.rollup_date <= $2::date`,
        [userId, today]
      ),
    ]);

    const targetCalories = Number(nutritionGoalsRes.rows[0]?.target_calories ?? 2050);
    const targetProtein = Number(nutritionGoalsRes.rows[0]?.target_protein_g ?? 160);
    const totalCalories = Number(nutritionRollupRes.rows[0]?.total_calories ?? 0);
    const totalProtein = Number(nutritionRollupRes.rows[0]?.total_protein_g ?? 0);

    const adherencePct =
      targetCalories > 0 ? Math.min(100, Math.round((totalCalories / targetCalories) * 100)) : 0;

    const sevenRows = nutritionSevenDayRes.rows;
    const sevenLoggedDays = sevenRows.length;
    const sevenAvgCalories =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => sum + Number(row.total_calories), 0) / sevenRows.length
        : 0;
    const sevenAvgProtein =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => sum + Number(row.total_protein_g), 0) / sevenRows.length
        : 0;
    const sevenAvgAdherence =
      sevenRows.length > 0
        ? sevenRows.reduce((sum, row) => {
            const dayTarget = Number(row.target_calories);
            if (dayTarget <= 0) return sum;
            return sum + Math.min(100, (Number(row.total_calories) / dayTarget) * 100);
          }, 0) / sevenRows.length
        : 0;

    const nutritionSummary = {
      date: today,
      totals: {
        calories: totalCalories,
        protein_g: totalProtein,
      },
      targets: {
        calories: targetCalories,
        protein_g: targetProtein,
      },
      adherence_pct: adherencePct,
      seven_day: {
        avg_calories: sevenAvgCalories,
        avg_protein_g: sevenAvgProtein,
        avg_adherence_pct: sevenAvgAdherence,
        logged_days: sevenLoggedDays,
      },
    };

    return NextResponse.json({
      ok: true,
      profile,
      pending: block,
      pending_at_next_regeneration: pendingAtNextRegeneration,
      adaptive,
      rollups: rollupsRes.rows,
      weekly_rollups: rollupsRes.rows,
      top_sets: topSetRes.rows,
      one_rm_series_primary_lifts: oneRmSeriesByPrimaryLift,
      body_stats: bodyRes.rows,
      last_upload_date: lastUploadDate,
      upload_reminder: uploadReminder,
      nutrition_summary: nutritionSummary,
    });
  } finally {
    client.release();
  }
}
