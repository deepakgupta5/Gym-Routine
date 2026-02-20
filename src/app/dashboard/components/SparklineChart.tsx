type Point = {
  performed_at: string;
  estimated_1rm: number;
};

type SparklineChartProps = {
  label: string;
  points: Point[];
};

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
  const trendFlat = latest === first;
  const strokeColor = trendFlat ? "#9ca3af" : trendUp ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="text-sm font-medium text-gray-200">{label}</div>
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
        <span>Est 1RM: {Math.round(latest)} lb</span>
        <span>
          {trendFlat ? "\u2192" : trendUp ? "\u2191" : "\u2193"}{" "}
          {Math.abs(Math.round(latest - first))} lb
        </span>
      </div>
    </div>
  );
}
