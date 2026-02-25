"use client";

import { useState } from "react";
import { estimate1RM } from "@/lib/engine/progression";
import AddSetForm from "./AddSetForm";
import EditSetForm from "./EditSetForm";
import ExerciseDetailDrawer from "./ExerciseDetailDrawer";
import RestTimer from "./RestTimer";
import SetLogRow from "./SetLogRow";
import { EditForm, EntryForm, ExerciseView, SetLogView, TopSetHistoryEntry } from "./types";

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
  recentTopSets: TopSetHistoryEntry[];
  prMax: number | null;
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

function trendArrow(entries: TopSetHistoryEntry[]) {
  if (entries.length < 2) return null;
  const newest = Number(entries[0].load);
  const oldest = Number(entries[entries.length - 1].load);
  if (newest > oldest) return { symbol: "↑", color: "text-green-400" };
  if (newest < oldest) return { symbol: "↓", color: "text-red-400" };
  return { symbol: "→", color: "text-gray-400" };
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
  recentTopSets,
  prMax,
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
  const [detailOpen, setDetailOpen] = useState(false);
  const role = roleMeta(exercise.role);
  const setCount = logs.length;
  const complete = setCount >= exercise.prescribed_sets;
  const isPrefilled = logs.length === 0 && form.load !== "";
  const last =
    exercise.prev_reps !== null && exercise.prev_load !== null
      ? `${formatLoad(exercise.prev_load)} x ${exercise.prev_reps}`
      : "—";
  const nextTarget =
    exercise.next_target_load != null && exercise.next_target_load > 0
      ? formatLoad(exercise.next_target_load)
      : null;

  const trend = trendArrow(recentTopSets);

  return (
    <section
      className={`rounded-xl border border-gray-700 border-l-4 bg-gray-800 p-4 ${role.border}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-medium uppercase tracking-wide ${role.text}`}>
            {role.label}
          </div>
          <button
            type="button"
            onClick={() => setDetailOpen((prev) => !prev)}
            className="text-left"
          >
            <h2 className="text-lg font-semibold text-gray-100 underline decoration-gray-600 decoration-dotted underline-offset-4">
              {exercise.name}
            </h2>
          </button>
          <div className="text-sm text-gray-300">
            Target {exercise.prescribed_sets} x {exercise.prescribed_reps_min}-{exercise.prescribed_reps_max} · Last: {last}
            {nextTarget && <span className="ml-1 text-blue-400"> · Next: {nextTarget} lb</span>}
          </div>
          {recentTopSets.length > 0 && (
            <div className="mt-1 text-xs text-gray-400">
              Recent:{" "}
              {recentTopSets.map((e, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {e.load}×{e.reps}
                </span>
              ))}
              {trend && (
                <span className={`ml-1 ${trend.color}`}>{trend.symbol}</span>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right text-sm font-medium">
          {complete ? (
            <span className="text-green-400">✓ {setCount} / {exercise.prescribed_sets} sets</span>
          ) : (
            <span className="text-gray-300">{setCount} / {exercise.prescribed_sets} sets</span>
          )}
        </div>
      </div>

      {detailOpen && <ExerciseDetailDrawer exercise={exercise} onClose={() => setDetailOpen(false)} />}

      {!complete && (
        <AddSetForm
          form={form}
          isPending={pendingKey === `add-${exercise.exercise_id}`}
          isPrefilled={isPrefilled}
          onChange={onFormChange}
          onSubmit={onAddSet}
          onLogButtonRef={onLogButtonRef}
        />
      )}

      {complete && (
        <div className="mt-2 rounded-lg border border-green-800 bg-green-950/30 px-3 py-2 text-center text-sm font-medium text-green-400">
          All {exercise.prescribed_sets} sets completed ✓
        </div>
      )}

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
                setType: log.set_type === "accessory" ? "accessory" : "straight",
                notes: log.notes || "",
              };

            // PR detection: compare this set's estimated 1RM against historical max
            const logE1RM =
              exercise.role === "primary"
                ? estimate1RM(Number(log.load), log.reps)
                : null;
            const isPR =
              logE1RM !== null && prMax !== null && logE1RM > prMax;

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
                isPR={isPR}
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
