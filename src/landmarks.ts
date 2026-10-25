import { angleAtJoint, midpoint, type Point2 } from "./math";

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

export function extractPoseFeatures(landmarks: Landmark[]): PoseFeatures | null {
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

  const elbowAngles: number[] = [];
  if (ls && le && lw) {
    const a = angleAtJoint(ls, le, lw);
    if (Number.isFinite(a)) elbowAngles.push(a);
  }
  if (rs && re && rw) {
    const a = angleAtJoint(rs, re, rw);
    if (Number.isFinite(a)) elbowAngles.push(a);
  }
  if (elbowAngles.length === 0) return null;
  const elbowAngle = elbowAngles.reduce((s, v) => s + v, 0) / elbowAngles.length;

  const kneeAngles: number[] = [];
  if (lh && lk && la) {
    const a = angleAtJoint(lh, lk, la);
    if (Number.isFinite(a)) kneeAngles.push(a);
  }
  if (rh && rk && ra) {
    const a = angleAtJoint(rh, rk, ra);
    if (Number.isFinite(a)) kneeAngles.push(a);
  }
  const kneeAngle =
    kneeAngles.length > 0
      ? kneeAngles.reduce((s, v) => s + v, 0) / kneeAngles.length
      : NaN;

  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const torsoFromVerticalDeg =
    (Math.atan2(Math.abs(dx), Math.abs(dy) + 1e-6) * 180) / Math.PI;

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

  const visibilityOk = elbowAngles.length > 0 && (kneeAngles.length > 0 || torsoFromVerticalDeg > 25);

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
