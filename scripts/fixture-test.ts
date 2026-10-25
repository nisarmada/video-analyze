import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PushUpCounter } from "../src/repCounter";
import type { PoseFeatures } from "../src/landmarks";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Fixture = {
  exercise: string;
  angles: number[];
  key: "elbowAngle" | "kneeAngle";
  expectedReps: number;
};

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

const raw = readFileSync(join(root, "test/fixtures/pushup-rep-angles.json"), "utf8");
const fixture = JSON.parse(raw) as Fixture;

const counter = new PushUpCounter();
let t = 0;
for (const a of fixture.angles) {
  for (let i = 0; i < 6; i++) {
    counter.update({ ...base, [fixture.key]: a }, t);
    t += 80;
  }
}

if (counter.reps !== fixture.expectedReps) {
  throw new Error(`fixture expected ${fixture.expectedReps} reps, got ${counter.reps}`);
}

console.log("fixture tests passed");
