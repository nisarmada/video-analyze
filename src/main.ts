import { cameraGuidance } from "./cameraGuidance";
import {
  type ExerciseMode,
  resolveActiveExercise,
} from "./exerciseSelection";
import { classifyExercise, ExerciseStabilizer, exerciseLabel } from "./exercises";
import {
  buildSignature,
  clearIdentity,
  loadIdentity,
  pickPoseIndex,
  saveIdentity,
} from "./identity";
import { extractPoseFeatures, type Landmark } from "./landmarks";
import {
  detectForVideo,
  drawPose,
  initPoseLandmarker,
} from "./poseDetector";
import { onRepRegistered } from "./repFeedback";
import { RepCounterHub } from "./repCounter";
import {
  DEFAULT_ROM,
  loadRomSettings,
  normalizeRomSettings,
  saveRomSettings,
} from "./romSettings";
import { SessionManager } from "./sessionManager";
import { SetTracker } from "./setTracker";
import {
  clearWorkoutHistory,
  exportHistoryJson,
  loadWorkoutHistory,
  saveWorkoutToHistory,
} from "./workoutStorage";

const video = document.getElementById("video") as HTMLVideoElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const videoWrap = document.getElementById("video-wrap") as HTMLElement;
const ctx = overlay.getContext("2d")!;

const elExercise = document.getElementById("stat-exercise")!;
const elConfidence = document.getElementById("stat-confidence")!;
const elReps = document.getElementById("stat-reps")!;
const elSet = document.getElementById("stat-set")!;
const elPhase = document.getElementById("stat-phase")!;
const elLog = document.getElementById("workout-log")!;
const elHistory = document.getElementById("history-log")!;
const elCameraHint = document.getElementById("camera-hint")!;
const elIdentity = document.getElementById("identity-label")!;

const btnWebcam = document.getElementById("btn-webcam") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnStartWorkout = document.getElementById("btn-start-workout") as HTMLButtonElement;
const btnEndWorkout = document.getElementById("btn-end-workout") as HTMLButtonElement;
const inputFile = document.getElementById("video-file") as HTMLInputElement;
const inputRest = document.getElementById("rest-seconds") as HTMLInputElement;
const btnRepPlus = document.getElementById("btn-rep-plus") as HTMLButtonElement;
const btnRepMinus = document.getElementById("btn-rep-minus") as HTMLButtonElement;
const btnNewSet = document.getElementById("btn-new-set") as HTMLButtonElement;
const elModelStatus = document.getElementById("model-status")!;
const selectExerciseMode = document.getElementById("exercise-mode") as HTMLSelectElement;
const elStatus = document.getElementById("stat-status")!;
const btnEnroll = document.getElementById("btn-enroll") as HTMLButtonElement;
const btnClearIdentity = document.getElementById("btn-clear-identity") as HTMLButtonElement;
const btnExport = document.getElementById("btn-export") as HTMLButtonElement;
const btnClearHistory = document.getElementById("btn-clear-history") as HTMLButtonElement;
const summarySection = document.getElementById("workout-summary")!;
const summaryBody = document.getElementById("summary-body")!;
const btnDismissSummary = document.getElementById("btn-dismiss-summary") as HTMLButtonElement;

const romPushTop = document.getElementById("rom-push-top") as HTMLInputElement;
const romPushBottom = document.getElementById("rom-push-bottom") as HTMLInputElement;
const romSquatTop = document.getElementById("rom-squat-top") as HTMLInputElement;
const romSquatBottom = document.getElementById("rom-squat-bottom") as HTMLInputElement;
const btnSaveRom = document.getElementById("btn-save-rom") as HTMLButtonElement;

const stabilizer = new ExerciseStabilizer();
const repHub = new RepCounterHub();
const setTracker = new SetTracker(Number(inputRest.value) || 45);
const sessionManager = new SessionManager();

let detector: Awaited<ReturnType<typeof initPoseLandmarker>> | null = null;
let raf = 0;
let stream: MediaStream | null = null;
let fileUrl: string | null = null;
let lastTimestamp = -1;
let workExercise: ReturnType<ExerciseStabilizer["getActive"]> = "other";
let lastRepInSet = 0;
let latestLandmarks: Landmark[] | null = null;

