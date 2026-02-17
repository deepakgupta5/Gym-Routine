type CardioEditorProps = {
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
};

export default function CardioEditor({
  value,
  isSaving,
  onChange,
  onSave,
}: CardioEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-gray-300">Cardio:</label>
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
      <span className="text-sm text-gray-400">min</span>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
      >
        {isSaving ? "Saving" : "Save"}
      </button>
    </div>
  );
}
