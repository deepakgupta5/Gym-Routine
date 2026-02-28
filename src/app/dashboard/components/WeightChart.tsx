type MetricPoint = {
  date: string;
  value: number;
};

type WeightChartProps = {
  title: string;
  points: MetricPoint[];
  unit: string;
  decimals?: number;
  countLabel?: string;
  positiveDirection?: "up" | "down";
};

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatValue(value: number, decimals: number, unit: string): string {
  const n = value.toFixed(decimals);
  return unit ? `${n} ${unit}` : n;
}

export default function WeightChart({
  title,
  points,
  unit,
  decimals = 1,
  countLabel = "entries",
  positiveDirection = "up",
}: WeightChartProps) {
  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
        <div className="text-sm font-medium text-gray-200">{title}</div>
        <div className="mt-1 text-xs text-gray-400">Not enough data</div>
      </div>
    );
  }

  const width = 280;
  const height = 60;
  const padding = 6;
  const yLabelWidth = 36;
  const plotStartX = yLabelWidth + padding;
  const plotEndX = width - padding;
  const plotWidth = plotEndX - plotStartX;

  const values = points.map((p) => p.value);
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
  const delta = latest - first;
  const isPositiveTrend =
    positiveDirection === "down" ? delta <= 0 : delta >= 0;
  const trendLineColor = isPositiveTrend ? "#22c55e" : "#ef4444";
  const seriesColor = "#60a5fa";

  const midIndex = Math.floor((points.length - 1) / 2);
  const startDate = points[0]?.date ?? "";
  const midDate = points[midIndex]?.date ?? "";
  const endDate = points[points.length - 1]?.date ?? "";
  const startX = plotStartX;
  const midX = plotStartX + (midIndex / (values.length - 1)) * plotWidth;
  const endX = plotEndX;
  const axisY = height - padding;
  const yAxisLabel = unit ? `${title} (${unit})` : title;
  const firstY = height - padding - ((first - min) / range) * (height - 2 * padding);
  const latestY = height - padding - ((latest - min) / range) * (height - 2 * padding);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-200">{title}</div>
        <div className="text-xs text-gray-400">{points.length} {countLabel}</div>
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
        <text x={1} y={padding + 2} fill="#94a3b8" fontSize="8">{max.toFixed(decimals)}</text>
        <text x={1} y={(padding + axisY) / 2 + 2} fill="#64748b" fontSize="8">{mid.toFixed(decimals)}</text>
        <text x={1} y={axisY} fill="#94a3b8" fontSize="8">{min.toFixed(decimals)}</text>
        <line x1={startX} y1={axisY} x2={startX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
        <line x1={midX} y1={axisY} x2={midX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
        <line x1={endX} y1={axisY} x2={endX} y2={axisY - 5} stroke="#64748b" strokeWidth="1" />
        <line
          x1={startX}
          y1={firstY}
          x2={endX}
          y2={latestY}
          stroke={trendLineColor}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={seriesColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span>Y-axis: {yAxisLabel}</span>
        <span>X-axis: Date</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Start: {formatShortDate(startDate)}</span>
        <span>Mid: {formatShortDate(midDate)}</span>
        <span>Current: {formatShortDate(endDate)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Current: {formatValue(latest, decimals, unit)}</span>
        <span>
          Range: {formatValue(min, decimals, unit)}&ndash;{formatValue(max, decimals, unit)}
        </span>
      </div>
    </div>
  );
}
