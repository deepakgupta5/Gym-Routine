// Date utilities consolidated in @/lib/dates — re-export for backward compat.
export { toDateString, addDays, getMondayUtc, getNextMondayUtc } from "@/lib/dates";

export function hashGenerationRules() {
  // Placeholder: replace with stable hash of constants once engine is finalized
  return "v1";
}

export function sessionKey(input: { date: string; session_type: string }) {
  return `${input.date}::${input.session_type}`;
}
