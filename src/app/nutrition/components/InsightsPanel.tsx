"use client";

import { memo } from "react";

type Insight = {
  insight_id: string;
  insight_type: "deficiency_alert" | "coaching" | "supplement";
  generated_at: string;
  recommendation_text: string;
  is_dismissed: boolean;
  context_json: Record<string, unknown>;
};

function insightTone(insightType: Insight["insight_type"]): string {
  if (insightType === "deficiency_alert") return "border-amber-700 bg-amber-950/30 text-amber-100";
  if (insightType === "supplement") return "border-purple-700 bg-purple-950/30 text-purple-100";
  return "border-sky-700 bg-sky-950/30 text-sky-100";
}

type InsightsPanelProps = {
  insights: Insight[];
  loading: boolean;
  error: string | null;
};

const InsightsPanel = memo(function InsightsPanel({ insights, loading, error }: InsightsPanelProps) {
  return (
    <div className="mt-5 rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-100">Insights</h2>
        {loading && <span className="text-xs text-gray-500">Refreshing...</span>}
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && insights.length === 0 && !loading && (
        <div className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400">
          No insights for this date yet. Log meals to generate recommendations.
        </div>
      )}

      {insights.length > 0 && (
        <ul className="space-y-2">
          {insights.map((insight) => (
            <li key={insight.insight_id}
              className={`rounded-md border px-3 py-2 text-sm ${insightTone(insight.insight_type)}`}>
              <div className="mb-1 text-[11px] uppercase tracking-wide opacity-90">
                {insight.insight_type.replace("_", " ")}
              </div>
              <p>{insight.recommendation_text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default InsightsPanel;
export type { Insight };
