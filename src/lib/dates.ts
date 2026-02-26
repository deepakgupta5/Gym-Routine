/**
 * Centralized date utility functions.
 * All date helpers used across engine, db, and nutrition modules live here.
 * Import from "@/lib/dates" instead of defining local copies.
 */

/** Format a Date object as "YYYY-MM-DD" (UTC). */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse an ISO date string "YYYY-MM-DD" into a Date at midnight UTC. */
export function parseIsoDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}

/** Add `days` calendar days to a Date (non-mutating). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Return the Monday (UTC) of the week containing `base` (defaults to today). */
export function getMondayUtc(base?: Date): Date {
  const d = base ? new Date(base) : new Date();
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Return the next Monday (UTC) after `base`. */
export function getNextMondayUtc(base: Date): Date {
  const d = new Date(base);
  const day = d.getUTCDay();
  const add = day === 0 ? 1 : 8 - day; // if Sunday, next day; else next Monday
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Return the ISO date string "YYYY-MM-DD" of the Monday of the week containing `date` (UTC). */
export function getWeekStartDateUtc(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Return { start, end } Date objects for the 7-day week beginning on `weekStart` (YYYY-MM-DD). */
export function getWeekRangeUtc(weekStart: string): { start: Date; end: Date } {
  const start = new Date(weekStart + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/**
 * Derive the week-start string ("YYYY-MM-DD") from a full ISO timestamp.
 * e.g. "2024-03-15T12:00:00Z" → "2024-03-11" (the Monday of that week)
 */
export function getWeekStartFromTimestamp(ts: string): string {
  return getWeekStartDateUtc(new Date(ts));
}

/** Number of full days from `aIso` to `bIso` (both "YYYY-MM-DD"). Always ≥ 0. */
export function dayDiff(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}

/** Return true if `date` ("YYYY-MM-DD") is a Sunday (UTC). */
export function isSunday(date: string): boolean {
  return parseIsoDate(date).getUTCDay() === 0;
}
