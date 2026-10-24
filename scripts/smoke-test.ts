import { resolveActiveExercise } from "../src/exerciseSelection";
import { classifyExercise } from "../src/exercises";
import { PullUpCounter, PushUpCounter, SquatCounter } from "../src/repCounter";
import type { PoseFeatures } from "../src/landmarks";

const base: PoseFeatures = {
  elbowAngle: 170,
  kneeAngle: 170,
  torsoFromVerticalDeg: 70,
  wristAboveShoulder: 0,
  visibilityOk: true,
};

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function runAngles(
  update: (f: PoseFeatures, now: number) => void,
  features: PoseFeatures,
  angles: number[],
  key: "elbowAngle" | "kneeAngle",
): void {
  let t = 0;
  for (const a of angles) {
    for (let i = 0; i < 6; i++) {
      update({ ...features, [key]: a }, t);
      t += 80;
    }
  }
}

const pu = new PushUpCounter();
runAngles(
  (f, now) => pu.update(f, now),
  base,
  [170, 90, 90, 170, 170],
  "elbowAngle",
);
assert(pu.reps === 1, `push-up expected 1 rep, got ${pu.reps}`);

const sq = new SquatCounter();
runAngles(
  (f, now) => sq.update(f, now),
  { ...base, torsoFromVerticalDeg: 10 },
  [170, 100, 100, 170, 170],
  "kneeAngle",
);
assert(sq.reps === 1, `squat expected 1 rep, got ${sq.reps}`);

const pull = new PullUpCounter();
runAngles(
  (f, now) => pull.update(f, now),
  base,
  [170, 90, 90, 170, 170],
  "elbowAngle",
);
assert(pull.reps === 1, `pull-up expected 1 rep, got ${pull.reps}`);

const pushGuess = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 65,
  elbowAngle: 90,
});
assert(pushGuess.id === "pushup", `classify push-up got ${pushGuess.id}`);

const squatGuess = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 15,
  kneeAngle: 100,
  wristAboveShoulder: -0.02,
});
assert(squatGuess.id === "squat", `classify squat got ${squatGuess.id}`);

const manual = resolveActiveExercise("pushup", {
  id: "other",
  confidence: 0,
  scores: { pushup: 0, squat: 0, pullup: 0, other: 1 },
});
assert(manual.counting && manual.exercise === "pushup", "manual lock should count pushup");

const unsure = resolveActiveExercise("auto", {
  id: "pushup",
  confidence: 0.1,
  scores: { pushup: 0.1, squat: 0, pullup: 0, other: 0.9 },
});
assert(!unsure.counting && unsure.exercise === "other", "low confidence should not count");

console.log("smoke tests passed");
