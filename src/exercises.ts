import type { PoseFeatures } from "./landmarks";

export type ExerciseId = "pushup" | "squat" | "pullup" | "other";

export type ExerciseGuess = {
  id: ExerciseId;
  confidence: number;
  scores: Record<ExerciseId, number>;
};

const LABEL: Record<ExerciseId, string> = {
  pushup: "Push-up",
  squat: "Squat",
  pullup: "Pull-up",
  other: "Other / rest",
};

export function exerciseLabel(id: ExerciseId): string {
  return LABEL[id];
}

export function classifyExercise(f: PoseFeatures): ExerciseGuess {
  const scores: Record<ExerciseId, number> = {
    pushup: 0,
    squat: 0,
    pullup: 0,
    other: 0.15,
  };

  const horizontal = f.torsoFromVerticalDeg > 55;
  const vertical = f.torsoFromVerticalDeg < 35;

  if (horizontal) {
    scores.pushup += 0.55;
    if (f.elbowAngle < 130) scores.pushup += 0.2;
  }

  const profileView = f.shoulderSpan < 0.14;
  const legsHanging =
    !Number.isFinite(f.kneeAngle) || f.kneeAngle > 135;
  const feetWide =
    Number.isFinite(f.ankleSpan) && f.ankleSpan > 0.11;
  const armsElevatedForHang =
    f.wristAboveShoulder >= 0.03 || f.elbowAboveShoulder >= 0.03;
  const squatting =
    Number.isFinite(f.kneeAngle) && f.kneeAngle < 140;
  const pullUpProfile =
    vertical &&
    profileView &&
    legsHanging &&
    !horizontal &&
    !feetWide &&
    !squatting &&
    armsElevatedForHang;
  const pullUpFront = vertical && f.wristAboveShoulder > 0.02;

  if (vertical && Number.isFinite(f.kneeAngle)) {
    if (feetWide || f.kneeAngle < 150) {
      scores.squat += 0.45;
      if (f.kneeAngle < 130) scores.squat += 0.25;
      if (f.wristAboveShoulder < 0.05) scores.squat += 0.1;
    } else if (!pullUpProfile) {
      scores.squat += 0.35;
    }
  }

  if (pullUpFront || pullUpProfile) {
    scores.pullup += 0.52;
    if (f.elbowAngle < 120) scores.pullup += 0.22;
  }

  if (pullUpFront && f.wristAboveShoulder > 0.08 && f.elbowAngle > 150) {
    scores.pullup += 0.15;
  }

  if (pullUpProfile && f.elbowAngle > 145) {
    scores.pullup += 0.12;
  }

  let best: ExerciseId = "other";
  let bestScore = scores.other;
  (["pushup", "squat", "pullup"] as const).forEach((id) => {
    if (scores[id] > bestScore) {
      bestScore = scores[id];
      best = id;
    }
  });

  const sum =
    scores.pushup + scores.squat + scores.pullup + scores.other || 1;
  const confidence = best === "other" ? 0 : Math.min(1, bestScore / sum);

  return { id: best, confidence, scores };
}

/** Require stable label before switching active exercise. */
export class ExerciseStabilizer {
  private current: ExerciseId = "other";
  private candidate: ExerciseId = "other";
  private streak = 0;
  private readonly needed = 12;

  reset(): void {
    this.current = "other";
    this.candidate = "other";
    this.streak = 0;
  }

  getActive(): ExerciseId {
    return this.current;
  }

  update(guess: ExerciseGuess): ExerciseId {
    if (guess.confidence < 0.35) {
      this.streak = 0;
      return this.current;
    }
    const id = guess.id;
    if (id === this.candidate) {
      this.streak++;
    } else {
      this.candidate = id;
      this.streak = 1;
    }
    if (this.streak >= this.needed && id !== "other") {
      this.current = id;
    }
    return this.current;
  }

  force(id: ExerciseId): void {
    this.current = id;
    this.candidate = id;
    this.streak = this.needed;
  }
}
