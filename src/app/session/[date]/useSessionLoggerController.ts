"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  return role === "accessory" ? "accessory" : "straight";
}

function toSelectableSetType(setType: LoggedSetType): SelectableSetType {
  return setType === "accessory" ? "accessory" : "straight";
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
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<Set<number>>(new Set());
  const [skipDebug, setSkipDebug] = useState<string | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState({
    cardio: String(session.cardio_minutes),
  });

  // Re-sync cardio input when the server refreshes with a new value.
  // Keeps client state truthful after router.refresh() resolves.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSessionMinutes((prev) => ({ ...prev, cardio: String(session.cardio_minutes) }));
  }, [session.cardio_minutes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const logButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [entryForms, setEntryForms] = useState<Record<number, EntryForm>>(() => {
    const loggedExerciseIds = new Set(logs.map((l) => l.exercise_id));

    return Object.fromEntries(
      exercises.map((ex) => {
        const hasLogs = loggedExerciseIds.has(ex.exercise_id);
        let prefillLoad = "";
        if (!hasLogs) {
          if (ex.next_target_load != null && ex.next_target_load > 0) {
            prefillLoad = String(ex.next_target_load);
          } else if (ex.prev_load != null && ex.prev_load > 0) {
            prefillLoad = String(ex.prev_load);
          }
        }
        return [
          ex.exercise_id,
          { load: prefillLoad, reps: "", setType: defaultSetType(ex.role), rpe: "", notes: "" },
        ];
      })
    );
  });

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

  const addSet = useCallback(async function addSet(ex: ExerciseView) {
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
        set_type: defaultSetType(ex.role),
        set_index: setIndex,
        load,
        reps,
        rpe: form.rpe ? Number(form.rpe) : null,
        notes: form.notes || null,
      }),
    });

    setPendingKey(null);

    if (!res.ok) {
      setError(`Failed to save set for ${ex.name}.`);
      return;
    }

    setEntryForms((prev) => ({
      ...prev,
      [ex.exercise_id]: { ...prev[ex.exercise_id], reps: "", rpe: "", notes: "" },
    }));

    setActiveTimer({
      exerciseId: ex.exercise_id,
      endsAt: new Date().getTime() + ex.rest_seconds * 1000,
      totalSeconds: ex.rest_seconds,
    });

    haptic("light");
    router.refresh();
  }, [entryForms, logsByExercise, session.plan_session_id, router]);

  const beginEdit = useCallback(function beginEdit(log: SetLogView) {
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
  }, []);

  const saveEdit = useCallback(async function saveEdit(log: SetLogView) {
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
  }, [editForms, router]);

  const confirmDelete = useCallback(async function confirmDelete(log: SetLogView) {
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
  }, [editingId, confirmingDeleteId, router]);

  const repeatSet = useCallback(function repeatSet(log: SetLogView) {
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
  }, []);

  const saveSessionMinutes = useCallback(async function saveSessionMinutes() {
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

    // Normalize local state to the saved integer immediately so cardioDirty
    // goes false without waiting for the router.refresh() round-trip.
    setSessionMinutes({ cardio: String(cardio) });
    router.refresh();
    return true;
  }, [sessionMinutes.cardio, session.plan_session_id, router]);

  const skipDay = useCallback(async function skipDay() {
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
  }, [session.date]);

  const skipExercise = useCallback(async function skipExercise(ex: ExerciseView) {
    setError(null);
    setSkipDebug(`1. called for: ${ex.name} (id=${ex.exercise_id})`);

    if ((logsByExercise.get(ex.exercise_id) || []).length > 0) {
      setError(`Cannot skip ${ex.name} after logging sets.`);
      setSkipDebug(`1b. blocked: has logs`);
      return false;
    }

    const key = `skip-exercise-${ex.exercise_id}`;
    setPendingKey(key);
    setSkipDebug(`2. sending fetch...`);

    let res: Response;
    try {
      res = await fetch("/api/plan/skip-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.plan_session_id,
          exercise_id: ex.exercise_id,
        }),
      });
    } catch (fetchErr) {
      setPendingKey(null);
      const msg = fetchErr instanceof Error ? fetchErr.message : "offline?";
      setError(`Skip failed (network): ${msg}`);
      setSkipDebug(`3. network error: ${msg}`);
      return false;
    }

    setPendingKey(null);
    setSkipDebug(`3. response: status=${res.status} ok=${res.ok}`);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      const errCode = body?.error ?? "unknown";
      setSkipDebug(`4. not ok: ${errCode}`);
      if (body?.error === "exercise_already_started") {
        setError(`Cannot skip ${ex.name} after logging sets.`);
      } else if (body?.error === "exercise_not_in_session") {
        setError(`Could not find ${ex.name} in this session.`);
      } else if (body?.error === "session_already_completed") {
        window.location.reload();
        return false;
      } else {
        setError(`Skip failed (${res.status}): ${body?.detail ?? body?.error ?? "unknown"}`);
      }
      return false;
    }

    setSkipDebug(`4. SUCCESS - hiding exercise`);
    setSkippedExerciseIds((prev) => new Set([...prev, ex.exercise_id]));
    haptic("medium");
    router.refresh();
    return true;
  }, [logsByExercise, session.plan_session_id, router]);

  const extendTimer = useCallback(function extendTimer() {
    setActiveTimer((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        endsAt: prev.endsAt + 30_000,
        totalSeconds: prev.totalSeconds + 30,
      };
    });
  }, []);

  const getExerciseTimer = useCallback(function getExerciseTimer(exerciseId: number): TimerView | null {
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
  }, [activeTimer, nowMs]);

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
    skippedExerciseIds,
    skipDebug,
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
    skipExercise,
    extendTimer,
    getExerciseTimer,
    requestDelete: useCallback((log: SetLogView) => setConfirmingDeleteId(log.id), []),
    cancelDelete: useCallback(() => setConfirmingDeleteId(null), []),
    skipTimer: useCallback(() => setActiveTimer(null), []),
    logButtonRef: useCallback((exerciseId: number, el: HTMLButtonElement | null) => {
      logButtonRefs.current[exerciseId] = el;
    }, []),
  };
}
