// PRD Section 6.3: weekly muscle volume bars.
// One horizontal bar per muscle group, colored by zone:
//   orange  = below minimum
//   green   = at or above minimum (up to 1.5x min)
//   blue    = high volume (> 1.5x min)
// Bar scale: 0..2x min fills 0..100%.
// Minimum threshold tick always at 50% (= min / (2*min)).
// Each row links to /history?muscle=<muscle> for future drill-down.

import Link from "next/link";

const MUSCLE_LABELS: Record<string, string> = {
  quads:      "Quads",
  hamstrings: "Hamstrings",
  glutes:     "Glutes",
  chest:      "Chest",
  back:       "Back",
  shoulders:  "Shoulders",
  biceps:     "Biceps",
  triceps:    "Triceps",
  calves:     "Calves",
};

type MuscleVolumeRow = {
  muscle: string;
  sets:   number;
  min:    number;
};

function barColorClass(sets: number, min: number): string {
  if (sets === 0)          return "bg-gray-700";
  if (sets < min)          return "bg-orange-500";
  if (sets >= min * 1.5)   return "bg-blue-400";
  return "bg-green-500";
}

function zoneLabel(sets: number, min: number): string {
  if (sets < min)        return "under";
  if (sets >= min * 1.5) return "high";
  return "good";
}

export default function MuscleVolumeCard({ rows }: { rows: MuscleVolumeRow[] }) {
  // Most under-represented first (largest deficit fraction at top),
  // then in-range, then high-volume.
  const sorted = [...rows].sort((a, b) => {
    const defA = (a.min - a.sets) / a.min; // positive = deficit; negative = surplus
    const defB = (b.min - b.sets) / b.min;
    return defB - defA;
  });

  const anyData = sorted.some((r) => r.sets > 0);

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        Weekly Muscle Volume
      </h2>
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
        {!anyData && (
          <p className="py-4 text-center text-sm text-gray-500">
            No sets logged this week yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {sorted.map(({ muscle, sets, min }) => {
            const barMax  = min * 2;
            const fillPct = Math.min((sets / barMax) * 100, 100);
            // Tick sits at the minimum threshold (always 50% of barMax).
            const tickPct = 50;
            const color   = barColorClass(sets, min);
            const zone    = zoneLabel(sets, min);
            const label   = MUSCLE_LABELS[muscle] ?? muscle;

            return (
              <Link
                key={muscle}
                href={`/history?muscle=${encodeURIComponent(muscle)}`}
                className="group flex items-center gap-2.5"
              >
                {/* Muscle label */}
                <span className="w-[4.5rem] shrink-0 text-xs text-gray-300 group-hover:text-gray-100 transition-colors">
                  {label}
                </span>

                {/* Bar track */}
                <div
                  className="relative flex-1 h-2.5 rounded-full bg-gray-800 overflow-hidden"
                  title={`${sets} sets (target: ${min})`}
                >
                  {/* Colored fill */}
                  {sets > 0 && (
                    <div
                      className={`absolute left-0 top-0 h-full ${color} transition-[width] duration-300`}
                      style={{ width: `${fillPct}%` }}
                    />
                  )}
                  {/* Minimum threshold tick (always rendered) */}
                  <div
                    className="absolute top-0 h-full w-px bg-white/30 z-10"
                    style={{ left: `${tickPct}%` }}
                  />
                </div>

                {/* Sets / min counter */}
                <span
                  className={`w-[3.75rem] shrink-0 text-right text-xs tabular-nums ${
                    zone === "under"
                      ? "text-orange-400"
                      : zone === "high"
                      ? "text-blue-400"
                      : "text-green-400"
                  }`}
                >
                  {sets}&thinsp;/&thinsp;{min}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-800 pt-3">
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block h-2 w-4 rounded-full bg-orange-500" /> Under target
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block h-2 w-4 rounded-full bg-green-500" /> On track
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block h-2 w-4 rounded-full bg-blue-400" /> High volume
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block h-2 w-px bg-white/30" style={{height: 8}} /> Min target
          </span>
        </div>

        <p className="mt-2 text-[10px] text-gray-600">
          Rolling 7-day window -- tap a row to view history
        </p>
      </div>
    </div>
  );
}
