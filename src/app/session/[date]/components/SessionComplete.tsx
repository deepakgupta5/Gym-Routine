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

  // Duration estimate
  let durationMinutes: number | null = null;
  if (logs.length >= 2) {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
    );
    const first = new Date(sorted[0].performed_at).getTime();
    const last = new Date(sorted[sorted.length - 1].performed_at).getTime();
    const diff = Math.round((last - first) / 60000);
    if (diff > 0) durationMinutes = diff;
  }

  return (
    <div className="rounded-xl border border-green-700 bg-green-950/40 p-4">
      <h3 className="text-lg font-semibold text-green-200">
        Session Complete
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-400">Total Sets</span>
          <span className="block text-lg font-bold text-gray-100">{totalSets}</span>
        </div>
        <div>
          <span className="text-gray-400">Tonnage</span>
          <span className="block text-lg font-bold text-gray-100">
            {tonnage >= 1000 ? `${(tonnage / 1000).toFixed(1)}k` : Math.round(tonnage)} lb
          </span>
        </div>
        {primaryHighlight && primaryName && (
          <div className="col-span-2">
            <span className="text-gray-400">Primary Lift</span>
            <span className="block text-gray-100">
              {primaryName}: {primaryHighlight.load} lb x {primaryHighlight.reps} reps
            </span>
          </div>
        )}
        {durationMinutes !== null && (
          <div>
            <span className="text-gray-400">Duration</span>
            <span className="block text-lg font-bold text-gray-100">~{durationMinutes} min</span>
          </div>
        )}
      </div>
    </div>
  );
}
