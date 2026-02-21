type CardioEditorProps = {
  value: string;
  isSaving: boolean;
  canSave: boolean;
  isComplete: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export default function CardioEditor({
  value,
  isSaving,
  canSave,
  isComplete,
  onChange,
  onSave,
}: CardioEditorProps) {
  return (
    <div>
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
          className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving" : "Save"}
        </button>

        {isComplete ? (
          <span className="rounded-full border border-green-700 bg-green-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-green-300">
            ✓ Saved
          </span>
        ) : (
          <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-amber-300">
            Not saved
          </span>
        )}
      </div>
      {!isComplete && (
        <p className="mt-1 text-xs text-gray-500">
          Enter minutes of cardio done today (0 if none), then tap Save to complete the session.
        </p>
      )}
    </div>
  );
}