function applyRomFromInputs(): void {
  const settings = {
    pushup: {
      topMin: Number(romPushTop.value) || DEFAULT_ROM.pushup.topMin,
      bottomMax: Number(romPushBottom.value) || DEFAULT_ROM.pushup.bottomMax,
    },
    pullup: {
      topMin: Number(romPushTop.value) || DEFAULT_ROM.pullup.topMin,
      bottomMax: Number(romPushBottom.value) || DEFAULT_ROM.pullup.bottomMax,
    },
    squat: {
      topMin: Number(romSquatTop.value) || DEFAULT_ROM.squat.topMin,
      bottomMax: Number(romSquatBottom.value) || DEFAULT_ROM.squat.bottomMax,
    },
    other: DEFAULT_ROM.other,
  };
  const normalized = normalizeRomSettings(settings);
  repHub.applyRomSettings(normalized);
  saveRomSettings(normalized);
  loadRomIntoUi();
}

function loadRomIntoUi(): void {
  const s = loadRomSettings();
  romPushTop.value = String(s.pushup.topMin);
  romPushBottom.value = String(s.pushup.bottomMax);
  romSquatTop.value = String(s.squat.topMin);
  romSquatBottom.value = String(s.squat.bottomMax);
  repHub.applyRomSettings(s);
}

loadRomIntoUi();
btnSaveRom.addEventListener("click", applyRomFromInputs);

setTracker.setOnSetComplete((record) => {
  sessionManager.ingestSet(record);
});

function renderIdentityLabel(): void {
  const profile = loadIdentity();
  elIdentity.textContent = profile
    ? `Enrolled: ${profile.name}`
    : "No profile enrolled (tracks largest person)";
}

function renderHistory(): void {
  elHistory.replaceChildren(
    ...loadWorkoutHistory().slice(0, 10).map((s) => {
      const li = document.createElement("li");
      const date = new Date(s.startedAt).toLocaleString();
      const sets = s.sets.length;
      const reps = s.sets.reduce((n, set) => n + set.reps, 0);
      li.textContent = `${date} — ${sets} sets, ${reps} reps`;
      return li;
    }),
  );
}

renderIdentityLabel();
renderHistory();

function resizeCanvas(): void {
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
}

function renderLog(): void {
  elLog.replaceChildren(
    ...setTracker.getLog().map((r) => {
      const li = document.createElement("li");
      li.textContent = setTracker.formatLogEntry(r);
      return li;
    }),
  );
}

function getExerciseMode(): ExerciseMode {
  const v = selectExerciseMode.value;
  if (v === "pushup" || v === "squat" || v === "pullup") return v;
  return "auto";
}

function activeExerciseForManual(): ReturnType<ExerciseStabilizer["getActive"]> {
  const mode = getExerciseMode();
  if (mode !== "auto") return mode;
  return stabilizer.getActive();
}

function updateUi(
  exercise: ReturnType<ExerciseStabilizer["update"]>,
  confidence: number,
  reps: number,
  phase: string,
  statusText: string,
): void {
  elExercise.textContent =
    exercise === "other" ? "—" : exerciseLabel(exercise);
  elConfidence.textContent =
    exercise === "other" ? "—" : `${Math.round(confidence * 100)}%`;
  elStatus.textContent = statusText;
  elReps.textContent = String(reps);
  const snap = setTracker.snapshot();
  elSet.textContent = snap.setNumber > 0 ? String(snap.setNumber) : "0";
  elPhase.textContent = phase;
}

async function ensureDetector(): Promise<void> {
  if (!detector) {
    detector = await initPoseLandmarker((msg) => {
      elModelStatus.textContent = msg;
    });
    elModelStatus.textContent = "Pose model ready";
    elModelStatus.classList.add("ready");
    btnWebcam.disabled = false;
  }
}

