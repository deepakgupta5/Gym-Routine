import { PlanSessionRow } from "@/lib/engine/schedule";

type Progress = {
  currentBlockWeek: number;
  blockComplete: boolean;
  completedWeeks: number[];
};

export function computeBlockProgressFromSessions(
  sessions: PlanSessionRow[]
): Progress {
  const byWeek = new Map<number, { required: number; performed: number }>();

  for (const s of sessions) {
    if (!byWeek.has(s.week_in_block)) {
      byWeek.set(s.week_in_block, { required: 0, performed: 0 });
    }
    const entry = byWeek.get(s.week_in_block)!;
    if (s.is_required) {
      entry.required += 1;
      if (s.performed_at) entry.performed += 1;
    }
  }

  const completedWeeks: number[] = [];

  for (let week = 1; week <= 8; week++) {
    const entry = byWeek.get(week);
    if (!entry || entry.required === 0) break;
    if (entry.performed === entry.required) {
      completedWeeks.push(week);
    } else {
      break;
    }
  }

  const currentBlockWeek = Math.min(completedWeeks.length + 1, 8);

  const allWeeksComplete =
    completedWeeks.length === 8 &&
    Array.from(byWeek.values()).every((e) => e.required > 0);

  return {
    currentBlockWeek,
    blockComplete: allWeeksComplete,
    completedWeeks,
  };
}
