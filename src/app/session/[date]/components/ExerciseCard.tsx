import AddSetForm from "./AddSetForm";
import EditSetForm from "./EditSetForm";
import RestTimer from "./RestTimer";
import SetLogRow from "./SetLogRow";
import { EditForm, EntryForm, ExerciseView, SetLogView } from "./types";

type TimerState = {
  remainingSeconds: number;
  totalSeconds: number;
};

type ExerciseCardProps = {
  exercise: ExerciseView;
  logs: SetLogView[];
  form: EntryForm;
  editForms: Record<string, EditForm>;
  editingId: string | null;
  confirmingDeleteId: string | null;
  pendingKey: string | null;
  timer: TimerState | null;
  onFormChange: (next: EntryForm) => void;
  onAddSet: () => void;
  onBeginEdit: (log: SetLogView) => void;
  onEditFormChange: (logId: string, next: EditForm) => void;
  onSaveEdit: (log: SetLogView) => void;
  onCancelEdit: () => void;
  onRequestDelete: (log: SetLogView) => void;
  onConfirmDelete: (log: SetLogView) => void;
  onCancelDelete: () => void;
  onRepeat: (log: SetLogView) => void;
  onSkipTimer: () => void;
  onExtendTimer: () => void;
  onLogButtonRef?: (el: HTMLButtonElement | null) => void;
};

function roleMeta(role: ExerciseView["role"]) {
  if (role === "primary") {
    return {
      label: "primary",
      border: "border-l-blue-500",
      text: "text-blue-500",
    };
  }

  if (role === "secondary") {
    return {
      label: "secondary",
      border: "border-l-amber-500",
      text: "text-amber-500",
    };
  }

  return {
    label: "support",
    border: "border-l-gray-500",
    text: "text-gray-500",
  };
}

function formatLoad(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

export default function ExerciseCard({
  exercise,
  logs,
  form,
  editForms,
  editingId,
  confirmingDeleteId,
  pendingKey,
  timer,
  onFormChange,
  onAddSet,
  onBeginEdit,
  onEditFormChange,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRepeat,
  onSkipTimer,
  onExtendTimer,
  onLogButtonRef,
}: ExerciseCardProps) {
  const role = roleMeta(exercise.role);
  const setCount = logs.length;
  const complete = setCount >= exercise.prescribed_sets;
  const last =
    exercise.prev_reps !== null && exercise.prev_load !== null
      ? `${formatLoad(exercise.prev_load)} x ${exercise.prev_reps}`
      : "—";

  return (
    <section
      className={`rounded-xl border border-gray-700 border-l-4 bg-gray-800 p-4 ${role.border}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-medium uppercase tracking-wide ${role.text}`}>
            {role.label}
          </div>
          <h2 className="text-lg font-semibold text-gray-100">{exercise.name}</h2>
          <div className="text-sm text-gray-400">
            Target {exercise.prescribed_sets} x {exercise.prescribed_reps_min}-{exercise.prescribed_reps_max} · Last: {last}
          </div>
        </div>

        <div className="shrink-0 text-right text-sm font-medium">
          {complete ? (
            <span className="text-green-600">✓ {setCount} / {exercise.prescribed_sets} sets</span>
          ) : (
            <span className="text-gray-300">{setCount} / {exercise.prescribed_sets} sets</span>
          )}
        </div>
      </div>

      <AddSetForm
        role={exercise.role}
        form={form}
        isPending={pendingKey === `add-${exercise.exercise_id}`}
        onChange={onFormChange}
        onSubmit={onAddSet}
        onLogButtonRef={onLogButtonRef}
      />

      <div className="my-3 h-px bg-gray-700" />

      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Logged sets
      </div>

      <div className="mt-2 grid gap-2">
        {logs.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-500">
            No logged sets yet.
          </div>
        ) : (
          logs.map((log) => {
            const edit =
              editForms[log.id] || {
                load: String(log.load),
                reps: String(log.reps),
                setType: log.set_type === "top" ? "top" : "backoff",
                notes: log.notes || "",
              };

            if (editingId === log.id) {
              return (
                <EditSetForm
                  key={log.id}
                  log={log}
                  form={edit}
                  confirmDelete={confirmingDeleteId === log.id}
                  isPendingSave={pendingKey === `save-${log.id}`}
                  isPendingDelete={pendingKey === `delete-${log.id}`}
                  onChange={(next) => onEditFormChange(log.id, next)}
                  onSave={() => onSaveEdit(log)}
                  onCancel={onCancelEdit}
                  onRequestDelete={() => onRequestDelete(log)}
                  onConfirmDelete={() => onConfirmDelete(log)}
                  onCancelDelete={onCancelDelete}
                />
              );
            }

            return (
              <SetLogRow
                key={log.id}
                log={log}
                onEdit={() => onBeginEdit(log)}
                onRepeat={() => onRepeat(log)}
              />
            );
          })
        )}
      </div>

      {timer ? (
        <RestTimer
          remainingSeconds={timer.remainingSeconds}
          totalSeconds={timer.totalSeconds}
          onSkip={onSkipTimer}
          onExtend={onExtendTimer}
        />
      ) : null}
    </section>
  );
}
