type CardioType = "zone2" | "hiit";

type CardioEditorProps = {
  value: string;
  cardioType: CardioType;
  isSaving: boolean;
  canSave: boolean;
  isComplete: boolean;
  isUpperDay: boolean;
  onChange: (value: string) => void;
  onTypeChange: (type: CardioType) => void;
  onSave: () => void;
};

const HIIT_PROTOCOL = "30s hard / 90s easy x 8 rounds (~20 min)";
const ZONE2_PROMPT = "Moderate pace -- you can talk but not sing.";

export default function CardioEditor({
  value,
  cardioType,
  isSaving,
  canSave,
  isComplete,
  isUpperDay,
  onChange,
  onTypeChange,
  onSave,
}: CardioEditorProps) {
  return (
    <div className="w-full">
      {/* Type toggle -- only show when cardio not yet saved */}
      {!isComplete && (
        <div className="mb-2 flex gap-1">
          <button
            type="button"
            onClick={() => onTypeChange("zone2")}
            className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium transition-colors ${
              cardioType === "zone2"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
            }`}
          >
            Zone 2
          </button>
          <button
            type="button"
            onClick={() => onTypeChange("hiit")}
            className={`min-h-[36px] rounded-lg border px-3 text-xs font-medium transition-colors ${
              cardioType === "hiit"
                ? "border-orange-500 bg-orange-500 text-white"
                : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
            }`}
          >
            HIIT
          </button>
        </div>
      )}

      {/* Protocol hint */}
      {!isComplete && (
        <p className="mb-2 text-xs text-gray-500">
          {cardioType === "hiit" ? HIIT_PROTOCOL : ZONE2_PROMPT}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-200">Cardio (min):</label>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] w-24 rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !canSave}
          className={`min-h-[44px] rounded-lg border px-4 text-sm font-medium text-white active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 ${
            isUpperDay && !isComplete
              ? "border-orange-600 bg-orange-600 hover:bg-orange-500"
              : "border-blue-700 bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {isSaving ? "Saving" : "Save"}
        </button>

        {isComplete ? (
          <span className="rounded-full border border-green-700 bg-green-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-green-300">
            {cardioType === "hiit" ? "HIIT done" : "Zone 2 done"}
          </span>
        ) : isUpperDay ? (
          <span className="rounded-full border border-orange-700 bg-orange-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-orange-300">
            Required
          </span>
        ) : (
          <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-amber-300">
            Not saved
          </span>
        )}
      </div>
    </div>
  );
}
