"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SelectableSetType = "top" | "backoff";
type LoggedSetType = SelectableSetType | "accessory";

type SessionView = {
  plan_session_id: string;
  date: string;
  session_type: string;
  is_deload: boolean;
  cardio_minutes: number;
};

type ExerciseView = {
  plan_exercise_id: string;
  exercise_id: number;
  role: "primary" | "secondary" | "accessory";
  name: string;
  movement_pattern: string;
  targeted_primary_muscle: string | null;
  targeted_secondary_muscle: string | null;
  prescribed_sets: number;
  prescribed_reps_min: number;
  prescribed_reps_max: number;
  prescribed_load: string;
  rest_seconds: number;
  tempo: string;
  image_url: string;
};

type SetLogView = {
  id: string;
  session_id: string;
  exercise_id: number;
  set_type: LoggedSetType;
  set_index: number;
  load: string;
  reps: number;
  notes: string | null;
  performed_at: string;
};

type Props = {
  session: SessionView;
  exercises: ExerciseView[];
  logs: SetLogView[];
};

function defaultSetType(role: ExerciseView["role"]): SelectableSetType {
  if (role === "primary") return "top";
  return "backoff";
}

function toSelectableSetType(setType: LoggedSetType): SelectableSetType {
  if (setType === "top" || setType === "backoff") return setType;
  return "backoff";
}

function displayRoleLabel(role: ExerciseView["role"]) {
  if (role === "accessory") return "support";
  return role;
}

function formatDateDdMmYyyy(isoDate: string) {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function weekdayShortFromIsoDate(isoDate: string) {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt);
}

