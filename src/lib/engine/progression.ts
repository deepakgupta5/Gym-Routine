export type LoadSemantic = "normal" | "assistance";

export function roundToIncrement(value: number, increment: number) {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

export function computeNextTopSetLoad(input: {
  last_prescribed_load: number;
  last_performed_reps: number;
  cap_pct: number;
  increment: number;
  load_semantic?: LoadSemantic;
}) {
  const {
    last_prescribed_load,
    last_performed_reps,
    cap_pct,
    increment,
    load_semantic = "normal",
  } = input;

  if (load_semantic === "assistance") {
    if (last_performed_reps >= 6) {
      return Math.max(0, last_prescribed_load - increment);
    }
    if (last_performed_reps >= 4) {
      return last_prescribed_load;
    }
    return last_prescribed_load + increment;
  }

  if (last_performed_reps >= 6) {
    const inc = Math.min(last_prescribed_load * cap_pct, increment);
    return roundToIncrement(last_prescribed_load + inc, increment);
  }

  if (last_performed_reps >= 4) {
    return last_prescribed_load;
  }

  return Math.max(0, last_prescribed_load - increment);
}

export function estimate1RM(load: number, reps: number) {
  return load * (1 + reps / 30);
}
