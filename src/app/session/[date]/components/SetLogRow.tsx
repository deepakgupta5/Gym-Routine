import { SetLogView } from "./types";

type SetLogRowProps = {
  log: SetLogView;
  onEdit: () => void;
  onRepeat: () => void;
};

function badgeClass(setType: SetLogView["set_type"]) {
  if (setType === "top") return "bg-blue-950 text-blue-300 border-blue-800";
  if (setType === "backoff") return "bg-amber-950 text-amber-300 border-amber-800";
  return "bg-gray-800 text-gray-300 border-gray-700";
}

export default function SetLogRow({ log, onEdit, onRepeat }: SetLogRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-100">
          {log.load} x {log.reps}
        </div>
        <div
          className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${badgeClass(log.set_type)}`}
        >
          {log.set_type} #{log.set_index}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRepeat}
          className="min-h-[44px] rounded-lg border border-gray-700 px-3 text-sm text-gray-200 hover:text-gray-100 active:opacity-80"
        >
          Repeat
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-[44px] rounded-lg border border-gray-700 px-3 text-sm text-gray-200 hover:text-gray-100 active:opacity-80"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