export default function SessionLogger({ session, exercises, logs }: Props) {
  const router = useRouter();
  const displayDate = formatDateDdMmYyyy(session.date);
  const displayWeekday = weekdayShortFromIsoDate(session.date);

  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState({
    cardio: String(session.cardio_minutes),
  });

  const [entryForms, setEntryForms] = useState<Record<number, { load: string; reps: string; setType: SelectableSetType }>>(
    () =>
      Object.fromEntries(
        exercises.map((ex) => [
          ex.exercise_id,
          { load: "", reps: "", setType: defaultSetType(ex.role) },
        ])
      )
  );

  const [editForms, setEditForms] = useState<Record<string, { load: string; reps: string; setType: SelectableSetType; notes: string }>>(
    () =>
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

  async function addSet(ex: ExerciseView) {
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

    router.refresh();
  }

  function beginEdit(log: SetLogView) {
    setEditingId(log.id);
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
    router.refresh();
  }

  async function deleteSet(log: SetLogView) {
    setError(null);
    const confirmed = window.confirm("Delete this set log?");
    if (!confirmed) return;

    const key = `delete-${log.id}`;
    setPendingKey(key);

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

    router.refresh();
  }

  async function saveSessionMinutes() {
    setError(null);

    const cardio = Number(sessionMinutes.cardio);

    if (!Number.isInteger(cardio) || cardio < 0) {
      setError("Cardio minutes must be a whole number >= 0.");
      return;
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
      return;
    }

    router.refresh();
  }

  return (
    <main style={{ padding: 16, maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>
        {displayWeekday} Session - {displayDate}
        {session.is_deload ? " (Deload)" : ""}
      </h1>
      <div style={{ marginTop: 0, marginBottom: 16, display: "grid", gap: 8 }}>
        <p style={{ margin: 0 }}>
          Cardio: {session.cardio_minutes} min
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "end",
            maxWidth: 360,
          }}
        >
          <label>
            <div style={{ fontSize: 12 }}>Cardio (min)</div>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={sessionMinutes.cardio}
              onChange={(e) =>
                setSessionMinutes((prev) => ({ ...prev, cardio: e.target.value }))
              }
              style={{ width: "100%", padding: 8 }}
            />
          </label>
          <button
            onClick={saveSessionMinutes}
            disabled={pendingKey === "session-minutes"}
            style={{ padding: "8px 12px", minWidth: 120 }}
          >
            {pendingKey === "session-minutes" ? "Saving" : "Save Cardio"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {exercises.map((ex) => {
          const exLogs = logsByExercise.get(ex.exercise_id) || [];
          const form = entryForms[ex.exercise_id];

          return (
            <section
              key={ex.plan_exercise_id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <img
                  src={ex.image_url}
                  alt={ex.targeted_primary_muscle || "Exercise"}
                  width={64}
                  height={64}
                  style={{ borderRadius: 10, background: "#111827", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.7 }}>{displayRoleLabel(ex.role)}</div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{ex.name}</h2>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    Target {ex.prescribed_sets} sets x {ex.prescribed_reps_min}-{ex.prescribed_reps_max} reps
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr auto",
                  gap: 8,
                  alignItems: "end",
                  marginBottom: 10,
                }}
              >
                <label>
                  <div style={{ fontSize: 12 }}>Load</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form?.load || ""}
                    onChange={(e) =>
                      setEntryForms((prev) => ({
                        ...prev,
                        [ex.exercise_id]: { ...prev[ex.exercise_id], load: e.target.value },
                      }))
                    }
                    style={{ width: "100%", padding: 8 }}
                    placeholder="lb"
                  />
                </label>

                <label>
                  <div style={{ fontSize: 12 }}>Reps</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form?.reps || ""}
                    onChange={(e) =>
                      setEntryForms((prev) => ({
                        ...prev,
                        [ex.exercise_id]: { ...prev[ex.exercise_id], reps: e.target.value },
                      }))
                    }
                    style={{ width: "100%", padding: 8 }}
                    placeholder="reps"
                  />
                </label>

                <label>
                  <div style={{ fontSize: 12 }}>Set Type</div>
                  <select
                    value={form?.setType || defaultSetType(ex.role)}
                    onChange={(e) =>
                      setEntryForms((prev) => ({
                        ...prev,
                        [ex.exercise_id]: {
                          ...prev[ex.exercise_id],
                          setType: e.target.value as SelectableSetType,
                        },
                      }))
                    }
                    style={{ width: "100%", padding: 8 }}
                  >
                    <option value="top">top</option>
                    <option value="backoff">backoff</option>
                  </select>
                </label>

                <button
                  onClick={() => addSet(ex)}
                  disabled={pendingKey === `add-${ex.exercise_id}`}
                  style={{ padding: "8px 12px", minWidth: 88 }}
                >
                  {pendingKey === `add-${ex.exercise_id}` ? "Saving" : "Log Set"}
                </button>
              </div>

              <div>
                <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.8 }}>Logged sets</div>
                {exLogs.length === 0 ? (
                  <div style={{ fontSize: 13, opacity: 0.65 }}>No logged sets yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {exLogs.map((log) => {
                      const edit = editForms[log.id] || {
                        load: String(log.load),
                        reps: String(log.reps),
                        setType: toSelectableSetType(log.set_type),
                        notes: log.notes || "",
                      };

                      return (
                        <div
                          key={log.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: 8,
                            background: "#fafafa",
                          }}
                        >
                          {editingId === log.id ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                <input
                                  type="number"
                                  value={edit.load}
                                  onChange={(e) =>
                                    setEditForms((prev) => ({
                                      ...prev,
                                      [log.id]: { ...edit, load: e.target.value },
                                    }))
                                  }
                                  style={{ padding: 8 }}
                                  placeholder="Load"
                                />
                                <input
                                  type="number"
                                  value={edit.reps}
                                  onChange={(e) =>
                                    setEditForms((prev) => ({
                                      ...prev,
                                      [log.id]: { ...edit, reps: e.target.value },
                                    }))
                                  }
                                  style={{ padding: 8 }}
                                  placeholder="Reps"
                                />
                                <select
                                  value={edit.setType}
                                  onChange={(e) =>
                                    setEditForms((prev) => ({
                                      ...prev,
                                      [log.id]: { ...edit, setType: e.target.value as SelectableSetType },
                                    }))
                                  }
                                  style={{ padding: 8 }}
                                >
                                  <option value="top">top</option>
                                  <option value="backoff">backoff</option>
                                </select>
                              </div>
                              <input
                                type="text"
                                value={edit.notes}
                                onChange={(e) =>
                                  setEditForms((prev) => ({
                                    ...prev,
                                    [log.id]: { ...edit, notes: e.target.value },
                                  }))
                                }
                                style={{ padding: 8 }}
                                placeholder="Notes (optional)"
                              />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  onClick={() => saveEdit(log)}
                                  disabled={pendingKey === `save-${log.id}`}
                                  style={{ padding: "6px 10px" }}
                                >
                                  {pendingKey === `save-${log.id}` ? "Saving" : "Save"}
                                </button>
                                <button onClick={() => setEditingId(null)} style={{ padding: "6px 10px" }}>
                                  Cancel
                                </button>
                                <button
                                  onClick={() => deleteSet(log)}
                                  disabled={pendingKey === `delete-${log.id}`}
                                  style={{ padding: "6px 10px" }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                              <div>
                                <strong>
                                  {log.load} x {log.reps}
                                </strong>{" "}
                                <span style={{ textTransform: "uppercase", fontSize: 12, opacity: 0.7 }}>
                                  {log.set_type} #{log.set_index}
                                </span>
                                <div style={{ fontSize: 12, opacity: 0.65 }}>
                                  {new Date(log.performed_at).toLocaleString()}
                                </div>
                              </div>
                              <button onClick={() => beginEdit(log)} style={{ padding: "6px 10px" }}>
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
