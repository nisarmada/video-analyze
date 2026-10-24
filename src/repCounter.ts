import type { ExerciseId } from "./exercises";
import { EmaSmoother } from "./math";
import type { PoseFeatures } from "./landmarks";

export type RepPhase = "idle" | "eccentric" | "bottom" | "concentric" | "top";

export type RepCounterState = {
  reps: number;
  phase: RepPhase;
  lastRepAt: number | null;
};

type FsmState = "start" | "down" | "up";

const MIN_REP_MS = 450;
const DEBOUNCE_FRAMES = 4;

abstract class BaseRepCounter {
  protected fsm: FsmState = "start";
  protected debounce = 0;
  reps = 0;
  phase: RepPhase = "idle";
  lastRepAt: number | null = null;
  protected smoother: EmaSmoother;

  constructor(alpha = 0.35) {
    this.smoother = new EmaSmoother(alpha);
  }

  reset(): void {
    this.fsm = "start";
    this.debounce = 0;
    this.reps = 0;
    this.phase = "idle";
    this.lastRepAt = null;
    this.smoother.reset();
  }

  abstract update(f: PoseFeatures, nowMs: number): void;

  protected tryRep(nowMs: number): void {
    if (this.lastRepAt !== null && nowMs - this.lastRepAt < MIN_REP_MS) return;
    this.reps++;
    this.lastRepAt = nowMs;
  }

  protected bumpDebounce(): boolean {
    this.debounce++;
    return this.debounce >= DEBOUNCE_FRAMES;
  }

  protected clearDebounce(): void {
    this.debounce = 0;
  }

  snapshot(): RepCounterState {
    return {
      reps: this.reps,
      phase: this.phase,
      lastRepAt: this.lastRepAt,
    };
  }
}

/** Elbow angle: extended at top, bent at bottom. */
export class PushUpCounter extends BaseRepCounter {
  private readonly topMin = 155;
  private readonly bottomMax = 105;

  update(f: PoseFeatures, nowMs: number): void {
    const a = this.smoother.push(f.elbowAngle);
    if (this.fsm === "start") {
      this.phase = a >= this.topMin ? "top" : "eccentric";
      if (a <= this.bottomMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= this.bottomMax ? "bottom" : "concentric";
      if (a >= this.topMin) {
        if (this.bumpDebounce()) {
          this.tryRep(nowMs);
          this.fsm = "start";
          this.phase = "top";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    }
  }
}

export class PullUpCounter extends BaseRepCounter {
  private readonly hangMin = 155;
  private readonly topMax = 105;

  update(f: PoseFeatures, nowMs: number): void {
    const a = this.smoother.push(f.elbowAngle);
    if (this.fsm === "start") {
      this.phase = a >= this.hangMin ? "top" : "concentric";
      if (a <= this.topMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= this.topMax ? "bottom" : "eccentric";
      if (a >= this.hangMin) {
        if (this.bumpDebounce()) {
          this.tryRep(nowMs);
          this.fsm = "start";
          this.phase = "top";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    }
  }
}

export class SquatCounter extends BaseRepCounter {
  private readonly standMin = 155;
  private readonly deepMax = 115;

  update(f: PoseFeatures, nowMs: number): void {
    if (!Number.isFinite(f.kneeAngle)) {
      this.phase = "idle";
      return;
    }
    const a = this.smoother.push(f.kneeAngle);
    if (this.fsm === "start") {
      this.phase = a >= this.standMin ? "top" : "eccentric";
      if (a <= this.deepMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= this.deepMax ? "bottom" : "concentric";
      if (a >= this.standMin) {
        if (this.bumpDebounce()) {
          this.tryRep(nowMs);
          this.fsm = "start";
          this.phase = "top";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    }
  }
}

export class RepCounterHub {
  private pushup = new PushUpCounter();
  private pullup = new PullUpCounter();
  private squat = new SquatCounter();
  private active: ExerciseId = "other";

  setActive(exercise: ExerciseId): void {
    if (exercise === this.active) return;
    this.active = exercise;
    this.pushup.reset();
    this.pullup.reset();
    this.squat.reset();
  }

  resetAll(): void {
    this.active = "other";
    this.pushup.reset();
    this.pullup.reset();
    this.squat.reset();
  }

  update(exercise: ExerciseId, f: PoseFeatures, nowMs: number): RepCounterState {
    if (exercise !== this.active) this.setActive(exercise);
    if (exercise === "pushup") this.pushup.update(f, nowMs);
    else if (exercise === "pullup") this.pullup.update(f, nowMs);
    else if (exercise === "squat") this.squat.update(f, nowMs);
    else {
      return { reps: 0, phase: "idle", lastRepAt: null };
    }
    return this.current().snapshot();
  }

  current(): BaseRepCounter {
    switch (this.active) {
      case "pushup":
        return this.pushup;
      case "pullup":
        return this.pullup;
      case "squat":
        return this.squat;
      default:
        return this.pushup;
    }
  }

  adjustRep(delta: number): void {
    const c = this.current();
    c.reps = Math.max(0, c.reps + delta);
  }

  snapshot(): RepCounterState {
    if (this.active === "other") {
      return { reps: 0, phase: "idle", lastRepAt: null };
    }
    return this.current().snapshot();
  }
}
