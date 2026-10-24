import type { ExerciseGuess, ExerciseId } from "./exercises";

export type ExerciseMode = "auto" | ExerciseId;

export const CONFIDENCE_COUNT_THRESHOLD = 0.35;

export function resolveActiveExercise(
  mode: ExerciseMode,
  guess: ExerciseGuess,
): { exercise: ExerciseId; counting: boolean; reason: string } {
  if (mode !== "auto") {
    return {
      exercise: mode,
      counting: true,
      reason: "manual",
    };
  }

  if (guess.id === "other" || guess.confidence < CONFIDENCE_COUNT_THRESHOLD) {
    return {
      exercise: "other",
      counting: false,
      reason: "low_confidence",
    };
  }

  return {
    exercise: guess.id,
    counting: true,
    reason: "auto",
  };
}
