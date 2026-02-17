import { EntryForm, ExerciseView } from "./types";

type AddSetFormProps = {
  role: ExerciseView["role"];
  form: EntryForm;
  isPending: boolean;
  onChange: (next: EntryForm) => void;
  onSubmit: () => void;
  onLogButtonRef?: (el: HTMLButtonElement | null) => void;
};

const FIELD_CLASSES =
  "min-h-[44px] w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100";

function defaultSetType(role: ExerciseView["role"]) {
  return role === "primary" ? "top" : "backoff";
}

export default function AddSetForm({
  role,
  form,
  isPending,
  onChange,
  onSubmit,
  onLogButtonRef,
}: AddSetFormProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="block">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Load</div>
        <input
          type="number"
          inputMode="decimal"
          pattern="[0-9]*"
          value={form.load}
          onChange={(e) => onChange({ ...form, load: e.target.value })}
          className={FIELD_CLASSES}
          placeholder="lb"
        />
      </label>

      <label className="block">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Reps</div>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={form.reps}
          onChange={(e) => onChange({ ...form, reps: e.target.value })}
          className={FIELD_CLASSES}
          placeholder="reps"
        />
      </label>

      <label className="block col-span-1">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Set Type</div>
        <select
          value={form.setType || defaultSetType(role)}
          onChange={(e) =>
            onChange({ ...form, setType: e.target.value as EntryForm["setType"] })
          }
          className={FIELD_CLASSES}
        >
          <option value="top">top</option>
          <option value="backoff">backoff</option>
        </select>
      </label>

      <button
        type="button"
        ref={onLogButtonRef}
        onClick={onSubmit}
        disabled={isPending}
        className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
      >
        {isPending ? "Saving" : "Log Set"}
      </button>
    </div>
  );
}