function resetRepPipeline(): void {
  const snap = setTracker.snapshot();
  stabilizer.reset();
  repHub.resetAll();
  workExercise = "other";
  lastRepInSet = snap.repsInSet;
  lastTimestamp = -1;
  if (snap.exercise !== "other") {
    workExercise = snap.exercise;
    stabilizer.force(snap.exercise);
    repHub.setActive(snap.exercise);
    repHub.current().reps = snap.repsInSet;
  }
}

function resetFullSession(): void {
  resetRepPipeline();
  setTracker.resetSession();
  renderLog();
}

function stopPlayback(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  video.pause();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (fileUrl) {
    URL.revokeObjectURL(fileUrl);
    fileUrl = null;
  }
  video.srcObject = null;
  btnStop.disabled = true;
  if (detector) btnWebcam.disabled = false;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  elCameraHint.textContent = "Camera guidance will appear here";
}

async function loop(): Promise<void> {
  if (!detector) return;

  const nowMs = performance.now();
  if (video.paused || video.ended) {
    if (video.ended && !stream) {
      stopPlayback();
      return;
    }
  }

  resizeCanvas();

  let timestampMs = Math.floor(video.currentTime * 1000);
  if (stream) timestampMs = Math.floor(nowMs);
  if (timestampMs === lastTimestamp) {
    raf = requestAnimationFrame(loop);
    return;
  }
  lastTimestamp = timestampMs;

  const result = detectForVideo(detector, video, timestampMs);
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (!result?.landmarks?.length) {
    elCameraHint.textContent = cameraGuidance(undefined);
    raf = requestAnimationFrame(loop);
    return;
  }

  const poseIndex = pickPoseIndex(result.landmarks, loadIdentity());
  const landmarks = result.landmarks[poseIndex];
  latestLandmarks = landmarks;
  elCameraHint.textContent = cameraGuidance(landmarks);
  drawPose(ctx, landmarks, overlay.width, overlay.height);

  const features = extractPoseFeatures(landmarks);
  if (features) {
    const guess = classifyExercise(features);
    const mode = getExerciseMode();
    let canCount = sessionManager.isActive();
    let statusText = sessionManager.isActive() ? "Counting" : "Start workout to count";
    if (mode !== "auto") {
      workExercise = mode;
      stabilizer.force(mode);
      statusText = sessionManager.isActive() ? "Manual lock" : statusText;
    } else if (sessionManager.isActive()) {
      const stabilized = stabilizer.update(guess);
      const resolved = resolveActiveExercise("auto", {
        ...guess,
        id: stabilized,
      });
      if (resolved.counting && resolved.exercise !== "other") {
        workExercise = resolved.exercise;
        statusText = "Auto detect";
      } else {
        canCount = false;
        statusText = "Unsure — lock exercise or improve view";
      }
    }

    let repState = repHub.snapshot();
    if (canCount && workExercise !== "other") {
      setTracker.onExerciseChange(workExercise);
      repState = repHub.update(workExercise, features, Date.now());
      setTracker.syncReps(workExercise, repState.reps, Date.now());
    }
    if (workExercise !== "other") {
      setTracker.tick(Date.now());
    }

    const repsInSet = setTracker.snapshot().repsInSet;
    if (repsInSet > lastRepInSet) {
      onRepRegistered(videoWrap);
      lastRepInSet = repsInSet;
    }

    updateUi(
      workExercise,
      guess.confidence,
      repsInSet,
      repState.phase,
      statusText,
    );
    renderLog();
  }

  raf = requestAnimationFrame(loop);
}

async function startWebcam(): Promise<void> {
  stopPlayback();
  resetRepPipeline();
  await ensureDetector();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  btnStop.disabled = false;
  btnWebcam.disabled = true;
  raf = requestAnimationFrame(loop);
}

async function startFile(file: File): Promise<void> {
  stopPlayback();
  resetRepPipeline();
  await ensureDetector();
  fileUrl = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = fileUrl;
  video.loop = true;
  video.muted = true;
  await video.play();
  btnStop.disabled = false;
  raf = requestAnimationFrame(loop);
}

btnWebcam.addEventListener("click", () => {
  startWebcam().catch((e) => {
    console.error(e);
    alert("Could not open webcam. Check permissions and use HTTPS or localhost.");
  });
});

