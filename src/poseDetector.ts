import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { mapLandmarkToCanvas, type ContentRect } from "./videoLayout";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_URL = "/models/pose_landmarker_lite.task";

let landmarker: PoseLandmarker | null = null;

export type PoseLoadProgress = (message: string) => void;

export async function initPoseLandmarker(
  onProgress?: PoseLoadProgress,
  maxAttempts = 3,
): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      onProgress?.(`Loading pose model (attempt ${attempt}/${maxAttempts})…`);
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const baseOptions = { modelAssetPath: MODEL_URL };
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { ...baseOptions, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 3,
        });
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { ...baseOptions, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 3,
        });
      }
      onProgress?.("Pose model ready");
      return landmarker;
    } catch (e) {
      lastError = e;
      landmarker = null;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastError;
}

export function detectForVideo(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): PoseLandmarkerResult | null {
  if (video.readyState < 2) return null;
  return detector.detectForVideo(sourceForDetection(video), timestampMs);
}

const MAX_DETECT_WIDTH = 640;
let detectCanvas: HTMLCanvasElement | null = null;
let detectCtx: CanvasRenderingContext2D | null = null;

/** The model does not need a 4K frame. Normalized and world landmarks stay metric. */
function sourceForDetection(video: HTMLVideoElement): HTMLVideoElement | HTMLCanvasElement {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH || srcW <= MAX_DETECT_WIDTH) return video;
  if (!detectCanvas) {
    detectCanvas = document.createElement("canvas");
    detectCtx = detectCanvas.getContext("2d", { alpha: false });
  }
  const width = MAX_DETECT_WIDTH;
  const height = Math.max(1, Math.round((srcH * width) / srcW));
  if (detectCanvas.width !== width || detectCanvas.height !== height) {
    detectCanvas.width = width;
    detectCanvas.height = height;
  }
  detectCtx?.drawImage(video, 0, 0, width, height);
  return detectCanvas;
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
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  content?: ContentRect,
): void {
  const rect = content ?? { x: 0, y: 0, width, height };
  ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
  ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(244, 63, 94, 0.95)";

  for (const [a, b] of EDGES) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    const start = mapLandmarkToCanvas(pa, rect);
    const end = mapLandmarkToCanvas(pb, rect);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  for (const p of landmarks) {
    const dot = mapLandmarkToCanvas(p, rect);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
