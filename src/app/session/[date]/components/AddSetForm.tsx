"use client";

import { useState } from "react";
import { EntryForm, ExerciseView } from "./types";

type AddSetFormProps = {
  role: ExerciseView["role"];
  form: EntryForm;
  isPending: boolean;
  isPrefilled?: boolean;
  onChange: (next: EntryForm) => void;
  onSubmit: () => void;
  onLogButtonRef?: (el: HTMLButtonElement | null) => void;
};

const FIELD_CLASSES =
  "min-h-[44px] w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-100";
const FIELD_ERROR_CLASSES =
  "min-h-[44px] w-full rounded-lg border border-red-700 bg-gray-900 p-3 text-sm text-gray-100";

const RPE_OPTIONS = ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"];

function defaultSetType(role: ExerciseView["role"]) {
  return role === "primary" ? "top" : "backoff";
}

export default function AddSetForm({
  role,
  form,
  isPending,
  isPrefilled = false,
  onChange,
  onSubmit,
  onLogButtonRef,
}: AddSetFormProps) {
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [touched, setTouched] = useState<{ load?: boolean; reps?: boolean }>({});

  const loadVal = Number(form.load);
  const repsVal = Number(form.reps);
  const loadInvalid = touched.load && (!form.load || !Number.isFinite(loadVal) || loadVal <= 0);
  const repsInvalid = touched.reps && (!form.reps || !Number.isFinite(repsVal) || repsVal <= 0 || !Number.isInteger(repsVal));

  function handleSubmit() {
    setTouched({ load: true, reps: true });
    const l = Number(form.load);
    const r = Number(form.reps);
    if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(r) || r <= 0) return;
    onSubmit();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Load</div>
          <input
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            value={form.load}
            onChange={(e) => onChange({ ...form, load: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, load: true }))}
            className={`${loadInvalid ? FIELD_ERROR_CLASSES : FIELD_CLASSES} ${isPrefilled && form.load ? "text-blue-400" : ""}`}
            placeholder="lb"
          />
          {loadInvalid && (
            <div className="mt-0.5 text-xs text-red-400">Enter a valid load</div>
          )}
          {!loadInvalid && isPrefilled && form.load && (
            <div className="mt-0.5 text-xs text-blue-400/70">suggested</div>
          )}
          <div className="mt-1 flex gap-1.5">
            {[2.5, 5, 10].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() =>
                  onChange({ ...form, load: String((parseFloat(form.load) || 0) + inc) })
                }
                className="rounded-full border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 active:opacity-80"
              >
                +{inc}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Reps</div>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.reps}
            onChange={(e) => onChange({ ...form, reps: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, reps: true }))}
            className={repsInvalid ? FIELD_ERROR_CLASSES : FIELD_CLASSES}
            placeholder="reps"
          />
          {repsInvalid && (
            <div className="mt-0.5 text-xs text-red-400">Enter valid reps</div>
          )}
        </label>

        <label className="block col-span-1">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Set Type</div>
          <select
            value={form.setType || defaultSetType(role)}
            onChange={(e) =>
              onChange({ ...form, setType: e.target.value as EntryForm["setType"] })
            }
            className={FIELD_CLASSES}
          >
            <option value="top">top</option>
            <option value="backoff">backoff</option>
          </select>
        </label>

        <button
          type="button"
          ref={onLogButtonRef}
          onClick={handleSubmit}
          disabled={isPending}
          className="min-h-[44px] rounded-lg border border-blue-700 bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 active:opacity-80"
        >
          {isPending ? "Saving" : "Log Set"}
        </button>
      </div>

      {/* Collapsible Notes / RPE — #18: more visible toggle */}
      <button
        type="button"
        onClick={() => setExtrasOpen((p) => !p)}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-gray-100 active:opacity-80"
      >
        {extrasOpen ? "Hide RPE / Notes" : "Add RPE / Notes"}
      </button>

      {extrasOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">RPE</div>
            <select
              value={form.rpe}
              onChange={(e) => onChange({ ...form, rpe: e.target.value })}
              className={FIELD_CLASSES}
            >
              <option value="">--</option>
              {RPE_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Notes</div>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              className={FIELD_CLASSES}
              placeholder="Optional"
            />
          </label>
        </div>
      )}
    </div>
  );
}
