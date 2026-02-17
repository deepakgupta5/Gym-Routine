import { EditForm, SetLogView } from "./types";

type EditSetFormProps = {
  log: SetLogView;
  form: EditForm;
  confirmDelete: boolean;
  isPendingSave: boolean;
  isPendingDelete: boolean;
  onChange: (next: EditForm) => void;
  onSave: () => void;
  onCancel: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

const INPUT_CLASSES =
  "min-h-[44px] w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100";

export default function EditSetForm({
  log,
  form,
  confirmDelete,
  isPendingSave,
  isPendingDelete,
  onChange,
  onSave,
  onCancel,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: EditSetFormProps) {
  if (confirmDelete) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/60 p-3">
        <div className="mb-3 text-sm text-red-100">Delete this set?</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isPendingDelete}
            className="min-h-[44px] rounded-lg border border-red-700 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 active:opacity-80"
          >
            {isPendingDelete ? "Deleting" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="min-h-[44px] rounded-lg border border-gray-700 px-4 text-sm text-gray-200 hover:text-gray-100 active:opacity-80"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr]">
        <input
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={form.load}
          onChange={(e) => onChange({ ...form, load: e.target.value })}
          className={INPUT_CLASSES}
          placeholder="Load"
        />
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={form.reps}
          onChange={(e) => onChange({ ...form, reps: e.target.value })}
          className={INPUT_CLASSES}
          placeholder="Reps"
        />
        <select
          value={form.setType}
          onChange={(e) => onChange({ ...form, setType: e.target.value as EditForm["setType"] })}
          className={INPUT_CLASSES}
        >
          <option value="top">top</option>
          <option value="backoff">backoff</option>
        </select>
      </div>

      <input
        type="text"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        className={INPUT_CLASSES}
        placeholder="Notes (optional)"
      />

      <div className="text-xs text-gray-500">Logged {new Date(log.performed_at).toLocaleString()}</div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isPendingSave}
          className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
        >
          {isPendingSave ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-gray-700 px-4 text-sm text-gray-200 hover:text-gray-100 active:opacity-80"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          className="min-h-[44px] rounded-lg border border-red-800 bg-red-950/40 px-4 text-sm text-red-300 hover:text-red-200 active:opacity-80"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
