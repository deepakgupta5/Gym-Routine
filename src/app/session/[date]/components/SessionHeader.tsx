import Link from "next/link";
import CardioEditor from "./CardioEditor";
import { SessionView } from "./types";

type SessionHeaderProps = {
  session: SessionView;
  doneExercises: number;
  totalExercises: number;
  cardioValue: string;
  cardioDirty: boolean;
  cardioComplete: boolean;
  onCardioChange: (value: string) => void;
  onSaveCardio: () => void;
  isSavingCardio: boolean;
};

function addDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToDmy(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

function formatDisplayDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: "UTC" }).format(d);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(d);
  return `${weekday}, ${day} ${month} ${year}`;
}

export default function SessionHeader({
  session,
  doneExercises,
  totalExercises,
  cardioValue,
  cardioDirty,
  cardioComplete,
  onCardioChange,
  onSaveCardio,
  isSavingCardio,
}: SessionHeaderProps) {
  const prevDmy = isoToDmy(addDaysIso(session.date, -1));
  const nextDmy = isoToDmy(addDaysIso(session.date, 1));

  const normalizedDoneExercises = Math.min(doneExercises, totalExercises);
  const tasksDone = normalizedDoneExercises + (cardioComplete ? 1 : 0);
  const tasksTotal = totalExercises + 1;
  const progressPct = Math.max(0, Math.min(100, Math.round((tasksDone / tasksTotal) * 100)));
  const complete = normalizedDoneExercises === totalExercises && cardioComplete;

  let statusText = `${normalizedDoneExercises} / ${totalExercises} exercises done`;
  if (normalizedDoneExercises === totalExercises && !cardioComplete) {
    statusText = "Exercises complete - save cardio to finish";
  }
  if (complete) {
    statusText = "Session complete";
  }

  return (
    <header className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/session/${prevDmy}`}
          className="min-h-[44px] rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-100 active:opacity-80"
        >
          ← Prev
        </Link>
        <h1 className="text-center text-2xl font-semibold text-gray-100">{formatDisplayDate(session.date)}</h1>
        <Link
          href={`/session/${nextDmy}`}
          className="min-h-[44px] rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-100 active:opacity-80"
        >
          Next →
        </Link>
      </div>

      <div className="mb-3">
        <div className="mb-1 h-2 w-full rounded-full bg-gray-900">
          <div
            className={`h-2 rounded-full transition-all ${complete ? "bg-green-600" : "bg-blue-600"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="text-sm text-gray-300">{statusText}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {session.is_deload ? (
          <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-amber-300">
            Deload
          </span>
        ) : null}

        <CardioEditor
          value={cardioValue}
          isSaving={isSavingCardio}
          isDirty={cardioDirty}
          isComplete={cardioComplete}
          onChange={onCardioChange}
          onSave={onSaveCardio}
        />
      </div>
    </header>
  );
}
