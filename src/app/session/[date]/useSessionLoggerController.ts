"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { initAudio, playTimerComplete } from "@/lib/timerAudio";
import { persistSkipBanner } from "./components/SkipConfirmationBanner";
import {
  EditForm,
  EntryForm,
  ExerciseView,
  LoggedSetType,
  SelectableSetType,
  SessionView,
  SetLogView,
} from "./components/types";

type UseSessionLoggerControllerInput = {
  session: SessionView;
  exercises: ExerciseView[];
  logs: SetLogView[];
};

type ActiveTimer = {
  exerciseId: number;
  endsAt: number;
  totalSeconds: number;
};

type TimerView = {
  remainingSeconds: number;
  totalSeconds: number;
};

function defaultSetType(role: ExerciseView["role"]): SelectableSetType {
  return role === "primary" ? "top" : "backoff";
}

function toSelectableSetType(setType: LoggedSetType): SelectableSetType {
  return setType === "top" ? "top" : "backoff";
}

export function useSessionLoggerController({
  session,
  exercises,
  logs,
}: UseSessionLoggerControllerInput) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [nowMs, setNowMs] = useState(() => new Date().getTime());
  const [sessionMinutes, setSessionMinutes] = useState({
    cardio: String(session.cardio_minutes),
  });

  const logButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [entryForms, setEntryForms] = useState<Record<number, EntryForm>>(() =>
    Object.fromEntries(
      exercises.map((ex) => [
        ex.exercise_id,
        { load: "", reps: "", setType: defaultSetType(ex.role) },
      ])
    )
  );

  const [editForms, setEditForms] = useState<Record<string, EditForm>>(() =>
    Object.fromEntries(
      logs.map((log) => [
        log.id,
        {
          load: String(log.load),
          reps: String(log.reps),
          setType: toSelectableSetType(log.set_type),
          notes: log.notes || "",
        },
      ])
    )
  );

  const logsByExercise = useMemo(() => {
    const map = new Map<number, SetLogView[]>();
    for (const log of logs) {
      const list = map.get(log.exercise_id) || [];
      list.push(log);
      map.set(log.exercise_id, list);
    }
    return map;
  }, [logs]);

  const doneExercises = useMemo(() => {
    return exercises.filter((ex) => (logsByExercise.get(ex.exercise_id) || []).length >= ex.prescribed_sets)
      .length;
  }, [exercises, logsByExercise]);

  useEffect(() => {
    if (!activeTimer) return;

    const intervalId = window.setInterval(() => {
      const nextNow = new Date().getTime();
      setNowMs(nextNow);
      if (activeTimer.endsAt <= nextNow) {
        setActiveTimer(null);
        haptic("medium");
        playTimerComplete();
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeTimer]);

  async function addSet(ex: ExerciseView) {
    void initAudio();
    setError(null);
    const form = entryForms[ex.exercise_id];
    const load = Number(form?.load);
    const reps = Number(form?.reps);

    if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) {
      setError(`Enter valid load and reps for ${ex.name}.`);
      return;
    }

    const setIndex = (logsByExercise.get(ex.exercise_id)?.length || 0) + 1;
    const key = `add-${ex.exercise_id}`;
    setPendingKey(key);

    const res = await fetch("/api/logs/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: session.plan_session_id,
        exercise_id: ex.exercise_id,
        movement_pattern: ex.movement_pattern,
        targeted_primary_muscle: ex.targeted_primary_muscle,
        targeted_secondary_muscle: ex.targeted_secondary_muscle,
        role: ex.role,
        set_type: form.setType,
        set_index: setIndex,
        load,
        reps,
      }),
    });

    setPendingKey(null);

    if (!res.ok) {
      setError(`Failed to save set for ${ex.name}.`);
      return;
    }

    setEntryForms((prev) => ({
      ...prev,
      [ex.exercise_id]: { ...prev[ex.exercise_id], load: "", reps: "" },
    }));

    setActiveTimer({
      exerciseId: ex.exercise_id,
      endsAt: new Date().getTime() + ex.rest_seconds * 1000,
      totalSeconds: ex.rest_seconds,
    });

    haptic("light");
    router.refresh();
  }

  function beginEdit(log: SetLogView) {
    setEditingId(log.id);
    setConfirmingDeleteId(null);
    setError(null);

    setEditForms((prev) => ({
      ...prev,
      [log.id]: prev[log.id] || {
        load: String(log.load),
        reps: String(log.reps),
        setType: toSelectableSetType(log.set_type),
        notes: log.notes || "",
      },
    }));
  }

  async function saveEdit(log: SetLogView) {
    setError(null);
    const form = editForms[log.id];
    const load = Number(form?.load);
    const reps = Number(form?.reps);

    if (!form || !Number.isFinite(load) || load <= 0 || !Number.isFinite(reps) || reps <= 0) {
      setError("Enter valid load and reps before saving.");
      return;
    }

    const key = `save-${log.id}`;
    setPendingKey(key);

    const res = await fetch(`/api/logs/set/${log.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        load,
        reps,
        set_type: form.setType,
        notes: form.notes || null,
      }),
    });

    setPendingKey(null);

    if (!res.ok) {
      setError("Failed to update set.");
      return;
    }

    setEditingId(null);
    setConfirmingDeleteId(null);
    haptic("light");
    router.refresh();
  }

  async function confirmDelete(log: SetLogView) {
    setError(null);

    const key = `delete-${log.id}`;
    setPendingKey(key);

    haptic("heavy");
    const res = await fetch(`/api/logs/set/${log.id}`, {
      method: "DELETE",
    });

    setPendingKey(null);

    if (!res.ok) {
      setError("Failed to delete set.");
      return;
    }

    if (editingId === log.id) {
      setEditingId(null);
    }
    if (confirmingDeleteId === log.id) {
      setConfirmingDeleteId(null);
    }

    router.refresh();
  }

  function repeatSet(log: SetLogView) {
    setEntryForms((prev) => ({
      ...prev,
      [log.exercise_id]: {
        ...prev[log.exercise_id],
        load: String(log.load),
        reps: String(log.reps),
        setType: toSelectableSetType(log.set_type),
      },
    }));

    const btn = logButtonRefs.current[log.exercise_id];
    if (btn) {
      window.setTimeout(() => btn.focus(), 0);
    }

    haptic("light");
  }

  async function saveSessionMinutes() {
    setError(null);

    const cardio = Number(sessionMinutes.cardio);
    if (!Number.isInteger(cardio) || cardio < 0) {
      setError("Cardio minutes must be a whole number >= 0.");
      return false;
    }

    const key = "session-minutes";
    setPendingKey(key);

    const res = await fetch("/api/plan/session-minutes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: session.plan_session_id,
        cardio_minutes: cardio,
      }),
    });

    setPendingKey(null);

    if (!res.ok) {
      setError("Failed to update cardio minutes.");
      return false;
    }

    router.refresh();
    return true;
  }

  async function skipDay() {
    setError(null);
    const key = "skip-day";
    setPendingKey(key);

    const res = await fetch("/api/plan/insert-rest-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rest_date: session.date }),
    });

    setPendingKey(null);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === "rest_date_required") {
        setError("Skip day failed: missing date.");
      } else {
        setError("Failed to skip this day.");
      }
      return false;
    }

    haptic("medium");
    persistSkipBanner(session.date);
    const [y, m, d] = session.date.split("-");
    const dmy = `${d}-${m}-${y}`;
    window.location.replace(`/session/${dmy}?skipped=1`);
    return true;
  }

  function extendTimer() {
    setActiveTimer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        endsAt: prev.endsAt + 30_000,
        totalSeconds: prev.totalSeconds + 30,
      };
    });
  }

  function getExerciseTimer(exerciseId: number): TimerView | null {
    if (!activeTimer || activeTimer.exerciseId !== exerciseId) {
      return null;
    }

    const remaining = Math.max(0, Math.ceil((activeTimer.endsAt - nowMs) / 1000));
    if (remaining <= 0) {
      return null;
    }

    return {
      remainingSeconds: remaining,
      totalSeconds: activeTimer.totalSeconds,
    };
  }

  return {
    error,
    pendingKey,
    editingId,
    confirmingDeleteId,
    sessionMinutes,
    logsByExercise,
    doneExercises,
    entryForms,
    editForms,
    setSessionMinutes,
    setEntryForms,
    setEditForms,
    setEditingId,
    setConfirmingDeleteId,
    addSet,
    beginEdit,
    saveEdit,
    confirmDelete,
    repeatSet,
    saveSessionMinutes,
    skipDay,
    extendTimer,
    getExerciseTimer,
    requestDelete: (log: SetLogView) => setConfirmingDeleteId(log.id),
    cancelDelete: () => setConfirmingDeleteId(null),
    skipTimer: () => setActiveTimer(null),
    logButtonRef: (exerciseId: number, el: HTMLButtonElement | null) => {
      logButtonRefs.current[exerciseId] = el;
    },
  };
}