btnStop.addEventListener("click", stopPlayback);

inputFile.addEventListener("change", () => {
  const file = inputFile.files?.[0];
  if (file) startFile(file).catch(console.error);
  inputFile.value = "";
});

inputRest.addEventListener("change", () => {
  setTracker.setRestSeconds(Number(inputRest.value) || 45);
});

selectExerciseMode.addEventListener("change", () => {
  const mode = getExerciseMode();
  if (mode !== "auto") stabilizer.force(mode);
});

btnStartWorkout.addEventListener("click", () => {
  if (sessionManager.isActive()) return;
  resetFullSession();
  sessionManager.start();
  btnEndWorkout.disabled = false;
  btnStartWorkout.disabled = true;
  elStatus.textContent = "Workout started";
});

btnEndWorkout.addEventListener("click", () => {
  if (!sessionManager.isActive()) return;
  setTracker.finishOpenSet();
  const finished = sessionManager.end();
  btnEndWorkout.disabled = true;
  btnStartWorkout.disabled = false;
  if (finished) {
    saveWorkoutToHistory(finished);
    renderHistory();
    summaryBody.textContent = JSON.stringify(finished, null, 2);
    summarySection.classList.remove("hidden");
  }
});

btnDismissSummary.addEventListener("click", () => {
  summarySection.classList.add("hidden");
});

btnEnroll.addEventListener("click", () => {
  if (!latestLandmarks) {
    alert("Start camera and stand in frame before enrolling.");
    return;
  }
  const signature = buildSignature(latestLandmarks);
  if (!signature) {
    alert("Face not visible — face the camera and try again.");
    return;
  }
  const name = prompt("Your name for this profile:", "Me") || "Me";
  saveIdentity({ name, signature });
  renderIdentityLabel();
});

btnClearIdentity.addEventListener("click", () => {
  clearIdentity();
  renderIdentityLabel();
});

btnExport.addEventListener("click", () => {
  const blob = new Blob([exportHistoryJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workout-history.json";
  a.click();
  URL.revokeObjectURL(url);
});

btnClearHistory.addEventListener("click", () => {
  if (confirm("Clear all saved workouts?")) {
    clearWorkoutHistory();
    renderHistory();
  }
});

btnRepPlus.addEventListener("click", () => {
  const ex = activeExerciseForManual();
  if (ex === "other") return;
  repHub.setActive(ex);
  setTracker.onExerciseChange(ex);
  repHub.adjustRep(1);
  setTracker.manualAdjustReps(setTracker.snapshot().repsInSet + 1);
  repHub.current().reps = setTracker.snapshot().repsInSet;
  updateUi(ex, 1, setTracker.snapshot().repsInSet, repHub.current().phase, "Manual adjust");
});

btnRepMinus.addEventListener("click", () => {
  const ex = activeExerciseForManual();
  if (ex === "other") return;
  repHub.setActive(ex);
  setTracker.onExerciseChange(ex);
  repHub.adjustRep(-1);
  setTracker.manualAdjustReps(Math.max(0, setTracker.snapshot().repsInSet - 1));
  repHub.current().reps = setTracker.snapshot().repsInSet;
  updateUi(ex, 1, setTracker.snapshot().repsInSet, repHub.current().phase, "Manual adjust");
});

btnNewSet.addEventListener("click", () => {
  const ex = activeExerciseForManual();
  setTracker.newSet();
  lastRepInSet = 0;
  if (ex !== "other") {
    repHub.setActive(ex);
    repHub.current().reset();
  }
  renderLog();
  updateUi(ex, 0, 0, "idle", "New set");
});

window.addEventListener("resize", resizeCanvas);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

async function bootPoseModel(): Promise<void> {
  try {
    await ensureDetector();
  } catch (e) {
    console.error("Pose model failed to load:", e);
    elModelStatus.textContent = "Pose model failed — click to retry";
    elModelStatus.onclick = () => {
      detector = null;
      elModelStatus.onclick = null;
      bootPoseModel();
    };
  }
}

bootPoseModel();
