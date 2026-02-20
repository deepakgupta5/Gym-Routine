type AdaptiveStatusBadgeProps = {
  weightTrendClass: string;
  biasBalance: number;
  adaptiveEnabled: boolean;
  pendingCardioRule: unknown | null;
  lbsPerWeek: number;
};

function trendBadge(trendClass: string) {
  switch (trendClass) {
    case "up":
      return { label: "Gaining", bg: "bg-amber-950/60", border: "border-amber-700", text: "text-amber-300" };
    case "down":
      return { label: "Losing", bg: "bg-green-950/60", border: "border-green-700", text: "text-green-300" };
    default:
      return { label: "Maintaining", bg: "bg-gray-800", border: "border-gray-600", text: "text-gray-300" };
  }
}

function biasLabel(balance: number) {
  if (balance > 0) return `Upper bias +${balance}`;
  if (balance < 0) return `Lower bias ${balance}`;
  return "Balanced (0)";
}

export default function AdaptiveStatusBadge({
  weightTrendClass,
  biasBalance,
  adaptiveEnabled,
  pendingCardioRule,
  lbsPerWeek,
}: AdaptiveStatusBadgeProps) {
  const badge = trendBadge(weightTrendClass);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        Adaptive Status
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badge.bg} ${badge.border} ${badge.text}`}
        >
          {badge.label}
        </span>
        {adaptiveEnabled ? (
          <span className="rounded-full border border-green-700 bg-green-950/60 px-2.5 py-1 text-xs font-medium text-green-300">
            Active
          </span>
        ) : (
          <span className="rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-400">
            Inactive
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
        <div>
          Trend: {lbsPerWeek >= 0 ? "+" : ""}
          {lbsPerWeek.toFixed(2)} lb/wk
        </div>
        <div>{biasLabel(biasBalance)}</div>
      </div>
      {pendingCardioRule != null && (
        <div className="mt-2 rounded-md border border-amber-700 bg-amber-950/40 px-2 py-1 text-xs text-amber-300">
          Pending cardio adjustment at next regeneration
        </div>
      )}
    </div>
  );
}
