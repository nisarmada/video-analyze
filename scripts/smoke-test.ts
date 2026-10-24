import { resolveActiveExercise } from "../src/exerciseSelection";
import { cameraGuidance } from "../src/cameraGuidance";
import { buildSignature, signatureDistance } from "../src/identity";
import { DEFAULT_ROM, normalizeThresholds } from "../src/romSettings";
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

assert(DEFAULT_ROM.squat.bottomMax === 115, "default squat ROM");
const fixed = normalizeThresholds({ topMin: 100, bottomMax: 130 });
assert(fixed.topMin > fixed.bottomMax, "normalize inverted ROM");

assert(
  cameraGuidance(undefined).includes("No person"),
  "camera guidance empty frame",
);

const fakeLm = Array.from({ length: 33 }, (_, i) => ({
  x: 0.5 + (i % 5) * 0.01,
  y: 0.4 + (i % 7) * 0.01,
  visibility: 1,
}));
const sig = buildSignature(fakeLm);
assert(sig !== null && sig.length > 0, "signature");
assert(signatureDistance(sig!, sig!) === 0, "signature distance self");

console.log("smoke tests passed");
