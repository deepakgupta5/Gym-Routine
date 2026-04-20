"use client";

import { useEffect, useMemo, useState } from "react";

// ─── Nutrition types ────────────────────────────────────────────────────────

type ProfileResponse = {
  profile: {
    tdee_calculated: number | null;
    tdee_override: number | null;
    effective_tdee: number;
    training_day_calories: number;
    rest_day_calories: number;
  };
};

// ─── Exercise settings types ─────────────────────────────────────────────────

type ExerciseSetting = {
  exercise_id: number;
  name: string;
  muscle_primary: string;
  is_enabled: boolean;
  user_preference_score: number;
  load_increment_lb: number;
};

type ExerciseSettingsResponse = {
  exercises: ExerciseSetting[];
};

// ─── Upcoming session type ────────────────────────────────────────────────────

type UpcomingSession = {
  plan_session_id: string;
  session_type: string;
  date: string;
  is_deload: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value)}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  other: "Other",
};

const PREF_LABELS = ["Skip", "Low", "Normal", "High"] as const;
const PREF_COLORS = [
  "border-gray-600 text-gray-500",
  "border-gray-500 text-gray-300",
  "border-blue-600 text-blue-300 bg-blue-900/30",
  "border-green-600 text-green-300 bg-green-900/30",
] as const;

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // ─── Nutrition state ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<ProfileResponse["profile"] | null>(null);
  const [overrideInput, setOverrideInput] = useState("");

  // ─── Exercise settings state ────────────────────────────────────────────────
  const [exLoading, setExLoading] = useState(true);
  const [exercises, setExercises] = useState<ExerciseSetting[]>([]);
  const [exError, setExError] = useState<string | null>(null);
  const [pendingExId, setPendingExId] = useState<number | null>(null);
  const [incrementEdits, setIncrementEdits] = useState<Record<number, string>>({});

  // ─── Deload state ───────────────────────────────────────────────────────────
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [deloadSaving, setDeloadSaving] = useState<string | null>(null);

  // ─── Load nutrition ─────────────────────────────────────────────────────────
  async function loadNutrition() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/nutrition/profile", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ProfileResponse | { error?: string } | null;
    if (!res.ok || !json || !("profile" in json)) {
      setError("Could not load nutrition settings.");
      setLoading(false);
      return;
    }
    const profile = json.profile;
    setData(profile);
    setOverrideInput(profile.tdee_override == null ? "" : String(Math.round(profile.tdee_override)));
    setLoading(false);
  }

  // ─── Load exercise settings ──────────────────────────────────────────────────
  async function loadExercises() {
    setExLoading(true);
    setExError(null);
    const res = await fetch("/api/plan/exercise-settings", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ExerciseSettingsResponse | { error?: string } | null;
    if (!res.ok || !json || !("exercises" in json)) {
      setExError("Could not load exercise settings.");
      setExLoading(false);
      return;
    }
    setExercises(json.exercises);
    const inits: Record<number, string> = {};
    for (const ex of json.exercises) inits[ex.exercise_id] = String(ex.load_increment_lb);
    setIncrementEdits(inits);
    setExLoading(false);
  }

  // ─── Load upcoming sessions ──────────────────────────────────────────────────
  async function loadUpcoming() {
    const res = await fetch(`/api/plan/week?date=${todayUtc()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { sessions?: UpcomingSession[] } | null;
    if (res.ok && json && Array.isArray(json.sessions)) {
      setUpcomingSessions(
        json.sessions.filter((s: UpcomingSession) => s.date >= todayUtc())
      );
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadNutrition();
    void loadExercises();
    void loadUpcoming();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Nutrition handlers ──────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!data) return false;
    const current = data.tdee_override == null ? "" : String(Math.round(data.tdee_override));
    return overrideInput.trim() !== current;
  }, [data, overrideInput]);

  async function saveOverride(nextValue: number | null) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/nutrition/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tdee_override: nextValue }),
    });
    const json = (await res.json().catch(() => null)) as ProfileResponse | { error?: string } | null;
    if (!res.ok || !json || !("profile" in json)) {
      setSaving(false);
      setError("Could not save TDEE override.");
      return;
    }
    setData(json.profile);
    setOverrideInput(json.profile.tdee_override == null ? "" : String(Math.round(json.profile.tdee_override)));
    setSaving(false);
    setSuccess("Saved. Future nutrition goals were regenerated from today.");
  }

  function onSubmitNutrition(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = overrideInput.trim();
    if (trimmed.length === 0) { void saveOverride(null); return; }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 1400 || next > 5000) {
      setError("Enter a valid TDEE override between 1400 and 5000.");
      return;
    }
    void saveOverride(next);
  }

  // ─── Exercise handlers ───────────────────────────────────────────────────────
  async function patchExercise(exercise_id: number, patch: Partial<Omit<ExerciseSetting, "exercise_id" | "name" | "muscle_primary">>) {
    setPendingExId(exercise_id);
    setExError(null);
    const res = await fetch("/api/plan/exercise-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_id, ...patch }),
    });
    const json = (await res.json().catch(() => null)) as { exercise?: ExerciseSetting; error?: string } | null;
    setPendingExId(null);
    if (!res.ok || !json?.exercise) {
      setExError(`Could not update exercise.`);
      return;
    }
    setExercises((prev) => prev.map((ex) => ex.exercise_id === exercise_id ? { ...ex, ...json.exercise } : ex));
    setIncrementEdits((prev) => ({ ...prev, [exercise_id]: String(json.exercise!.load_increment_lb) }));
  }

  function saveIncrement(exercise_id: number) {
    const raw = incrementEdits[exercise_id] ?? "";
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 1 || val > 50) {
      setExError("Load increment must be 1-50 lb.");
      return;
    }
    void patchExercise(exercise_id, { load_increment_lb: val });
  }

  // ─── Deload handler ──────────────────────────────────────────────────────────
  async function toggleDeload(session: UpcomingSession) {
    setDeloadSaving(session.plan_session_id);
    const res = await fetch("/api/plan/toggle-deload", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session.plan_session_id, is_deload: !session.is_deload }),
    });
    setDeloadSaving(null);
    if (res.ok) {
      setUpcomingSessions((prev) =>
        prev.map((s) =>
          s.plan_session_id === session.plan_session_id ? { ...s, is_deload: !s.is_deload } : s
        )
      );
    }
  }

  // ─── Group exercises by muscle ───────────────────────────────────────────────
  const byMuscle = useMemo(() => {
    const map = new Map<string, ExerciseSetting[]>();
    for (const ex of exercises) {
      const key = ex.muscle_primary ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ex);
    }
    return map;
  }, [exercises]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Settings</h1>

      {/* ── Nutrition ── */}
      <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-medium text-gray-100">Nutrition</h2>

        <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-400">
          TDEE override applies to future goals only (starting today).
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-600 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-600 bg-green-950/40 p-3 text-sm text-green-200">{success}</div>
        )}

        {loading || !data ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            <div className="mb-4 grid gap-2 text-sm text-gray-200 md:grid-cols-3">
              <div className="rounded border border-gray-700 bg-gray-800 p-3">
                <div className="text-gray-400">Calculated</div>
                <div className="text-lg font-semibold">{formatNumber(data.tdee_calculated)} kcal</div>
              </div>
              <div className="rounded border border-gray-700 bg-gray-800 p-3">
                <div className="text-gray-400">Effective</div>
                <div className="text-lg font-semibold">{formatNumber(data.effective_tdee)} kcal</div>
              </div>
              <div className="rounded border border-gray-700 bg-gray-800 p-3">
                <div className="text-gray-400">Override</div>
                <div className="text-lg font-semibold">{formatNumber(data.tdee_override)} kcal</div>
              </div>
            </div>
            <div className="mb-4 grid gap-2 text-sm text-gray-200 md:grid-cols-2">
              <div className="rounded border border-gray-700 bg-gray-800 p-3">
                <div className="text-gray-400">Training day target</div>
                <div className="text-lg font-semibold">{formatNumber(data.training_day_calories)} kcal</div>
              </div>
              <div className="rounded border border-gray-700 bg-gray-800 p-3">
                <div className="text-gray-400">Rest day target</div>
                <div className="text-lg font-semibold">{formatNumber(data.rest_day_calories)} kcal</div>
              </div>
            </div>
            <form onSubmit={onSubmitNutrition} className="space-y-3">
              <label className="block text-sm text-gray-300" htmlFor="tdee_override">
                TDEE Override (kcal)
              </label>
              <input
                id="tdee_override"
                type="number"
                min={1400}
                max={5000}
                step={25}
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 outline-none focus:border-blue-500"
                placeholder="Leave blank to use calculated value"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving || !isDirty}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Override"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveOverride(null)}
                  className="rounded border border-gray-600 px-4 py-2 text-sm font-medium text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear Override
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {/* ── Deload toggle ── */}
      {upcomingSessions.length > 0 && (
        <section className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-1 text-lg font-medium text-gray-100">Deload</h2>
          <p className="mb-3 text-xs text-gray-500">
            Mark a session as a deload week. Load targets will be reduced automatically on the next generation.
          </p>
          <div className="grid gap-2">
            {upcomingSessions.slice(0, 5).map((s) => (
              <div key={s.plan_session_id} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-200">
                    {isoToDmy(s.date)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 capitalize">
                    {s.session_type.replace(/_/g, " ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleDeload(s)}
                  disabled={deloadSaving === s.plan_session_id}
                  className={`min-h-[36px] rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                    s.is_deload
                      ? "border-amber-600 bg-amber-900/30 text-amber-300 hover:bg-amber-800/40"
                      : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  } disabled:opacity-50`}
                >
                  {deloadSaving === s.plan_session_id ? "..." : s.is_deload ? "Deload ON" : "Deload OFF"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Exercise preferences ── */}
      <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-1 text-lg font-medium text-gray-100">Exercise Preferences</h2>
        <p className="mb-3 text-xs text-gray-500">
          Preference influences how often an exercise is selected. Load increment controls how much weight increases after hitting the top rep target.
        </p>

        {exError && (
          <div className="mb-3 rounded-lg border border-red-600 bg-red-950/40 p-3 text-sm text-red-200">{exError}</div>
        )}

        {exLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : exercises.length === 0 ? (
          <p className="text-sm text-gray-500">No v2 exercises found. Enable the v2 scheduler first.</p>
        ) : (
          <div className="space-y-5">
            {Array.from(byMuscle.entries()).map(([muscle, exList]) => (
              <div key={muscle}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {MUSCLE_LABEL[muscle] ?? muscle}
                </h3>
                <div className="grid gap-2">
                  {exList.map((ex) => {
                    const isPending = pendingExId === ex.exercise_id;
                    const incrementVal = incrementEdits[ex.exercise_id] ?? String(ex.load_increment_lb);
                    const incrementDirty = Number(incrementVal) !== ex.load_increment_lb;

                    return (
                      <div
                        key={ex.exercise_id}
                        className={`rounded-lg border bg-gray-800 p-3 transition-opacity ${
                          !ex.is_enabled ? "opacity-50 border-gray-700" : "border-gray-600"
                        } ${isPending ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Name + enable toggle */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={ex.is_enabled ? "Disable exercise" : "Enable exercise"}
                              onClick={() => void patchExercise(ex.exercise_id, { is_enabled: !ex.is_enabled })}
                              disabled={isPending}
                              className={`h-5 w-5 shrink-0 rounded border-2 transition-colors ${
                                ex.is_enabled
                                  ? "border-blue-500 bg-blue-600"
                                  : "border-gray-600 bg-gray-700"
                              } disabled:opacity-50`}
                            >
                              {ex.is_enabled && (
                                <svg viewBox="0 0 12 10" fill="none" className="w-full p-0.5">
                                  <path d="M1 5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                            <span className="text-sm font-medium text-gray-200">{ex.name}</span>
                          </div>

                          {/* Load increment */}
                          <div className="flex shrink-0 items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={50}
                              step={2.5}
                              value={incrementVal}
                              onChange={(e) =>
                                setIncrementEdits((prev) => ({ ...prev, [ex.exercise_id]: e.target.value }))
                              }
                              onBlur={() => { if (incrementDirty) saveIncrement(ex.exercise_id); }}
                              disabled={isPending}
                              className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-right text-sm text-gray-100 outline-none focus:border-blue-500 disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-500">lb</span>
                          </div>
                        </div>

                        {/* Preference score */}
                        <div className="mt-2 flex gap-1">
                          {PREF_LABELS.map((label, score) => (
                            <button
                              key={score}
                              type="button"
                              onClick={() => void patchExercise(ex.exercise_id, { user_preference_score: score })}
                              disabled={isPending}
                              className={`flex-1 rounded border py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                ex.user_preference_score === score
                                  ? PREF_COLORS[score]
                                  : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
