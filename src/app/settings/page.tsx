"use client";

import { useEffect, useMemo, useState } from "react";

type ProfileResponse = {
  profile: {
    tdee_calculated: number | null;
    tdee_override: number | null;
    effective_tdee: number;
    training_day_calories: number;
    rest_day_calories: number;
  };
};

function formatNumber(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value)}`;
}

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<ProfileResponse["profile"] | null>(null);
  const [overrideInput, setOverrideInput] = useState("");

  async function load() {
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = overrideInput.trim();
    if (trimmed.length === 0) {
      void saveOverride(null);
      return;
    }

    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 1400 || next > 5000) {
      setError("Enter a valid TDEE override between 1400 and 5000.");
      return;
    }

    void saveOverride(next);
  }

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-100">Settings</h1>

      <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-300">
        TDEE override applies to future goals only (starting today). Historical goal rows remain unchanged.
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-600 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-lg border border-green-600 bg-green-950/40 p-3 text-sm text-green-200">{success}</div>
      ) : null}

      <section className="mb-4 rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-medium text-gray-100">TDEE</h2>

        {loading || !data ? (
          <p className="text-sm text-gray-300">Loading settings...</p>
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

            <form onSubmit={onSubmit} className="space-y-3">
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
    </main>
  );
}
