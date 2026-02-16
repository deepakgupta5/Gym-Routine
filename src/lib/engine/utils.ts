export function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getMondayUtc(base?: Date) {
  const d = base ? new Date(base) : new Date();
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getNextMondayUtc(base: Date) {
  const d = new Date(base);
  const day = d.getUTCDay();
  const add = day === 0 ? 1 : 8 - day; // if Sunday, next day; else next Monday
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function hashGenerationRules() {
  // Placeholder: replace with stable hash of constants once engine is finalized
  return "v1";
}

export function sessionKey(input: { date: string; session_type: string }) {
  return `${input.date}::${input.session_type}`;
}
