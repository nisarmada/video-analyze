import {
  angleAtJoint,
  angleAtJoint3,
  midpoint,
  midpoint3,
  torsoFromVertical3,
  type Point2,
  type Point3,
} from "./math";

/** MediaPipe Pose landmark indices (33). */
export const Pose = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

export type Landmark = Point2;

/** MediaPipe world landmark: meters, origin at the hip center. */
export type WorldLandmark = Point3;

export function lm(landmarks: Landmark[], i: number, minVis = 0.35): Point2 | null {
  const p = landmarks[i];
  if (!p) return null;
  const v = p.visibility ?? 1;
  if (v < minVis) return null;
  return p;
}

export type PoseFeatures = {
  elbowAngle: number;
  kneeAngle: number;
  torsoFromVerticalDeg: number;
  /** Max of left/right wrist elevation above shoulder line (y-down coords). */
  wristAboveShoulder: number;
  /** Normalized horizontal distance between shoulders; small in side/profile view. */
  shoulderSpan: number;
  /** Distance between ankles when both visible; wide during standing squats. */
  ankleSpan: number;
  /** Max elbow elevation relative to shoulder line (profile hang). */
  elbowAboveShoulder: number;
  visibilityOk: boolean;
};

function worldAt(world: WorldLandmark[] | undefined, index: number): Point3 | null {
  const p = world?.[index];
  if (!p) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
  return p;
}

function meanVisibility(landmarks: Landmark[], indices: number[]): number {
  let sum = 0;
  let n = 0;
  for (const index of indices) {
    const v = landmarks[index]?.visibility;
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : 1;
}

/**
 * Prefer the clearer limb. When both sides look equally visible but disagree,
 * follow the more bent joint. A side view often marks the hidden arm as
 * visible while leaving it straight.
 */
function chooseAngle(candidates: { angle: number | null; weight: number }[]): number | null {
  const usable = candidates.filter(
    (c): c is { angle: number; weight: number } => c.angle !== null && Number.isFinite(c.angle),
  );
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0].angle;
  usable.sort((a, b) => b.weight - a.weight);
  if (usable[0].weight - usable[1].weight >= 0.12) return usable[0].angle;
  if (Math.abs(usable[0].angle - usable[1].angle) >= 25) {
    return Math.min(usable[0].angle, usable[1].angle);
  }
  return (usable[0].angle + usable[1].angle) / 2;
}

/** Prefer the metric 3D angle. Fall back to the image angle when depth is missing. */
function jointAngle(
  image: [Point2 | null, Point2 | null, Point2 | null],
  world: WorldLandmark[] | undefined,
  indices: [number, number, number],
): number | null {
  const [ia, ib, ic] = indices;
  if (image[0] && image[1] && image[2]) {
    const a = worldAt(world, ia);
    const b = worldAt(world, ib);
    const c = worldAt(world, ic);
    if (a && b && c) {
      const angle = angleAtJoint3(a, b, c);
      if (Number.isFinite(angle)) return angle;
    }
    const flat = angleAtJoint(image[0], image[1], image[2]);
    return Number.isFinite(flat) ? flat : null;
  }
  return null;
}

export function extractPoseFeatures(
  landmarks: Landmark[],
  world?: WorldLandmark[],
): PoseFeatures | null {
  const ls = lm(landmarks, Pose.L_SHOULDER);
  const rs = lm(landmarks, Pose.R_SHOULDER);
  const le = lm(landmarks, Pose.L_ELBOW);
  const re = lm(landmarks, Pose.R_ELBOW);
  const lw = lm(landmarks, Pose.L_WRIST);
  const rw = lm(landmarks, Pose.R_WRIST);
  const lh = lm(landmarks, Pose.L_HIP);
  const rh = lm(landmarks, Pose.R_HIP);
  const lk = lm(landmarks, Pose.L_KNEE);
  const rk = lm(landmarks, Pose.R_KNEE);
  const la = lm(landmarks, Pose.L_ANKLE);
  const ra = lm(landmarks, Pose.R_ANKLE);

  if (!ls || !rs || !lh || !rh) return null;

  const shoulder = midpoint(ls, rs);
  const hip = midpoint(lh, rh);

  const elbowAngles = chooseAngle([
    {
      angle: jointAngle([ls, le, lw], world, [Pose.L_SHOULDER, Pose.L_ELBOW, Pose.L_WRIST]),
      weight: meanVisibility(landmarks, [Pose.L_SHOULDER, Pose.L_ELBOW, Pose.L_WRIST]),
    },
    {
      angle: jointAngle([rs, re, rw], world, [Pose.R_SHOULDER, Pose.R_ELBOW, Pose.R_WRIST]),
      weight: meanVisibility(landmarks, [Pose.R_SHOULDER, Pose.R_ELBOW, Pose.R_WRIST]),
    },
  ]);
  if (elbowAngles === null) return null;
  const elbowAngle = elbowAngles;

  const kneeAngles = chooseAngle([
    {
      angle: jointAngle([lh, lk, la], world, [Pose.L_HIP, Pose.L_KNEE, Pose.L_ANKLE]),
      weight: meanVisibility(landmarks, [Pose.L_HIP, Pose.L_KNEE, Pose.L_ANKLE]),
    },
    {
      angle: jointAngle([rh, rk, ra], world, [Pose.R_HIP, Pose.R_KNEE, Pose.R_ANKLE]),
      weight: meanVisibility(landmarks, [Pose.R_HIP, Pose.R_KNEE, Pose.R_ANKLE]),
    },
  ]);
  const kneeAngle = kneeAngles ?? NaN;

  const worldShoulderL = worldAt(world, Pose.L_SHOULDER);
  const worldShoulderR = worldAt(world, Pose.R_SHOULDER);
  const worldHipL = worldAt(world, Pose.L_HIP);
  const worldHipR = worldAt(world, Pose.R_HIP);
  let torsoFromVerticalDeg: number;
  if (worldShoulderL && worldShoulderR && worldHipL && worldHipR) {
    torsoFromVerticalDeg = torsoFromVertical3(
      midpoint3(worldShoulderL, worldShoulderR),
      midpoint3(worldHipL, worldHipR),
    );
  } else {
    const dx = shoulder.x - hip.x;
    const dy = shoulder.y - hip.y;
    torsoFromVerticalDeg = (Math.atan2(Math.abs(dx), Math.abs(dy) + 1e-6) * 180) / Math.PI;
  }
  if (!Number.isFinite(torsoFromVerticalDeg)) return null;

  const wristElevations: number[] = [];
  if (lw) wristElevations.push(shoulder.y - lw.y);
  if (rw) wristElevations.push(shoulder.y - rw.y);
  const wristAboveShoulder =
    wristElevations.length > 0 ? Math.max(...wristElevations) : 0;

  const shoulderSpan = Math.abs(ls.x - rs.x);
  const ankleSpan = la && ra ? Math.abs(la.x - ra.x) : NaN;

  const elbowElevations: number[] = [];
  if (le) elbowElevations.push(shoulder.y - le.y);
  if (re) elbowElevations.push(shoulder.y - re.y);
  const elbowAboveShoulder =
    elbowElevations.length > 0 ? Math.max(...elbowElevations) : 0;

  const visibilityOk = Number.isFinite(elbowAngle) && (Number.isFinite(kneeAngle) || torsoFromVerticalDeg > 25);

  return {
    elbowAngle,
    kneeAngle,
    torsoFromVerticalDeg,
    wristAboveShoulder,
    shoulderSpan,
    ankleSpan,
    elbowAboveShoulder,
    visibilityOk,
  };
}
