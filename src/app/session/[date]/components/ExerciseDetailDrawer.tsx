import { ExerciseView } from "./types";

type ExerciseDetailDrawerProps = {
  exercise: ExerciseView;
  onClose?: () => void;
};

function formatTempo(tempo: string) {
  if (!tempo || tempo === "0" || tempo === "0000") return null;
  // Tempo format like "3010" → "3-0-1-0 (ecc-pause-con-pause)"
  if (/^\d{4}$/.test(tempo)) {
    return `${tempo[0]}-${tempo[1]}-${tempo[2]}-${tempo[3]}`;
  }
  return tempo;
}

function formatRest(seconds: number) {
  if (!seconds || seconds <= 0) return null;
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${seconds}s`;
}

export default function ExerciseDetailDrawer({ exercise, onClose }: ExerciseDetailDrawerProps) {
  const tempo = formatTempo(exercise.tempo);
  const rest = formatRest(exercise.rest_seconds);
  const hasAlternatives = exercise.alt_1_name || exercise.alt_2_name;

  return (
    <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm">
      {onClose && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-gray-400 hover:text-gray-100 active:opacity-80"
          >
            Close ×
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-400">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Pattern
          </span>
          <div className="text-gray-300">{exercise.movement_pattern}</div>
        </div>

        {exercise.targeted_primary_muscle && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Primary Muscle
            </span>
            <div className="text-gray-300">{exercise.targeted_primary_muscle}</div>
          </div>
        )}

        {exercise.targeted_secondary_muscle && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Secondary Muscle
            </span>
            <div className="text-gray-300">{exercise.targeted_secondary_muscle}</div>
          </div>
        )}

        {tempo && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Tempo
            </span>
            <div className="text-gray-300">{tempo}</div>
          </div>
        )}

        {rest && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Rest
            </span>
            <div className="text-gray-300">{rest}</div>
          </div>
        )}

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Rx Load
          </span>
          <div className="text-gray-300">{exercise.prescribed_load || "—"}</div>
        </div>
      </div>

      {hasAlternatives && (
        <div className="mt-3 border-t border-gray-700 pt-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Alternatives
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {exercise.alt_1_name && (
              <span className="rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                {exercise.alt_1_name}
              </span>
            )}
            {exercise.alt_2_name && (
              <span className="rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                {exercise.alt_2_name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
