type Point = {
  performed_at: string;
  estimated_1rm: number;
};

type SparklineChartProps = {
  label: string;
  points: Point[];
};

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSpan(start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "time span";

  const days = Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1);
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;

  if (weeks > 0 && remDays > 0) return `${weeks}w ${remDays}d span`;
  if (weeks > 0) return `${weeks}w span`;
  return `${days}d span`;
}

export default function SparklineChart({ label, points }: SparklineChartProps) {
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="mt-1 text-xs text-gray-500">Not enough data</div>
      </div>
    );
  }

  const width = 280;
  const height = 60;
  const padding = 6;

  const values = points.map((p) => p.estimated_1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const polylinePoints = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((v - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(" ");

  const latest = values[values.length - 1];
  const first = values[0];
  const trendUp = latest > first;
  const startDate = points[0]?.performed_at ?? "";
  const endDate = points[points.length - 1]?.performed_at ?? "";
  const trendFlat = latest === first;
  const strokeColor = trendFlat ? "#9ca3af" : trendUp ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="text-[11px] text-gray-500">{points.length} sessions</div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-1 w-full"
        style={{ maxHeight: height }}
        preserveAspectRatio="none"
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span>{formatShortDate(startDate)}</span>
        <span>{formatSpan(startDate, endDate)}</span>
        <span>{formatShortDate(endDate)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Est 1RM: {Math.round(latest)} lb</span>
        <span>
          {trendFlat ? "\u2192" : trendUp ? "\u2191" : "\u2193"}{" "}
          {Math.abs(Math.round(latest - first))} lb
        </span>
      </div>
    </div>
  );
}
