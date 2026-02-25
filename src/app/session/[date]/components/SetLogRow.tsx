import { SetLogView } from "./types";

type SetLogRowProps = {
  log: SetLogView;
  isPR?: boolean;
  onEdit: () => void;
  onRepeat: () => void;
};

export default function SetLogRow({ log, isPR = false, onEdit, onRepeat }: SetLogRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-gray-100">
            {log.load} x {log.reps}
          </div>
          {isPR && (
            <span className="rounded-full border border-amber-600 bg-amber-950/60 px-2 py-0.5 text-xs font-semibold text-amber-300">
              New PR!
            </span>
          )}
        </div>
        <div className="mt-1 inline-flex rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-300">
          Set #{log.set_index}
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
