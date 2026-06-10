"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import ExerciseCard from "./components/ExerciseCard";
import SessionHeader from "./components/SessionHeader";
import CardioEditor from "./components/CardioEditor";
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
  totalExercisesInSession: number;
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

const UPPER_DAY_TYPES = new Set(["push_upper", "pull_upper", "Mon", "Tue", "Wed", "Fri"]);

export default function SessionLogger({
  session,
  exercises,
  logs,
  skipConfirmed = false,
  recentTopSets,
  prMaxByExercise,
  totalExercisesInSession,
}: Props) {
  const controller = useSessionLoggerController({ session, exercises, logs });

  const [cardioSaved, setCardioSaved] = useState(Boolean(session.cardio_saved_at));
  const [showSkipPreview, setShowSkipPreview] = useState(false);
  // P1-3: Skip All Exercises requires explicit confirmation before firing
  const [showSkipAllConfirm, setShowSkipAllConfirm] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCardioSaved(Boolean(session.cardio_saved_at));
  }, [session.cardio_saved_at]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const allExercisesSkipped = exercises.length === 0 && totalExercisesInSession > 0;
  const isUpperDay = UPPER_DAY_TYPES.has(session.session_type);

  const cardioDirty =
    controller.sessionMinutes.cardio !== String(session.cardio_minutes) ||
    controller.sessionMinutes.cardioType !== (session.cardio_type ?? "zone2");
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

  async function handleSkipAllConfirmed() {
    setShowSkipAllConfirm(false);
    await controller.skipAllExercises();
  }

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <SessionHeader
        session={session}
        doneExercises={controller.doneExercises}
        totalExercises={exercises.length}
        cardioComplete={cardioComplete}
        onSkipDay={() => setShowSkipPreview(true)}
        isSkippingDay={controller.pendingKey === "skip-day"}
        showSkipDay={logs.length === 0 && !allExercisesSkipped}
        onSkipAllExercises={() => setShowSkipAllConfirm(true)}
        isSkippingAllExercises={controller.pendingKey === "skip-all-exercises"}
        showSkipAll={logs.length === 0 && exercises.length > 0}
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
        {exercises.filter((ex) => !controller.skippedExerciseIds.has(ex.exercise_id)).map((ex) => {
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
              onSkipExercise={() => controller.skipExercise(ex)}
              isSkippingExercise={controller.pendingKey === `skip-exercise-${ex.exercise_id}`}
              canSkipExercise={exLogs.length === 0}
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

      {/* Cardio section - below all exercises */}
      <div className="mt-6 rounded-xl border border-gray-700 bg-gray-800 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Cardio
        </h2>
        {allExercisesSkipped && !cardioComplete ? (
          <p className="mb-3 text-sm text-blue-300">
            All exercises skipped. Log cardio below (0 if none) and tap Save to finish.
          </p>
        ) : null}
        <CardioEditor
          value={controller.sessionMinutes.cardio}
          cardioType={controller.sessionMinutes.cardioType}
          isSaving={controller.pendingKey === "session-minutes"}
          canSave={cardioCanSave}
          isComplete={cardioComplete}
          isUpperDay={isUpperDay}
          onChange={(value) =>
            controller.setSessionMinutes((prev) => ({ ...prev, cardio: value }))
          }
          onTypeChange={(type) =>
            controller.setSessionMinutes((prev) => ({ ...prev, cardioType: type }))
          }
          onSave={handleSaveCardio}
        />
      </div>

      {/* P1-3: Skip All Exercises (Cardio Only) confirmation modal */}
      {showSkipAllConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowSkipAllConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-100">Skip All Exercises?</h3>
            <p className="mt-2 text-sm text-gray-300">
              All {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} will be marked as skipped.
              This cannot be undone.
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Log cardio below and tap Save to complete the session.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowSkipAllConfirm(false)}
                className="min-h-[44px] flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 text-sm font-medium text-gray-200 active:opacity-80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSkipAllConfirmed}
                disabled={controller.pendingKey === "skip-all-exercises"}
                className="min-h-[44px] flex-1 rounded-lg border border-amber-700 bg-amber-900/50 px-4 text-sm font-medium text-amber-100 active:opacity-80 disabled:opacity-60"
              >
                {controller.pendingKey === "skip-all-exercises" ? "Skipping..." : "Skip All"}
              </button>
            </div>
          </div>
        </div>
      )}

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
