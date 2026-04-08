// gaze.js — Phase 1 (fixed)

let gaze = { x: 0.5, y: 0.5 };
let video;
let faceDetected = false;
let detectionFrames = 0;
let totalFrames = 0;

// smoothing
let smoothX = 0.5;
let smoothY = 0.5;

// velocity tracking (needed for Phase 2/3 log)
let prevX = 0.5, prevY = 0.5;
let prevFrameTime = performance.now();

// tick rate — declared here so sensorHz seed below can reference it
const TICK_MS = 100;

// sensor Hz tracking
let lastFrameTime = performance.now();
let sensorHz = 1000 / TICK_MS; // seed with expected rate so EMA doesn't start from 0

// gaze log for export
let gazeLog = [];
const MAX_LOG = 36000; // ~1 hour at 10 Hz

// BUG FIX: was using requestAnimationFrame which runs at 60fps.
// face-api detection at 60fps is too slow — it queues up and freezes the browser.
// Fix: use setTimeout at 100ms (10 Hz) which is fast enough for gaze prediction
// and light enough to not block rendering.
// (TICK_MS moved to top of file — needed before sensorHz initializer)

export async function initGaze() {
  // wait for faceapi global to be ready (loaded via script tag)
  await new Promise((resolve) => {
    const check = () => (typeof faceapi !== "undefined" ? resolve() : setTimeout(check, 50));
    check();
  });

  video = document.getElementById("video");
  setStatus("Requesting camera…");

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  await video.play();

  setStatus("Loading face models…");
  await faceapi.nets.tinyFaceDetector.loadFromUri("./models");
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri("./models");

  setStatus("Tracking…");
  lastFrameTime = performance.now(); // reset so first dtHz isn't distorted by startup time
  trackFace();

  // BUG FIX: exportGaze was a module export only, not reachable from onclick="exportGaze()".
  // Fix: explicitly attach to window after init so the HTML button can call it.
  window.exportGaze = exportGaze;
}

async function trackFace() {
  const now = performance.now();
  const dt = Math.max((now - prevFrameTime) / 1000, 0.001);
  prevFrameTime = now;

  // BUG FIX: measure Hz BEFORE the slow faceapi await so detection latency
  // doesn't inflate dtHz and drag sensorHz toward 0.
  const dtHz = (now - lastFrameTime) / 1000;
  if (dtHz > 0) sensorHz = 0.5 * sensorHz + 0.5 * (1 / dtHz);
  lastFrameTime = now;

  try {
    totalFrames++;
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
        scoreThreshold: 0.15, // default 0.5 is too strict for webcam conditions
        inputSize: 224,
      }))
      .withFaceLandmarks(true);

    if (result) {
      faceDetected = true;
      detectionFrames++;
      setStatus("👁 Face detected");

      const landmarks = result.landmarks.positions;
      const nose = landmarks[30];

      let nx = nose.x / video.videoWidth;
      let ny = nose.y / video.videoHeight;

      // tilt-based amplification
      let dx = (nx - 0.5) * 2.0;
      let dy = (ny - 0.5) * 2.0;
      nx = Math.max(0, Math.min(1, 0.5 + dx));
      ny = Math.max(0, Math.min(1, 0.5 + dy));

      // smoothing — 0.5 alpha responds faster than 0.8
      smoothX = 0.5 * smoothX + 0.5 * nx;
      smoothY = 0.5 * smoothY + 0.5 * ny;

      // velocity
      const vx = (smoothX - prevX) / dt;
      const vy = (smoothY - prevY) / dt;
      prevX = smoothX;
      prevY = smoothY;

      gaze.x = smoothX;
      gaze.y = smoothY;

      // log entry
      const entry = { t: now, x: smoothX, y: smoothY, vx, vy, dt };
      if (gazeLog.length >= MAX_LOG) gazeLog.shift();
      gazeLog.push(entry);
    } else {
      faceDetected = false;
      setStatus("⚠ No face — move closer or improve lighting");
    }
  } catch (err) {
    faceDetected = false;
    console.warn("[gaze] detection error:", err.message);
    setStatus("⚠ Detection error: " + err.message);
  }

  // BUG FIX: was requestAnimationFrame — replaced with setTimeout for 10 Hz
  setTimeout(trackFace, TICK_MS);
}

export function getSensorHz() {
  return sensorHz;
}

export function getGaze() {
  return gaze;
}

export function getGazeLog() {
  return gazeLog;
}

export function isFaceDetected() {
  return faceDetected;
}

export function getDetectionRate() {
  if (totalFrames === 0) return 0;
  return detectionFrames / totalFrames;
}

export function exportGaze() {
  if (gazeLog.length === 0) {
    alert("No gaze data yet — wait a few seconds after tracking starts.");
    return;
  }
  const blob = new Blob([JSON.stringify({
    meta: {
      version: 1,
      tickHz: 10,
      smoothAlpha: 0.2,
      exportedAt: new Date().toISOString(),
    },
    frames: gazeLog,
  }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gaze_log.json";
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`[gaze] exported ${gazeLog.length} frames`);
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}
