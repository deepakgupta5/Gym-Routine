type WeightPoint = {
  date: string;
  weight_lb: number;
};

type WeightChartProps = {
  points: WeightPoint[];
  trendClass: string;
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

export default function WeightChart({ points, trendClass }: WeightChartProps) {
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
        <div className="text-sm font-medium text-gray-200">Body Weight</div>
        <div className="mt-1 text-xs text-gray-400">Not enough data</div>
      </div>
    );
  }

  const width = 280;
  const height = 60;
  const padding = 6;

  const values = points.map((p) => p.weight_lb);
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

  const strokeColor =
    trendClass === "down" ? "#22c55e" : trendClass === "up" ? "#f59e0b" : "#9ca3af";

  const latest = values[values.length - 1];
  const startDate = points[0]?.date ?? "";
  const endDate = points[points.length - 1]?.date ?? "";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">Body Weight</div>
        <div className="text-xs text-gray-400">{points.length} weigh-ins</div>
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
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>{formatShortDate(startDate)}</span>
        <span>{formatSpan(startDate, endDate)}</span>
        <span>{formatShortDate(endDate)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Current: {latest.toFixed(1)} lb</span>
        <span>
          Range: {min.toFixed(1)}&ndash;{max.toFixed(1)} lb
        </span>
      </div>
    </div>
  );
}
