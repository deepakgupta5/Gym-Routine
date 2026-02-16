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

export function getExerciseImageUrl(
  exerciseId?: number | null,
  primaryMuscle?: string | null,
  variant: "main" | "backup-1" | "backup-2" = "main"
) {
  if (exerciseId && exerciseId >= 1 && exerciseId <= 25) {
    return `/exercises/exercise-${String(exerciseId).padStart(2, "0")}-${variant}.svg`;
  }

  if (!primaryMuscle) return "/exercises/fullbody.svg";
  const key = MUSCLE_TO_ICON[primaryMuscle] || "fullbody";
  return `/exercises/${key}.svg`;
}
