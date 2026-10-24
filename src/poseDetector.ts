import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

let landmarker: PoseLandmarker | null = null;

export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm",
  );

  const baseOptions = {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  };

  try {
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  return landmarker;
}

export function detectForVideo(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): PoseLandmarkerResult | null {
  if (video.readyState < 2) return null;
  return detector.detectForVideo(video, timestampMs);
}

/** Draw pose connections (subset) for feedback. */
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

export function drawPose(
  ctx: CanvasRenderingContext2D,
  result: PoseLandmarkerResult,
  width: number,
  height: number,
): void {
  const poses = result.landmarks;
  if (!poses?.length) return;
  const lm = poses[0];

  ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
  ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(244, 63, 94, 0.95)";

  for (const [a, b] of EDGES) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
