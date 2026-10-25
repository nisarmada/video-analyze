import { exerciseLabel, type ExerciseId } from "./exercises";

export type SetRecord = {
  exercise: ExerciseId;
  setNumber: number;
  reps: number;
  /** ISO-8601. JSON storage cannot keep a Date instance. */
  endedAt: string;
};

export class SetTracker {
  private exercise: ExerciseId = "other";
  private setNumber = 0;
  private repsInSet = 0;
  private lastRepAt: number | null = null;
  private restMs: number;
  private log: SetRecord[] = [];
  private onSetComplete: ((record: SetRecord) => void) | null = null;

  constructor(restSeconds: number) {
    this.restMs = restSeconds * 1000;
  }

  setOnSetComplete(fn: (record: SetRecord) => void): void {
    this.onSetComplete = fn;
  }

  setRestSeconds(sec: number): void {
    this.restMs = sec * 1000;
  }

  resetSession(): void {
    this.exercise = "other";
    this.setNumber = 0;
    this.repsInSet = 0;
    this.lastRepAt = null;
    this.log = [];
  }

  getLog(): readonly SetRecord[] {
    return this.log;
  }

  snapshot() {
    return {
      exercise: this.exercise,
      setNumber: this.setNumber,
      repsInSet: this.repsInSet,
    };
  }

  onExerciseChange(next: ExerciseId): void {
    if (next === this.exercise) return;
    this.closeSetIfAny();
    this.exercise = next;
    if (next !== "other") {
      this.setNumber++;
      this.repsInSet = 0;
      this.lastRepAt = null;
    }
  }

  /** Keep the same set number when an empty set is pointed at another movement. */
  retargetEmptySet(next: ExerciseId): void {
    if (next === "other" || next === this.exercise) return;
    if (this.setNumber === 0 || this.repsInSet > 0) return;
    this.exercise = next;
    this.lastRepAt = null;
  }

  syncReps(exercise: ExerciseId, reps: number, nowMs: number): void {
    if (exercise === "other") return;
    if (exercise !== this.exercise) this.onExerciseChange(exercise);
    if (this.setNumber === 0) {
      this.setNumber = 1;
      this.exercise = exercise;
    }

    if (reps > this.repsInSet) {
      this.repsInSet = reps;
      this.lastRepAt = nowMs;
    } else if (reps < this.repsInSet) {
      this.repsInSet = reps;
    }
  }

  /** Closes the open set once rest has elapsed. Returns true when a set was closed. */
  tick(nowMs: number): boolean {
    if (this.exercise === "other" || this.repsInSet === 0 || this.lastRepAt === null) {
      return false;
    }
    if (nowMs - this.lastRepAt < this.restMs) return false;
    this.finishSet();
    this.setNumber++;
    return true;
  }

  manualAdjustReps(reps: number): void {
    this.repsInSet = Math.max(0, reps);
    this.lastRepAt = Date.now();
  }

  finishOpenSet(): void {
    this.closeSetIfAny();
  }

  newSet(): void {
    this.closeSetIfAny();
    if (this.exercise !== "other") {
      this.setNumber++;
      this.repsInSet = 0;
      this.lastRepAt = null;
    }
  }

  private closeSetIfAny(): void {
    if (this.exercise !== "other" && this.repsInSet > 0) {
      this.finishSet();
    }
  }

  private finishSet(): void {
    const record: SetRecord = {
      exercise: this.exercise,
      setNumber: this.setNumber,
      reps: this.repsInSet,
      endedAt: new Date().toISOString(),
    };
    this.log.push(record);
    this.onSetComplete?.(record);
    this.repsInSet = 0;
    this.lastRepAt = null;
  }

  formatLogEntry(r: SetRecord): string {
    const t = new Date(r.endedAt).toLocaleTimeString();
    const reps = r.reps === 1 ? "1 rep" : `${r.reps} reps`;
    return `${t} — ${exerciseLabel(r.exercise)} set ${r.setNumber}: ${reps}`;
  }
}
