"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import ExerciseCard from "./components/ExerciseCard";
import SessionHeader from "./components/SessionHeader";
import { ExerciseView, SessionView, SetLogView, TopSetHistoryEntry } from "./components/types";
import SessionComplete from "./components/SessionComplete";
import SkipConfirmationBanner from "./components/SkipConfirmationBanner";
import SkipPreviewModal from "./components/SkipPreviewModal";
import { useSessionLoggerController } from "./useSessionLoggerController";

type Props = {
  session: SessionView;
  exercises: ExerciseView[];
  logs: SetLogView[];
  skipConfirmed?: boolean;
  recentTopSets: Record<number, TopSetHistoryEntry[]>;
  prMaxByExercise: Record<number, number>;
};

function defaultEntryForm(role: ExerciseView["role"]) {
  return {
    load: "",
    reps: "",
    setType: role === "accessory" ? "accessory" : ("straight" as const),
    rpe: "",
    notes: "",
  };
}

export default function SessionLogger({
  session,
  exercises,
  logs,
  skipConfirmed = false,
  recentTopSets,
  prMaxByExercise,
}: Props) {
  const controller = useSessionLoggerController({ session, exercises, logs });

  const [cardioSaved, setCardioSaved] = useState(Boolean(session.cardio_saved_at));
  const [showSkipPreview, setShowSkipPreview] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCardioSaved(Boolean(session.cardio_saved_at));
  }, [session.cardio_saved_at]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    haptic("light");
  }

  async function handleSkipDay() {
    await controller.skipDay();
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
        onSkipDay={() => setShowSkipPreview(true)}
        isSkippingDay={controller.pendingKey === "skip-day"}
        showSkipDay={logs.length === 0}
      />

      <SkipConfirmationBanner isoDate={session.date} initialVisible={skipConfirmed} />

      {controller.error ? (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {controller.error}
        </div>
      ) : null}

      {(() => {
        const normalizedDone = Math.min(controller.doneExercises, exercises.length);
        const isComplete = normalizedDone === exercises.length && cardioComplete;
        return isComplete ? (
          <div className="mt-4">
            <SessionComplete exercises={exercises} logs={logs} />
          </div>
        ) : null;
      })()}

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
              recentTopSets={recentTopSets[ex.exercise_id] || []}
              prMax={prMaxByExercise[ex.exercise_id] ?? null}
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

      <SkipPreviewModal
        isOpen={showSkipPreview}
        isoDate={session.date}
        onConfirm={() => {
          setShowSkipPreview(false);
          handleSkipDay();
        }}
        onCancel={() => setShowSkipPreview(false)}
        isConfirming={controller.pendingKey === "skip-day"}
      />
    </main>
  );
}
