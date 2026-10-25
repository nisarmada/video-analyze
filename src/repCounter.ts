import type { ExerciseId } from "./exercises";
import type { PoseFeatures } from "./landmarks";
import { EmaSmoother } from "./math";
import { DEFAULT_ROM, type RomSettings, type RomThresholds } from "./romSettings";

export type RepPhase = "idle" | "eccentric" | "bottom" | "concentric" | "top";

export type RepCounterState = {
  reps: number;
  phase: RepPhase;
  lastRepAt: number | null;
};

type FsmState = "start" | "down" | "up";

const MIN_REP_MS = 450;
const DEBOUNCE_FRAMES = 3;

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
  private thresholds: RomThresholds = DEFAULT_ROM.pushup;

  setThresholds(t: RomThresholds): void {
    this.thresholds = t;
  }

  update(f: PoseFeatures, nowMs: number): void {
    const { topMin, bottomMax } = this.thresholds;
    const a = this.smoother.push(f.elbowAngle);
    if (this.fsm === "start") {
      this.phase = a >= topMin ? "top" : "eccentric";
      if (a <= bottomMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= bottomMax ? "bottom" : "concentric";
      if (a >= topMin) {
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
  private thresholds: RomThresholds = DEFAULT_ROM.pullup;

  setThresholds(t: RomThresholds): void {
    this.thresholds = t;
  }

  update(f: PoseFeatures, nowMs: number): void {
    const { topMin: hangMin, bottomMax: topMax } = this.thresholds;
    const a = this.smoother.push(f.elbowAngle);
    if (this.fsm === "start") {
      this.phase = a >= hangMin ? "top" : "concentric";
      if (a <= topMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= topMax ? "bottom" : "eccentric";
      if (a >= hangMin) {
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
  private thresholds: RomThresholds = DEFAULT_ROM.squat;

  setThresholds(t: RomThresholds): void {
    this.thresholds = t;
  }

  update(f: PoseFeatures, nowMs: number): void {
    if (!Number.isFinite(f.kneeAngle)) {
      this.phase = "idle";
      return;
    }
    const { topMin: standMin, bottomMax: deepMax } = this.thresholds;
    const a = this.smoother.push(f.kneeAngle);
    if (this.fsm === "start") {
      this.phase = a >= standMin ? "top" : "eccentric";
      if (a <= deepMax) {
        if (this.bumpDebounce()) {
          this.fsm = "down";
          this.phase = "bottom";
          this.clearDebounce();
        }
      } else this.clearDebounce();
    } else {
      this.phase = a <= deepMax ? "bottom" : "concentric";
      if (a >= standMin) {
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

  applyRomSettings(settings: RomSettings): void {
    this.pushup.setThresholds(settings.pushup);
    this.pullup.setThresholds(settings.pullup);
    this.squat.setThresholds(settings.squat);
  }

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
