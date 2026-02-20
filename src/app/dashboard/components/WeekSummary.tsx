type RollupRow = {
  week_start_date: string;
  total_sets: number;
  total_reps: number;
  total_tonnage: number;
  cardio_minutes: number;
  top_sets_count: number;
};

type WeekSummaryProps = {
  current: RollupRow | null;
  previous: RollupRow | null;
};

function trend(current: number, previous: number | null) {
  if (previous === null || previous === 0) return "";
  if (current > previous) return " \u2191";
  if (current < previous) return " \u2193";
  return " \u2192";
}

function trendColor(current: number, previous: number | null) {
  if (previous === null || previous === 0) return "text-gray-100";
  if (current > previous) return "text-green-400";
  if (current < previous) return "text-red-400";
  return "text-gray-100";
}

function StatBox({
  label,
  value,
  prev,
}: {
  label: string;
  value: number;
  prev: number | null;
}) {
  const display =
    label === "Tonnage"
      ? value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : String(Math.round(value))
      : String(value);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-2xl font-bold ${trendColor(value, prev)}`}>
        {display}
        <span className="text-base">{trend(value, prev)}</span>
      </div>
    </div>
  );
}

export default function WeekSummary({ current, previous }: WeekSummaryProps) {
  if (!current) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-500">
        No workout data this week yet.
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        This Week
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Sets" value={current.total_sets} prev={previous?.total_sets ?? null} />
        <StatBox label="Reps" value={current.total_reps} prev={previous?.total_reps ?? null} />
        <StatBox
          label="Tonnage"
          value={Math.round(current.total_tonnage)}
          prev={previous ? Math.round(previous.total_tonnage) : null}
        />
        <StatBox
          label="Cardio (min)"
          value={current.cardio_minutes}
          prev={previous?.cardio_minutes ?? null}
        />
      </div>
    </div>
  );
}
