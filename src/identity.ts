import type { Landmark } from "./landmarks";

const STORAGE_KEY = "analyze-workout-identity-v1";

/** Compact face-region signature from pose nose + eyes + ears indices. */
const FACE_IDX = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export type IdentityProfile = {
  name: string;
  signature: number[];
};

export function buildSignature(landmarks: Landmark[]): number[] | null {
  const pts = FACE_IDX.map((i) => landmarks[i]).filter(Boolean);
  if (pts.length < 5) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.flatMap((p) => [p.x - cx, p.y - cy]);
}

export function signatureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / n);
}

export function loadIdentity(): IdentityProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IdentityProfile;
  } catch {
    return null;
  }
}

export function saveIdentity(profile: IdentityProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function pickPoseIndex(
  allLandmarks: Landmark[][],
  profile: IdentityProfile | null,
): number {
  if (allLandmarks.length <= 1) return 0;
  if (!profile) {
    return largestPoseIndex(allLandmarks);
  }
  let best = 0;
  let bestDist = Infinity;
  allLandmarks.forEach((lm, i) => {
    const sig = buildSignature(lm);
    if (!sig) return;
    const d = signatureDistance(sig, profile.signature);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function largestPoseIndex(allLandmarks: Landmark[][]): number {
  let best = 0;
  let bestArea = 0;
  allLandmarks.forEach((lm, i) => {
    const xs = lm.map((p) => p.x);
    const ys = lm.map((p) => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) {
      bestArea = area;
      best = i;
    }
  });
  return best;
}
