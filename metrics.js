// metrics.js — Phase 1 (fixed)

import { getPopIn } from "./streaming.js";
import { getSensorHz, getGaze, isFaceDetected, getDetectionRate, getGazeLog } from "./gaze.js";
import { getError } from "./evaluation.js";
import { getAvgLoadLatencyMs, getGpuMemoryKB } from "./streaming.js";

// BUG FIX: FPS was calculated as 1/dt from the rAF loop dt.
// rAF dt is extremely noisy (varies 4–30ms even at "60fps") so raw 1/dt showed
// values jumping between 40 and 300. Fix: smooth FPS with a rolling average.
let smoothFps = 60;

export function updateMetrics(dt, extra = {}) {
  if (dt <= 0) return;

  // smooth FPS: blend toward instantaneous value
  const instantFps = 1 / dt;
  smoothFps = 0.95 * smoothFps + 0.05 * instantFps;

  const sensor = getSensorHz ? getSensorHz() : 0;
  const predErr = getError ? getError() : 0;
  const g = getGaze ? getGaze() : { x: 0, y: 0 };
  const face = isFaceDetected ? isFaceDetected() : false;
  const detectionRate = getDetectionRate ? getDetectionRate() : 0;
  const frameCount = getGazeLog ? getGazeLog().length : 0;
  const mode = extra.mode || "reactive";
  const mlReady = !!extra.mlReady;
  const mlAvgInferenceMs = Number(extra.mlAvgInferenceMs || 0);
  const mlBufferFill = Number(extra.mlBufferFill || 0);
  const mlBufferCapacity = Number(extra.mlBufferCapacity || 10);

  document.getElementById("metrics").innerHTML =
    `FPS: ${smoothFps.toFixed(1)}<br>` +
    `Sensor Hz: ${sensor.toFixed(1)}<br>` +
    `Face: ${face ? "YES" : "NO"} (${(detectionRate * 100).toFixed(0)}%)<br>` +
    `Gaze X: ${g.x.toFixed(3)} &nbsp; Y: ${g.y.toFixed(3)}<br>` +
    `Pop-in: ${getPopIn()}<br>` +
    `Load latency: ${getAvgLoadLatencyMs().toFixed(1)} ms<br>` +
    `GPU mem: ${getGpuMemoryKB().toFixed(1)} KB<br>` +
    `Log frames: ${frameCount}<br>` +
    `Mode: ${mode.toUpperCase()}<br>` +
    `ML: ${mlReady ? "READY" : "WARMING"} (${mlBufferFill}/${mlBufferCapacity})<br>` +
    `ML infer: ${mlAvgInferenceMs.toFixed(2)} ms<br>` +
    `Pred error: ${predErr.toFixed(3)}`;
}
