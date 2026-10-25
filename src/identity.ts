import { Pose, type Landmark } from "./landmarks";

const STORAGE_KEY = "analyze-workout-identity-v1";

/** Pose face indices. This is a body-outline match, not face recognition. */
const FACE_IDX = [Pose.NOSE, 1, 2, 3, 4, 5, 6, 7, 8];

export const PROFILE_VERSION = 2 as const;

/** RMS distance above which another person is treated as a different outline. */
export const IDENTITY_MATCH_THRESHOLD = 0.25;

export type IdentityProfile = {
  name: string;
  signature: number[];
  version: typeof PROFILE_VERSION;
};

let cached: IdentityProfile | null | undefined;

export function buildSignature(landmarks: Landmark[]): number[] | null {
  const pts = FACE_IDX.map((i) => landmarks[i]).filter((p): p is Landmark => Boolean(p));
  if (pts.length < 5) return null;
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  let energy = 0;
  const offsets = pts.map((p) => {
    const x = p.x - cx;
    const y = p.y - cy;
    energy += x * x + y * y;
    return { x, y };
  });
  const scale = Math.sqrt(energy / pts.length);
  if (scale < 1e-6) return null;
  return offsets.flatMap((p) => [p.x / scale, p.y / scale]);
}

export function signatureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / n);
}

export function parseIdentity(raw: string | null): IdentityProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<IdentityProfile>;
    if (parsed.version !== PROFILE_VERSION) return null;
    if (typeof parsed.name !== "string" || parsed.name.length === 0) return null;
    if (!Array.isArray(parsed.signature) || parsed.signature.length === 0) return null;
    if (parsed.signature.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
    return {
      name: parsed.name,
      signature: parsed.signature,
      version: PROFILE_VERSION,
    };
  } catch {
    return null;
  }
}

export function loadIdentity(): IdentityProfile | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseIdentity(raw);
    if (raw && !parsed) localStorage.removeItem(STORAGE_KEY);
    cached = parsed;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveIdentity(profile: { name: string; signature: number[] }): void {
  const stored: IdentityProfile = {
    name: profile.name,
    signature: profile.signature,
    version: PROFILE_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  cached = stored;
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  cached = null;
}

export function pickPoseIndex(
  allLandmarks: Landmark[][],
  profile: IdentityProfile | null,
): number {
  if (allLandmarks.length <= 1) return 0;
  if (!profile) return largestPoseIndex(allLandmarks);

  let best = -1;
  let bestDist = Infinity;
  allLandmarks.forEach((marks, i) => {
    const sig = buildSignature(marks);
    if (!sig) return;
    const dist = signatureDistance(sig, profile.signature);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  if (best >= 0 && bestDist <= IDENTITY_MATCH_THRESHOLD) return best;
  return largestPoseIndex(allLandmarks);
}

function largestPoseIndex(allLandmarks: Landmark[][]): number {
  let best = 0;
  let bestArea = 0;
  allLandmarks.forEach((marks, i) => {
    const xs = marks.map((p) => p.x);
    const ys = marks.map((p) => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) {
      bestArea = area;
      best = i;
    }
  });
  return best;
}
