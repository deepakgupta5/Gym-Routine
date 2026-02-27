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

export default function SparklineChart({ label, points }: SparklineChartProps) {
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="mt-1 text-xs text-gray-400">Not enough data</div>
      </div>
    );
  }

  const width = 280;
  const height = 60;
  const padding = 6;
  const yLabelWidth = 32;
  const plotStartX = yLabelWidth + padding;
  const plotEndX = width - padding;
  const plotWidth = plotEndX - plotStartX;

  const values = points.map((p) => p.estimated_1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = min + (max - min) / 2;
  const range = max - min || 1;

  const polylinePoints = values
    .map((v, i) => {
      const x = plotStartX + (i / (values.length - 1)) * plotWidth;
      const y = height - padding - ((v - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    })
    .join(" ");

  const latest = values[values.length - 1];
  const first = values[0];
  const trendUp = latest > first;
  const midIndex = Math.floor((points.length - 1) / 2);
  const startDate = points[0]?.performed_at ?? "";
  const midDate = points[midIndex]?.performed_at ?? "";
  const endDate = points[points.length - 1]?.performed_at ?? "";
  const startX = plotStartX;
  const midX = plotStartX + (midIndex / (values.length - 1)) * plotWidth;
  const endX = plotEndX;
  const axisY = height - padding;
  const trendFlat = latest === first;
  const strokeColor = trendFlat ? "#9ca3af" : trendUp ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="text-xs text-gray-400">{points.length} sessions</div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-1 w-full"
        style={{ maxHeight: height }}
        preserveAspectRatio="none"
      >
        <line x1={startX} y1={padding} x2={endX} y2={padding} stroke="#1f2937" strokeWidth="1" />
        <line x1={startX} y1={(padding + axisY) / 2} x2={endX} y2={(padding + axisY) / 2} stroke="#1f2937" strokeWidth="1" />
        <line x1={startX} y1={axisY} x2={endX} y2={axisY} stroke="#334155" strokeWidth="1" />
        <line x1={startX} y1={padding} x2={startX} y2={axisY} stroke="#334155" strokeWidth="1" />
        <text x={1} y={padding + 2} fill="#94a3b8" fontSize="8">{Math.round(max)}</text>
        <text x={1} y={(padding + axisY) / 2 + 2} fill="#64748b" fontSize="8">{Math.round(mid)}</text>
        <text x={1} y={axisY} fill="#94a3b8" fontSize="8">{Math.round(min)}</text>
        <line x1={startX} y1={axisY} x2={startX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
        <line x1={midX} y1={axisY} x2={midX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
        <line x1={endX} y1={axisY} x2={endX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
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
        <span>X-axis: Date</span>
        <span>Y-axis: Est 1RM (lb)</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Start: {formatShortDate(startDate)}</span>
        <span>Mid: {formatShortDate(midDate)}</span>
        <span>Current: {formatShortDate(endDate)}</span>
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
