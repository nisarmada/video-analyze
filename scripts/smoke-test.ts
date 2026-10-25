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
  shoulderSpan: 0.22,
  ankleSpan: 0.14,
  elbowAboveShoulder: -0.08,
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
  shoulderSpan: 0.2,
});
assert(squatGuess.id === "squat", `classify squat got ${squatGuess.id}`);

const pullFront = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 12,
  elbowAngle: 95,
  wristAboveShoulder: 0.06,
  shoulderSpan: 0.2,
  kneeAngle: 165,
});
assert(pullFront.id === "pullup", `classify front pull-up got ${pullFront.id}`);

const pullSide = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 18,
  elbowAngle: 100,
  wristAboveShoulder: 0.04,
  shoulderSpan: 0.08,
  ankleSpan: 0.05,
  elbowAboveShoulder: 0.05,
  kneeAngle: 168,
});
assert(pullSide.id === "pullup", `classify side pull-up got ${pullSide.id}`);

const sideSquatTop = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 15,
  elbowAngle: 165,
  wristAboveShoulder: -0.08,
  shoulderSpan: 0.09,
  ankleSpan: 0.16,
  elbowAboveShoulder: -0.1,
  kneeAngle: 172,
});
assert(sideSquatTop.id === "squat", `classify side squat top got ${sideSquatTop.id}`);

const sideSquatFeetTogether = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 14,
  elbowAngle: 168,
  wristAboveShoulder: -0.07,
  shoulderSpan: 0.09,
  ankleSpan: 0.05,
  elbowAboveShoulder: -0.09,
  kneeAngle: 170,
});
assert(
  sideSquatFeetTogether.id !== "pullup",
  `side squat feet together should not be pull-up, got ${sideSquatFeetTogether.id}`,
);

const gobletSquatProfile = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 12,
  elbowAngle: 85,
  wristAboveShoulder: -0.06,
  elbowAboveShoulder: -0.04,
  shoulderSpan: 0.1,
  ankleSpan: 0.06,
  kneeAngle: 165,
});
assert(
  gobletSquatProfile.id !== "pullup",
  `goblet squat profile should not be pull-up, got ${gobletSquatProfile.id}`,
);

const profileRest = classifyExercise({
  ...base,
  torsoFromVerticalDeg: 10,
  elbowAngle: 165,
  wristAboveShoulder: 0,
  elbowAboveShoulder: 0,
  shoulderSpan: 0.09,
  ankleSpan: 0.06,
  kneeAngle: 175,
});
assert(profileRest.id !== "pullup", `profile rest should not be pull-up, got ${profileRest.id}`);

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
