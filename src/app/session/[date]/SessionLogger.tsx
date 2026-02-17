"use client";

import { useEffect, useMemo, useState } from "react";
import ExerciseCard from "./components/ExerciseCard";
import SessionHeader from "./components/SessionHeader";
import { ExerciseView, SessionView, SetLogView } from "./components/types";
import { useSessionLoggerController } from "./useSessionLoggerController";

type Props = {
  session: SessionView;
  exercises: ExerciseView[];
  logs: SetLogView[];
};

function defaultEntryForm(role: ExerciseView["role"]) {
  return {
    load: "",
    reps: "",
    setType: role === "primary" ? "top" : ("backoff" as const),
  };
}

export default function SessionLogger({ session, exercises, logs }: Props) {
  const controller = useSessionLoggerController({ session, exercises, logs });

  const cardioSaveKey = useMemo(
    () => `cardio_saved:${session.plan_session_id}`,
    [session.plan_session_id]
  );
  const [cardioSaved, setCardioSaved] = useState(false);

  useEffect(() => {
    try {
      setCardioSaved(window.localStorage.getItem(cardioSaveKey) === "1");
    } catch {
      setCardioSaved(false);
    }
  }, [cardioSaveKey]);

  const cardioDirty = controller.sessionMinutes.cardio !== String(session.cardio_minutes);
  const cardioValue = Number(controller.sessionMinutes.cardio);
  const cardioValid = Number.isInteger(cardioValue) && cardioValue >= 0;
  const cardioComplete =
    cardioSaved && cardioValid && !cardioDirty && controller.pendingKey !== "session-minutes";
  const cardioCanSave =
    cardioValid && (cardioDirty || !cardioSaved) && controller.pendingKey !== "session-minutes";

  async function handleSaveCardio() {
    const ok = await controller.saveSessionMinutes();
    if (!ok) return;

    setCardioSaved(true);
    try {
      window.localStorage.setItem(cardioSaveKey, "1");
    } catch {
      // Ignore storage failures; UI state is still updated for this session.
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <SessionHeader
        session={session}
        doneExercises={controller.doneExercises}
        totalExercises={exercises.length}
        cardioValue={controller.sessionMinutes.cardio}
        cardioCanSave={cardioCanSave}
        cardioComplete={cardioComplete}
        onCardioChange={(value) =>
          controller.setSessionMinutes((prev) => ({ ...prev, cardio: value }))
        }
        onSaveCardio={handleSaveCardio}
        isSavingCardio={controller.pendingKey === "session-minutes"}
      />

      {controller.error ? (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {controller.error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        {exercises.map((ex) => {
          const exLogs = controller.logsByExercise.get(ex.exercise_id) || [];
          const form = controller.entryForms[ex.exercise_id] || defaultEntryForm(ex.role);

          return (
            <ExerciseCard
              key={ex.plan_exercise_id}
              exercise={ex}
              logs={exLogs}
              form={form}
              editForms={controller.editForms}
              editingId={controller.editingId}
              confirmingDeleteId={controller.confirmingDeleteId}
              pendingKey={controller.pendingKey}
              timer={controller.getExerciseTimer(ex.exercise_id)}
              onFormChange={(next) =>
                controller.setEntryForms((prev) => ({ ...prev, [ex.exercise_id]: next }))
              }
              onAddSet={() => controller.addSet(ex)}
              onBeginEdit={controller.beginEdit}
              onEditFormChange={(logId, next) =>
                controller.setEditForms((prev) => ({ ...prev, [logId]: next }))
              }
              onSaveEdit={controller.saveEdit}
              onCancelEdit={() => {
                controller.setEditingId(null);
                controller.setConfirmingDeleteId(null);
              }}
              onRequestDelete={controller.requestDelete}
              onConfirmDelete={controller.confirmDelete}
              onCancelDelete={controller.cancelDelete}
              onRepeat={controller.repeatSet}
              onSkipTimer={controller.skipTimer}
              onExtendTimer={controller.extendTimer}
              onLogButtonRef={(el) => controller.logButtonRef(ex.exercise_id, el)}
            />
          );
        })}
      </div>
    </main>
  );
}
