import { exerciseLabel } from "./exercises";
import type { WorkoutSession } from "./sessionManager";

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} sec`;
  return `${minutes} min ${seconds} sec`;
}

export function formatWorkoutSummary(session: WorkoutSession): string {
  const lines = [
    `Started ${new Date(session.startedAt).toLocaleString()}`,
    session.endedAt
      ? `Finished ${new Date(session.endedAt).toLocaleString()}`
      : "Finished —",
    `Duration ${formatDuration(session.startedAt, session.endedAt)}`,
    "",
  ];
  if (session.sets.length === 0) {
    lines.push("No sets recorded.");
    return lines.join("\n");
  }
  for (const set of session.sets) {
    const when = new Date(set.endedAt).toLocaleTimeString();
    lines.push(
      `${when} — ${exerciseLabel(set.exercise)} set ${set.setNumber}: ${set.reps} reps`,
    );
  }
  const reps = session.sets.reduce((total, set) => total + set.reps, 0);
  const setLabel = session.sets.length === 1 ? "set" : "sets";
  const repLabel = reps === 1 ? "rep" : "reps";
  lines.push("");
  lines.push(`${session.sets.length} ${setLabel}, ${reps} ${repLabel}`);
  return lines.join("\n");
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function historyToCsv(sessions: WorkoutSession[]): string {
  const header = [
    "workoutId",
    "startedAt",
    "endedAt",
    "exercise",
    "setNumber",
    "reps",
    "setEndedAt",
  ];
  const rows = [header.join(",")];
  for (const session of sessions) {
    for (const set of session.sets) {
      rows.push(
        [
          session.id,
          session.startedAt,
          session.endedAt ?? "",
          set.exercise,
          set.setNumber,
          set.reps,
          set.endedAt,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `${rows.join("\n")}\n`;
}
