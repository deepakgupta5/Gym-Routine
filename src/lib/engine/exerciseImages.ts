const MUSCLE_TO_ICON: Record<string, string> = {
  Chest: "chest",
  Back: "back",
  Shoulders: "shoulders",
  Biceps: "arms",
  Triceps: "arms",
  Quads: "quads",
  Hamstrings: "hamstrings",
  Glutes: "glutes",
  Calves: "calves",
  Core: "core",
};

export function getExerciseImageUrl(primaryMuscle?: string | null) {
  if (!primaryMuscle) return "/exercises/fullbody.svg";
  const key = MUSCLE_TO_ICON[primaryMuscle] || "fullbody";
  return `/exercises/${key}.svg`;
}
