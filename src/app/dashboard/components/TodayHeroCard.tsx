import Link from "next/link";

type HeroExercise = {
  name: string;
  role: "primary" | "secondary" | "accessory";
  top_set_target_load_lb: number | null;
  top_set_target_reps: number | null;
  back_off_target_load_lb: number | null;
  back_off_target_reps: number | null;
  per_side_reps: boolean;
  prescribed_sets: number;
};

type TodayHeroCardProps = {
  sessionDmy: string;
  sessionType: string;
  isV2: boolean;
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

export default function TodayHeroCard({
  sessionDmy,
  sessionType,
  isV2,
  exercises,
}: TodayHeroCardProps) {
  const label = DAY_TYPE_LABELS[sessionType] ?? sessionType;
  const colors = dayColors(sessionType);

  const sorted = [...exercises].sort((a, b) => roleOrder(a.role) - roleOrder(b.role));
  // Show primary + secondary for compound days, all 3 primaries for full_body
  const preview = sorted.slice(0, sessionType === "full_body" ? 3 : 2);

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
                <div className="mt-0.5 text-xs text-gray-400">
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
    </section>
  );
}
