type RestTimerProps = {
  remainingSeconds: number;
  totalSeconds: number;
  onSkip: () => void;
  onExtend: () => void;
};

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function RestTimer({
  remainingSeconds,
  totalSeconds,
  onSkip,
  onExtend,
}: RestTimerProps) {
  const ratio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const widthPct = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  return (
    <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-base font-semibold tabular-nums text-gray-100">
          ⏱ Rest: {formatSeconds(remainingSeconds)} remaining
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[44px] rounded-lg border border-gray-700 px-3 text-sm text-gray-200 hover:text-gray-100 active:opacity-80"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onExtend}
            className="min-h-[44px] rounded-lg border border-blue-700 px-3 text-sm text-blue-300 hover:text-blue-200 active:opacity-80"
          >
            +30s
          </button>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
