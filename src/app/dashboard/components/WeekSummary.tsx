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
  sessionsThisWeek: number;
  targetSessions: number;
};

function trend(current: number, previous: number | null) {
  if (previous === null) return "";
  if (current > previous) return " \u2191";
  if (current < previous) return " \u2193";
  return " \u2192";
}

function trendColor(current: number, previous: number | null) {
  if (previous === null) return "text-gray-100";
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

export default function WeekSummary({ current, previous, sessionsThisWeek, targetSessions }: WeekSummaryProps) {
  const sessionColor =
    sessionsThisWeek >= targetSessions
      ? "text-green-400"
      : sessionsThisWeek >= targetSessions - 1
      ? "text-yellow-400"
      : "text-gray-100";

  if (!current) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">This Week</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* Sessions box always visible even with no rollup */}
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 sm:col-span-1">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Sessions</div>
            <div className={`text-2xl font-bold ${sessionColor}`}>
              {sessionsThisWeek}
              <span className="text-base text-gray-500"> / {targetSessions}</span>
            </div>
          </div>
          <div className="col-span-1 rounded-lg border border-dashed border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-500 sm:col-span-4 flex items-center">
            Log a session to start tracking sets, reps, tonnage, and cardio.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        This Week
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {/* Sessions vs target */}
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Sessions</div>
          <div className={`text-2xl font-bold ${sessionColor}`}>
            {sessionsThisWeek}
            <span className="text-base text-gray-500"> / {targetSessions}</span>
          </div>
        </div>
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
