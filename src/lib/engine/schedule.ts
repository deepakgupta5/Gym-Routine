import { SessionType } from "@/lib/engine/types";

export type PlanSessionRow = {
  plan_session_id: string;
  date: string; // YYYY-MM-DD
  session_type: SessionType;
  is_required: boolean;
  performed_at?: string | null;
  week_in_block: number;
};

export type ShiftResult = {
  updated: Array<{ plan_session_id: string; date: string }>;
  dropped: string[];
};

function toDate(d: string) {
  return new Date(d + "T00:00:00Z");
}

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

function isSunday(date: string) {
  return toDate(date).getUTCDay() === 0;
}

function isLowerStrength(sessionType: SessionType) {
  return sessionType === "Tue";
}

function placeSession(
  session: PlanSessionRow,
  targetDate: string,
  byDate: Map<string, PlanSessionRow>,
  dropped: string[],
  maxIterations = 120
) {
  let date = targetDate;
  let guard = 0;

  // Remove from current date slot
  byDate.delete(session.date);

  while (guard++ < maxIterations) {
    if (isSunday(date)) {
      // Sunday is always a rest day. Never drop Saturday; shift forward.
      date = addDays(date, 1);
      continue;
    }

    const prevDate = addDays(date, -1);
    const prev = byDate.get(prevDate);
    const nextDate = addDays(date, 1);
    const next = byDate.get(nextDate);

    if (
      isLowerStrength(session.session_type) &&
      ((prev && isLowerStrength(prev.session_type)) ||
        (next && isLowerStrength(next.session_type)))
    ) {
      date = addDays(date, 1);
      continue;
    }

    const occupant = byDate.get(date);
    if (occupant && isLowerStrength(session.session_type) && isLowerStrength(occupant.session_type)) {
      date = addDays(date, 1);
      continue;
    }
    if (occupant) {
      if (occupant.performed_at) {
        date = addDays(date, 1);
        continue;
      }
      placeSession(occupant, addDays(date, 1), byDate, dropped, maxIterations);
    }

    session.date = date;
    byDate.set(date, session);
    return;
  }

  throw new Error("schedule_shift_overflow");
}

export function shiftMissedSessions(
  sessions: PlanSessionRow[],
  today: string
): ShiftResult {
  const byDate = new Map<string, PlanSessionRow>();
  const originalDateById = new Map<string, string>();

  for (const s of sessions) {
    byDate.set(s.date, { ...s });
    originalDateById.set(s.plan_session_id, s.date);
  }

  const missed = sessions
    .filter((s) => s.is_required && !s.performed_at && s.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const dropped: string[] = [];

  for (const s of missed) {
    const current = Array.from(byDate.values()).find(
      (x) => x.plan_session_id === s.plan_session_id
    );
    if (!current) continue;
    const targetDate = today > current.date ? today : addDays(current.date, 1);
    placeSession(current, targetDate, byDate, dropped);
  }

  const updated: Array<{ plan_session_id: string; date: string }> = [];
  for (const s of byDate.values()) {
    const original = originalDateById.get(s.plan_session_id);
    if (original && s.date !== original) {
      updated.push({ plan_session_id: s.plan_session_id, date: s.date });
    }
  }

  return { updated, dropped };
}

export function insertRestDay(
  sessions: PlanSessionRow[],
  restDate: string
): ShiftResult {
  const byDate = new Map<string, PlanSessionRow>();
  const originalDateById = new Map<string, string>();

  for (const s of sessions) {
    byDate.set(s.date, { ...s });
    originalDateById.set(s.plan_session_id, s.date);
  }

  const dropped: string[] = [];

  const target = byDate.get(restDate);
  if (target) {
    placeSession(target, addDays(restDate, 1), byDate, dropped);
  }

  const updated: Array<{ plan_session_id: string; date: string }> = [];
  for (const s of byDate.values()) {
    const original = originalDateById.get(s.plan_session_id);
    if (original && s.date !== original) {
      updated.push({ plan_session_id: s.plan_session_id, date: s.date });
    }
  }

  return { updated, dropped };
}
