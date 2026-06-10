"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const V2_DAY_TYPES = ["push_upper", "squat_lower", "pull_upper", "hinge_lower", "full_body"] as const;
type V2DayType = typeof V2_DAY_TYPES[number];

type HeroExercise = {
  name: string;
  role: "primary" | "secondary" | "accessory";
  top_set_target_load_lb: number | null;
  top_set_target_reps: number | null;
  back_off_target_load_lb: number | null;
  back_off_target_reps: number | null;
  per_side_reps: boolean;
  prescribed_sets: number;
  rationale_code: string | null;
  rationale_text: string | null;
};

type TodayHeroCardProps = {
  sessionDmy: string;
  sessionType: string;
  isV2: boolean;
  canRegen: boolean;       // true = no logged sets, force-regen is allowed
  exercises: HeroExercise[];
};

const DAY_TYPE_LABELS: Record<string, string> = {
  push_upper: "Push Upper",
  pull_upper: "Pull Upper",
  squat_lower: "Squat Lower",
  hinge_lower: "Hinge Lower",
  full_body: "Full Body",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
  push: "Push",
  pull: "Pull",
  squat: "Squat",
  hinge: "Hinge",
  mixed: "Mixed",
};

const DAY_TYPE_COLORS: Record<string, { border: string; badge: string; text: string }> = {
  push_upper:  { border: "border-blue-500",   badge: "bg-blue-900/50 text-blue-300",   text: "text-blue-400" },
  pull_upper:  { border: "border-green-500",  badge: "bg-green-900/50 text-green-300", text: "text-green-400" },
  squat_lower: { border: "border-amber-500",  badge: "bg-amber-900/50 text-amber-300", text: "text-amber-400" },
  hinge_lower: { border: "border-orange-500", badge: "bg-orange-900/50 text-orange-300", text: "text-orange-400" },
  full_body:   { border: "border-purple-500", badge: "bg-purple-900/50 text-purple-300", text: "text-purple-400" },
};

function dayColors(sessionType: string) {
  return DAY_TYPE_COLORS[sessionType] ?? {
    border: "border-gray-600",
    badge: "bg-gray-800 text-gray-300",
    text: "text-gray-400",
  };
}

function roleOrder(role: HeroExercise["role"]) {
  return role === "primary" ? 0 : role === "secondary" ? 1 : 2;
}

/** Colored delta badge for progression visibility (PRD Section 7). */
function DeltaBadge({ code, text }: { code: string | null; text: string | null }) {
  if (!code || !text) return null;
  const color =
    code === "progression"
      ? "text-green-400"
      : code === "regression"
        ? "text-red-400"
        : "text-gray-500";
  return <span className={`text-xs ${color}`}>{text}</span>;
}

export default function TodayHeroCard({
  sessionDmy,
  sessionType,
  isV2,
  canRegen,
  exercises,
}: TodayHeroCardProps) {
  const router = useRouter();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedDayType, setSelectedDayType] = useState<V2DayType>(
    V2_DAY_TYPES.includes(sessionType as V2DayType) ? (sessionType as V2DayType) : "push_upper"
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = DAY_TYPE_LABELS[sessionType] ?? sessionType;
  const colors = dayColors(sessionType);

  const sorted = [...exercises].sort((a, b) => roleOrder(a.role) - roleOrder(b.role));
  const preview = sorted.slice(0, sessionType === "full_body" ? 3 : 2);

  async function callForceRegen(dayType?: V2DayType) {
    setActionError(null);
    const res = await fetch("/api/plan/force-regen-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: sessionDmy,
        ...(dayType ? { day_type: dayType } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      setActionError((err.error as string) ?? "Failed to regenerate session.");
      return;
    }
    setActionsOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <section className={`rounded-xl border-l-4 border border-gray-700 bg-gray-800 p-4 ${colors.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors.badge}`}>
              Today
            </span>
            {isV2 && (
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                v2
              </span>
            )}
          </div>
          <h2 className={`text-xl font-bold ${colors.text}`}>{label}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href={`/session/${sessionDmy}`}
          className="shrink-0 min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 active:opacity-80 flex items-center"
        >
          Start
        </Link>
      </div>

      {preview.length > 0 && (
        <div className="mt-3 grid gap-2">
          {preview.map((ex, i) => (
            <div key={i} className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-200">{ex.name}</span>
                <span className="shrink-0 text-xs text-gray-500 capitalize">{ex.role}</span>
              </div>
              {isV2 && ex.top_set_target_load_lb !== null ? (
                <div className="mt-0.5 space-y-0.5">
                  <div className="text-xs text-gray-400">
                    <span className="text-blue-300">
                      {ex.top_set_target_reps} reps @ {ex.top_set_target_load_lb} lb
                    </span>
                    {ex.back_off_target_load_lb !== null &&
                      ex.back_off_target_load_lb !== ex.top_set_target_load_lb && (
                        <span className="ml-2 text-amber-300/80">
                          back-off {ex.back_off_target_load_lb} lb
                        </span>
                      )}
                    {ex.per_side_reps && (
                      <span className="ml-1 text-gray-500">(per side)</span>
                    )}
                  </div>
                  <DeltaBadge code={ex.rationale_code} text={ex.rationale_text} />
                </div>
              ) : (
                <div className="mt-0.5 text-xs text-gray-500">
                  {ex.prescribed_sets} sets
                </div>
              )}
            </div>
          ))}
          {exercises.length > preview.length && (
            <p className="text-xs text-gray-500 text-center">
              +{exercises.length - preview.length} more exercises
            </p>
          )}
        </div>
      )}

      {/* Secondary actions (PRD Section 6.1) -- only shown for v2 sessions without logged sets */}
      {isV2 && canRegen && (
        <div className="mt-3 border-t border-gray-700 pt-3">
          <button
            type="button"
            onClick={() => setActionsOpen((o) => !o)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            <span>{actionsOpen ? "Hide actions" : "More actions"}</span>
            <span className="ml-1 text-gray-600">{actionsOpen ? "[-]" : "[+]"}</span>
          </button>

          {actionsOpen && (
            <div className="mt-2 space-y-2">
              {/* Force regenerate */}
              <button
                type="button"
                disabled={isPending}
                onClick={() => callForceRegen(undefined)}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              >
                {isPending ? "Regenerating..." : "Force regenerate (re-pick exercises)"}
              </button>

              {/* Change day type */}
              <div className="flex gap-2">
                <select
                  value={selectedDayType}
                  onChange={(e) => setSelectedDayType(e.target.value as V2DayType)}
                  className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-2 py-2 text-sm text-gray-200"
                >
                  {V2_DAY_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {DAY_TYPE_LABELS[dt]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending || selectedDayType === sessionType}
                  onClick={() => callForceRegen(selectedDayType)}
                  className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                >
                  Change
                </button>
              </div>

              {actionError && (
                <p className="text-xs text-red-400">{actionError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
