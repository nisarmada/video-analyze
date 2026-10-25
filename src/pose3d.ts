import type { Point3 } from "./math";

/** Same body connections as the image overlay. */
const EDGES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

const YAW = 0.6;
const CAMERA_Z = 2.4;

function viewPoint(p: Point3): { x: number; y: number } {
  const cos = Math.cos(YAW);
  const sin = Math.sin(YAW);
  const x = p.x * cos + p.z * sin;
  const z = -p.x * sin + p.z * cos;
  const depth = Math.max(0.35, CAMERA_Z + z);
  return { x: x / depth, y: p.y / depth };
}

/** Fit the posed body to the panel. Depth still shifts a joint sideways. */
export function layoutWorldPose(
  landmarks: (Point3 | null | undefined)[],
  width: number,
  height: number,
): ({ x: number; y: number } | null)[] {
  const viewed = landmarks.map((p) => (visible(p) ? viewPoint(p) : null));
  const finite = viewed.filter((p): p is { x: number; y: number } => p !== null);
  if (finite.length === 0) return viewed.map(() => null);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of finite) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = Math.max(0.04, maxX - minX);
  const spanY = Math.max(0.04, maxY - minY);
  const pad = 0.16;
  const scale = Math.min((width * (1 - pad * 2)) / spanX, (height * (1 - pad * 2)) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return viewed.map((p) =>
    p
      ? { x: width / 2 + (p.x - cx) * scale, y: height / 2 + (p.y - cy) * scale }
      : null,
  );
}

export function projectWorldPoint(
  p: Point3,
  width: number,
  height: number,
): { x: number; y: number } {
  const viewed = viewPoint(p);
  const scale = Math.min(width, height) * 0.72;
  return {
    x: width / 2 + viewed.x * scale,
    y: height * 0.48 + viewed.y * scale,
  };
}

function visible(p: Point3 | null | undefined): p is Point3 {
  if (!p) return false;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
  return (p.visibility ?? 1) >= 0.35;
}

export function drawWorldPose(
  ctx: CanvasRenderingContext2D,
  landmarks: Point3[] | undefined,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks?.length || width < 2 || height < 2) return;

  const laid = layoutWorldPose(landmarks, width, height);
  const dots = laid.filter((p): p is { x: number; y: number } => p !== null);
  if (dots.length === 0) return;

  let low = dots[0];
  for (const p of dots) if (p.y > low.y) low = p;
  ctx.beginPath();
  ctx.ellipse(low.x, Math.min(height - 8, low.y + 16), width * 0.18, height * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
  for (const [a, b] of EDGES) {
    const start = laid[a];
    const end = laid[b];
    if (!start || !end) continue;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(244, 63, 94, 0.95)";
  for (const dot of dots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
