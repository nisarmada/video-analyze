import type { SetRecord } from "./setTracker";

export type WorkoutSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  sets: SetRecord[];
};

export class SessionManager {
  private active: WorkoutSession | null = null;

  isActive(): boolean {
    return this.active !== null && this.active.endedAt === null;
  }

  start(): WorkoutSession {
    this.active = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      sets: [],
    };
    return this.active;
  }

  end(): WorkoutSession | null {
    if (!this.active) return null;
    this.active.endedAt = new Date().toISOString();
    const finished = this.active;
    this.active = null;
    return finished;
  }

  ingestSet(record: SetRecord): void {
    if (!this.active || this.active.endedAt) return;
    this.active.sets.push(record);
  }

  getActive(): WorkoutSession | null {
    return this.active;
  }
}
