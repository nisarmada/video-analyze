import type { WorkoutSession } from "./sessionManager";

const HISTORY_KEY = "analyze-workout-history-v1";

export function loadWorkoutHistory(): WorkoutSession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkoutSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkoutToHistory(session: WorkoutSession): void {
  const history = loadWorkoutHistory();
  history.unshift(session);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
}

export function exportHistoryJson(): string {
  return JSON.stringify(loadWorkoutHistory(), null, 2);
}

export function clearWorkoutHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
