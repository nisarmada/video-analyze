export type Point2 = { x: number; y: number; visibility?: number };

export type Point3 = { x: number; y: number; z: number; visibility?: number };

export function angleAtJoint(a: Point2, b: Point2, c: Point2): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBa = Math.hypot(ba.x, ba.y);
  const magBc = Math.hypot(bc.x, bc.y);
  if (magBa < 1e-6 || magBc < 1e-6) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / (magBa * magBc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Interior angle at b, in degrees, using metric x/y/z. */
export function angleAtJoint3(a: Point3, b: Point3, c: Point3): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBa = Math.hypot(ba.x, ba.y, ba.z);
  const magBc = Math.hypot(bc.x, bc.y, bc.z);
  if (magBa < 1e-6 || magBc < 1e-6) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / (magBa * magBc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle between the shoulder–hip line and the vertical axis, 0 upright and 90 horizontal.
 * Uses |y| so it does not depend on whether the pose axis points up or down.
 */
export function torsoFromVertical3(shoulder: Point3, hip: Point3): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const dz = shoulder.z - hip.z;
  const horizontal = Math.hypot(dx, dz);
  const vertical = Math.abs(dy);
  if (horizontal < 1e-6 && vertical < 1e-6) return NaN;
  return (Math.atan2(horizontal, vertical) * 180) / Math.PI;
}

export function midpoint3(a: Point3, b: Point3): Point3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

export function midpoint(a: Point2, b: Point2): Point2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Exponential moving average smoother for scalar signals. */
export class EmaSmoother {
  private value: number | null = null;

  constructor(private alpha: number) {}

  reset(): void {
    this.value = null;
  }

  push(raw: number): number {
    if (!Number.isFinite(raw)) return this.value ?? raw;
    if (this.value === null) {
      this.value = raw;
      return raw;
    }
    this.value = this.alpha * raw + (1 - this.alpha) * this.value;
    return this.value;
  }
}
