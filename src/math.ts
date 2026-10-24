export type Point2 = { x: number; y: number; visibility?: number };

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
