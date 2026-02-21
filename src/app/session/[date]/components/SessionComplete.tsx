import { ExerciseView, SetLogView } from "./types";

type SessionCompleteProps = {
  exercises: ExerciseView[];
  logs: SetLogView[];
};

export default function SessionComplete({ exercises, logs }: SessionCompleteProps) {
  const totalSets = logs.length;
  const tonnage = logs.reduce((sum, l) => sum + Number(l.load) * l.reps, 0);

  // Primary lift highlight: highest load top set for a primary exercise
  const primaryIds = new Set(
    exercises.filter((e) => e.role === "primary").map((e) => e.exercise_id)
  );
  const primaryLogs = logs
    .filter((l) => primaryIds.has(l.exercise_id) && l.set_type === "top")
    .sort((a, b) => Number(b.load) - Number(a.load));
  const primaryHighlight = primaryLogs[0] ?? null;
  const primaryName = primaryHighlight
    ? exercises.find((e) => e.exercise_id === primaryHighlight.exercise_id)?.name ?? null
    : null;

  return (
    <div className="rounded-xl border border-green-700 bg-green-950/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-green-300">✓</span>
        <span className="text-sm font-semibold text-green-200">Session Complete</span>
        <span className="text-sm text-gray-400">
          — {totalSets} sets · {tonnage >= 1000 ? `${(tonnage / 1000).toFixed(1)}k` : Math.round(tonnage)} lb
        </span>
      </div>
      {primaryHighlight && primaryName && (
        <div className="mt-1 text-xs text-gray-400">
          Top lift: {primaryName} {primaryHighlight.load} lb × {primaryHighlight.reps}
        </div>
      )}
    </div>
  );
}
