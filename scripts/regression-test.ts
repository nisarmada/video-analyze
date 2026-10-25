import { nextDetectionTimestamp } from "../src/detectionClock";
import {
  IDENTITY_MATCH_THRESHOLD,
  PROFILE_VERSION,
  buildSignature,
  parseIdentity,
  pickPoseIndex,
  signatureDistance,
  type IdentityProfile,
} from "../src/identity";
import { extractPoseFeatures, Pose, type Landmark } from "../src/landmarks";
import { angleAtJoint, angleAtJoint3, torsoFromVertical3 } from "../src/math";
import { projectWorldPoint, layoutWorldPose } from "../src/pose3d";
import { RepCounterHub } from "../src/repCounter";
import { SetTracker } from "../src/setTracker";
import { mapLandmarkToCanvas, objectFitContainRect } from "../src/videoLayout";
import { formatWorkoutSummary, historyToCsv } from "../src/workoutSummary";
import type { WorkoutSession } from "../src/sessionManager";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const right = angleAtJoint({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 });
assert(Math.abs(right - 90) < 1e-6, `right angle ${right}`);
const straight = angleAtJoint({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
assert(Math.abs(straight - 180) < 1e-6, `straight angle ${straight}`);
assert(
  Number.isNaN(angleAtJoint({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })),
  "degenerate angle should be NaN",
);

const right3 = angleAtJoint3({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
assert(Math.abs(right3 - 90) < 1e-6, `3D right angle ${right3}`);
const depthOnly = angleAtJoint3(
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
);
assert(Math.abs(depthOnly - 90) < 1e-6, `depth-only bend ${depthOnly}`);
const flatOfDepth = angleAtJoint({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 });
assert(Number.isNaN(flatOfDepth), "the same bend is invisible on the image");
assert(
  Number.isNaN(angleAtJoint3({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })),
  "degenerate 3D angle should be NaN",
);
const upright = torsoFromVertical3({ x: 0, y: -0.5, z: 0.2 }, { x: 0, y: 0, z: 0 });
assert(upright < 25, `upright torso ${upright}`);
const plank = torsoFromVertical3({ x: 0.5, y: 0, z: 0.1 }, { x: 0, y: 0, z: 0 });
assert(plank > 70, `plank torso ${plank}`);

function blankPose(): Landmark[] {
  const pts: Landmark[] = [];
  const mark = (i: number, x: number, y: number) => {
    pts[i] = { x, y, visibility: 1 };
  };
  mark(Pose.L_SHOULDER, 0.15, 0.35);
  mark(Pose.R_SHOULDER, 0.25, 0.35);
  mark(Pose.L_ELBOW, 0.15, 0.5);
  mark(Pose.R_ELBOW, 0.25, 0.5);
  mark(Pose.L_WRIST, 0.3, 0.5);
  mark(Pose.R_WRIST, 0.4, 0.5);
  mark(Pose.L_HIP, 0.75, 0.35);
  mark(Pose.R_HIP, 0.85, 0.35);
  mark(Pose.L_KNEE, 0.75, 0.55);
  mark(Pose.R_KNEE, 0.85, 0.55);
  mark(Pose.L_ANKLE, 0.9, 0.55);
  mark(Pose.R_ANKLE, 1, 0.55);
  return pts;
}

const imageBent = extractPoseFeatures(blankPose());
assert(imageBent !== null && imageBent.elbowAngle < 120, `image elbow ${imageBent?.elbowAngle}`);
assert(imageBent !== null && imageBent.torsoFromVerticalDeg > 70, "image torso looks horizontal");

const world = blankPose().map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
const put = (i: number, x: number, y: number, z: number) => {
  world[i] = { x, y, z, visibility: 1 };
};
put(Pose.L_SHOULDER, -0.2, -0.5, 0);
put(Pose.R_SHOULDER, 0.2, -0.5, 0);
put(Pose.L_ELBOW, -0.2, -0.2, 0);
put(Pose.R_ELBOW, 0.2, -0.2, 0);
put(Pose.L_WRIST, -0.2, 0.1, 0);
put(Pose.R_WRIST, 0.2, 0.1, 0);
put(Pose.L_HIP, -0.15, 0, 0);
put(Pose.R_HIP, 0.15, 0, 0);
put(Pose.L_KNEE, -0.15, 0.4, 0);
put(Pose.R_KNEE, 0.15, 0.4, 0);
put(Pose.L_ANKLE, -0.15, 0.8, 0);
put(Pose.R_ANKLE, 0.15, 0.8, 0);
const metric = extractPoseFeatures(blankPose(), world);
assert(metric !== null && metric.elbowAngle > 170, `3D elbow should be straight, ${metric?.elbowAngle}`);
assert(metric !== null && metric.torsoFromVerticalDeg < 15, `3D torso should be upright, ${metric?.torsoFromVerticalDeg}`);
assert(metric !== null && Math.abs(metric.shoulderSpan - 0.1) < 1e-6, "view width stays on the image");

const sideImage = blankPose();
sideImage[Pose.L_SHOULDER].visibility = 0.95;
sideImage[Pose.L_ELBOW].visibility = 0.95;
sideImage[Pose.L_WRIST].visibility = 0.95;
sideImage[Pose.R_SHOULDER].visibility = 0.95;
sideImage[Pose.R_ELBOW].visibility = 0.4;
sideImage[Pose.R_WRIST].visibility = 0.4;
const sideWorld = world.map((p) => ({ ...p }));
sideWorld[Pose.L_WRIST] = { x: 0.1, y: -0.2, z: 0, visibility: 1 };
const side = extractPoseFeatures(sideImage, sideWorld);
assert(side !== null && side.elbowAngle < 110, `clearer arm should win, elbow ${side?.elbowAngle}`);

const evenImage = blankPose();
for (const index of [Pose.L_SHOULDER, Pose.L_ELBOW, Pose.L_WRIST, Pose.R_SHOULDER, Pose.R_ELBOW, Pose.R_WRIST]) {
  evenImage[index].visibility = 0.9;
}
const evenWorld = sideWorld.map((p) => ({ ...p }));
evenWorld[Pose.R_SHOULDER] = { x: 0.2, y: -0.5, z: 0, visibility: 1 };
evenWorld[Pose.R_ELBOW] = { x: 0.2, y: -0.2, z: 0, visibility: 1 };
evenWorld[Pose.R_WRIST] = { x: 0.2, y: 0.1, z: 0, visibility: 1 };
const even = extractPoseFeatures(evenImage, evenWorld);
assert(even !== null && even.elbowAngle < 110, `bent arm should win a disagreement, elbow ${even?.elbowAngle}`);

const laid = layoutWorldPose(
  [
    undefined,
    ...Array(10),
    { x: -0.8, y: 0, z: 0, visibility: 1 },
    { x: 0.8, y: 0, z: 0.4, visibility: 0.1 },
    undefined,
    undefined,
    { x: 0.8, y: -0.2, z: 0, visibility: 1 },
  ],
  200,
  120,
);
const leftJoint = laid[11];
const hidden = laid[12];
const rightJoint = laid[15];
assert(hidden === null, "a hidden joint is not drawn");
assert(leftJoint !== null && rightJoint !== null, "visible joints are placed");
if (leftJoint && rightJoint) {
  assert(rightJoint.x > leftJoint.x, "the body keeps its left-right order");
  assert(leftJoint.x > 8 && rightJoint.x < 192, "the pose is fitted inside the panel");
  assert(leftJoint.y > 8 && leftJoint.y < 112 && rightJoint.y > 8 && rightJoint.y < 112, "vertical fit");
}

const hip = projectWorldPoint({ x: 0, y: 0, z: 0 }, 200, 100);
assert(Math.abs(hip.x - 100) < 1e-6, `3D origin x ${hip.x}`);
const below = projectWorldPoint({ x: 0, y: 1, z: 0 }, 200, 100);
assert(below.y > hip.y, "downward world y draws lower on the panel");
const rightSide = projectWorldPoint({ x: 1, y: 0, z: 0 }, 200, 100);
const closer = projectWorldPoint({ x: 0, y: 0, z: 1 }, 200, 100);
assert(Math.abs(rightSide.x - closer.x) > 5, "depth and width land in different places");

const wideInTall = objectFitContainRect(300, 400, 1920, 1080);
assert(Math.abs(wideInTall.x) < 1e-6, `wide video x ${wideInTall.x}`);
assert(Math.abs(wideInTall.width - 300) < 1e-6, `wide video width ${wideInTall.width}`);
assert(wideInTall.y > 100, `wide video should be letterboxed, y=${wideInTall.y}`);
const origin = mapLandmarkToCanvas({ x: 0, y: 0 }, wideInTall);
assert(origin.y > 100, `landmark origin should sit below the top bar, y=${origin.y}`);
const center = mapLandmarkToCanvas({ x: 0.5, y: 0.5 }, wideInTall);
assert(Math.abs(center.x - 150) < 1e-6 && Math.abs(center.y - 200) < 1e-6, "center landmark");

const tallInWide = objectFitContainRect(400, 300, 1080, 1920);
const leftEdge = mapLandmarkToCanvas({ x: 0, y: 0 }, tallInWide);
assert(leftEdge.x > 100, `portrait video should be pillarboxed, x=${leftEdge.x}`);

const full = objectFitContainRect(640, 480, 640, 480);
assert(full.x === 0 && full.y === 0 && full.width === 640 && full.height === 480, "same aspect");
const fallback = objectFitContainRect(640, 480, 0, 0);
assert(fallback.width === 640 && fallback.height === 480, "missing video size uses the element");

assert(nextDetectionTimestamp(-1, { currentTimeSec: 1.5 }) === 1500, "first file timestamp");
assert(nextDetectionTimestamp(1500, { currentTimeSec: 1.5 }) === null, "duplicate file timestamp");
assert(nextDetectionTimestamp(1500, { currentTimeSec: 0.2 }) === null, "rewound file timestamp");
assert(nextDetectionTimestamp(1500, { currentTimeSec: 1.6 }) === 1600, "advancing file timestamp");
assert(nextDetectionTimestamp(100, { currentTimeSec: 0, liveMs: 100 }) === null, "duplicate live clock");
assert(nextDetectionTimestamp(100, { currentTimeSec: 0, liveMs: 140.8 }) === 140, "live clock");
assert(nextDetectionTimestamp(-1, { currentTimeSec: 9, liveMs: 50.9 }) === 50, "live clock wins");

const rest = new SetTracker(1);
rest.onExerciseChange("pushup");
rest.syncReps("pushup", 5, 0);
assert(rest.tick(999) === false, "rest should still be open");
assert(rest.getLog().length === 0, "no log before rest elapses");
assert(rest.tick(1000) === true, "rest should close the set");
assert(rest.getLog().length === 1 && rest.getLog()[0].reps === 5, "logged the closed set once");
assert(rest.snapshot().setNumber === 2, "next set number after rest");
assert(rest.snapshot().repsInSet === 0, "closed set clears the count");
assert(typeof rest.getLog()[0].endedAt === "string", "endedAt is stored as a string");
assert(rest.tick(5000) === false, "empty set should not close again");
assert(rest.getLog().length === 1, "rest should not duplicate a closed set");

const revived = JSON.parse(JSON.stringify(rest.getLog())) as typeof rest extends never
  ? never
  : { exercise: "pushup"; setNumber: number; reps: number; endedAt: string }[];
const revivedLine = rest.formatLogEntry(revived[0]);
assert(revivedLine.includes("Push-up set 1: 5 reps"), `revived log line: ${revivedLine}`);
const oneRep = new SetTracker(1);
oneRep.onExerciseChange("pushup");
oneRep.syncReps("pushup", 1, 0);
oneRep.tick(1000);
const oneLine = oneRep.formatLogEntry(oneRep.getLog()[0]);
assert(oneLine.includes("1 rep") && !oneLine.includes("1 reps"), oneLine);
const retarget = new SetTracker(1);
retarget.onExerciseChange("pushup");
retarget.retargetEmptySet("squat");
assert(retarget.snapshot().exercise === "squat" && retarget.snapshot().setNumber === 1, "empty retarget");
retarget.syncReps("squat", 1, 0);
assert(retarget.snapshot().setNumber === 1 && retarget.snapshot().repsInSet === 1, "retarget keeps set");
assert(!revivedLine.includes("Invalid Date"), "revived endedAt should format");

const manualClose = new SetTracker(45);
manualClose.onExerciseChange("squat");
manualClose.syncReps("squat", 3, 0);
manualClose.finishOpenSet();
assert(manualClose.getLog().length === 1, "finish keeps the open set");
assert(manualClose.snapshot().setNumber === 1, "finish does not start another set");
manualClose.newSet();
assert(manualClose.snapshot().setNumber === 2, "new set increments");

const hub = new RepCounterHub();
hub.setActive("pushup");
hub.current().reps = 8;
const linked = new SetTracker(1);
linked.setOnSetComplete(() => {
  hub.current().reset();
});
linked.onExerciseChange("pushup");
linked.syncReps("pushup", hub.current().reps, 0);
linked.tick(1000);
assert(hub.current().reps === 0, "closing a set resets the counter");
linked.syncReps("pushup", hub.current().reps, 2000);
assert(linked.snapshot().repsInSet === 0, "a reset counter must not restore the old set");
assert(linked.getLog().length === 1 && linked.getLog()[0].reps === 8, "the closed set keeps its reps");

const FACE: [number, number][] = [
  [0, -0.05],
  [-0.02, -0.03],
  [0.02, -0.03],
  [-0.03, -0.01],
  [0.03, -0.01],
  [-0.04, 0.02],
  [0.04, 0.02],
  [-0.015, 0.04],
  [0.015, 0.04],
];
const LINE: [number, number][] = [
  [-0.08, 0],
  [-0.06, 0],
  [-0.04, 0],
  [-0.02, 0],
  [0, 0],
  [0.02, 0],
  [0.04, 0],
  [0.06, 0],
  [0.08, 0],
];

function pose(offsets: [number, number][], originX: number, originY: number, scale: number): Landmark[] {
  const pts: Landmark[] = Array.from({ length: 33 }, () => ({
    x: originX,
    y: originY,
    visibility: 1,
  }));
  offsets.forEach(([x, y], i) => {
    pts[i] = { x: originX + x * scale, y: originY + y * scale, visibility: 1 };
  });
  return pts;
}

function withSpan(marks: Landmark[], span: number): Landmark[] {
  const pts = marks.map((p) => ({ ...p }));
  pts[11] = { x: 0.5 - span, y: 0.45, visibility: 1 };
  pts[12] = { x: 0.5 + span, y: 0.45, visibility: 1 };
  pts[23] = { x: 0.5 - span, y: 0.45 + span, visibility: 1 };
  pts[24] = { x: 0.5 + span, y: 0.45 + span, visibility: 1 };
  return pts;
}

const enrolledMarks = pose(FACE, 0.4, 0.3, 1);
const enrolled = buildSignature(enrolledMarks);
const scaled = buildSignature(pose(FACE, 0.7, 0.6, 2.4));
const moved = buildSignature(pose(FACE, 0.1, 0.8, 1));
const stranger = buildSignature(pose(LINE, 0.5, 0.5, 1));
assert(enrolled !== null && scaled !== null && moved !== null && stranger !== null, "signatures");
const sameDist = signatureDistance(enrolled!, scaled!);
const movedDist = signatureDistance(enrolled!, moved!);
const strangerDist = signatureDistance(enrolled!, stranger!);
assert(sameDist < 1e-6, `scale should not change the outline, dist=${sameDist}`);
assert(movedDist < 1e-6, `position should not change the outline, dist=${movedDist}`);
assert(
  strangerDist > IDENTITY_MATCH_THRESHOLD,
  `different outline dist=${strangerDist} threshold=${IDENTITY_MATCH_THRESHOLD}`,
);

const profile: IdentityProfile = {
  name: "Me",
  signature: enrolled!,
  version: PROFILE_VERSION,
};
const matched = pickPoseIndex(
  [withSpan(pose(LINE, 0.2, 0.2, 1), 0.35), withSpan(pose(FACE, 0.8, 0.3, 1.8), 0.05)],
  profile,
);
assert(matched === 1, `should follow the selected outline, got ${matched}`);
const unmatched = pickPoseIndex(
  [withSpan(pose(LINE, 0.2, 0.2, 1), 0.05), withSpan(pose(LINE, 0.8, 0.2, 1.2), 0.35)],
  profile,
);
assert(unmatched === 1, `no outline match should follow the largest person, got ${unmatched}`);
assert(pickPoseIndex([pose(LINE, 0.2, 0.2, 1)], profile) === 0, "one person stays selected");

assert(parseIdentity(null) === null, "empty identity");
assert(parseIdentity('{"name":"Me","signature":[1,2]}') === null, "old profile is ignored");
const parsed = parseIdentity(
  JSON.stringify({ name: "Me", signature: [0.1, -0.2], version: PROFILE_VERSION }),
);
assert(parsed?.name === "Me" && parsed.version === PROFILE_VERSION, "versioned profile");

const session: WorkoutSession = {
  id: 'id,"quoted"',
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:03:00.000Z",
  sets: [
    { exercise: "pushup", setNumber: 1, reps: 10, endedAt: "2026-01-01T00:01:00.000Z" },
    { exercise: "squat", setNumber: 2, reps: 8, endedAt: "2026-01-01T00:03:00.000Z" },
  ],
};
const summary = formatWorkoutSummary(session);
assert(summary.includes("Duration 3 min 0 sec"), summary);
assert(summary.includes("Push-up set 1: 10 reps"), summary);
assert(summary.includes("Squat set 2: 8 reps"), summary);
assert(summary.includes("2 sets, 18 reps"), summary);
const one = formatWorkoutSummary({
  ...session,
  sets: [session.sets[0]],
});
assert(one.includes("1 set, 10 reps"), one);
assert(formatWorkoutSummary({ ...session, sets: [] }).includes("No sets recorded."), "empty summary");

const csv = historyToCsv([session]);
assert(csv.startsWith("workoutId,startedAt,endedAt,exercise,setNumber,reps,setEndedAt\n"), csv);
assert(csv.includes('"id,""quoted"""'), `csv should escape commas and quotes: ${csv}`);
assert(csv.includes("pushup,1,10"), csv);
assert(historyToCsv([]).trim() === "workoutId,startedAt,endedAt,exercise,setNumber,reps,setEndedAt", "header only");

console.log("regression tests passed");
