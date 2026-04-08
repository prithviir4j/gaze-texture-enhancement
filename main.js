import { initGaze, getGaze, isFaceDetected } from "./gaze.js";
import {
  initScene,
  updateScene,
  getCamera,
  getSceneVersion,
  getStreamObjects,
  setSceneMode,
} from "./scene.js";
import { updateMetrics } from "./metrics.js";
import { predictKalman } from "./predictor.js";
import { predictKalmanState, resetKalman } from "./kalman.js";
import { updateStreaming, registerObjects, resetPopIn } from "./streaming.js";
import { logPrediction } from "./evaluation.js";
import { GazeLSTMPredictor } from "./phase_3/model.js";

async function init() {
  await initGaze();
  initScene();
  wireUi();

  const mlPredictor = new GazeLSTMPredictor("./tfjs_model/model.json");
  mlPredictor.load();

  let lastTime = performance.now();
  let lastSceneVersion = -1;
  let sampleTimer = 0;
  let prevSample = null;
  let latestMlStats = mlPredictor.getStats();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const gaze = getGaze();
    const mode = getMode();
    sampleTimer += dt;

    // Feed ML model at sensor-like cadence (~10 Hz), not every RAF frame.
    if (sampleTimer >= 0.1) {
      const safeDt = Math.max(sampleTimer, 0.001);
      const vx = prevSample ? (gaze.x - prevSample.x) / safeDt : 0;
      const vy = prevSample ? (gaze.y - prevSample.y) / safeDt : 0;
      mlPredictor.pushTick({ x: gaze.x, y: gaze.y, vx, vy });
      prevSample = { x: gaze.x, y: gaze.y };
      sampleTimer = 0;
    }

    let predicted;
    if (mode === "reactive") {
      predicted = [gaze.x, gaze.y];
    } else if (mode === "kalman") {
      predicted = predictKalmanState([gaze.x, gaze.y], dt);
    } else if (mode === "dblstm") {
      const ml = mlPredictor.infer();
      predicted = ml.ready ? [ml.predX, ml.predY] : predictKalmanState([gaze.x, gaze.y], dt);
      latestMlStats = mlPredictor.getStats();
    } else {
      predicted = predictKalman([gaze.x, gaze.y], dt);
    }

    // Flip x so dot + 3D scene move naturally (webcam is mirrored)
    const mirroredPredicted = [1 - predicted[0], predicted[1]];

    // Update 2D HTML gaze cursor.
    const gazeDot = document.getElementById("gaze-cursor");
    if (gazeDot) {
      gazeDot.style.left = `${(1 - gaze.x) * 100}%`;
      gazeDot.style.top = `${gaze.y * 100}%`;
    }

    // Re-register streamable objects if scene changed.
    const sceneVersion = getSceneVersion();
    if (sceneVersion !== lastSceneVersion) {
      registerObjects(getStreamObjects());
      lastSceneVersion = sceneVersion;
    }

    const cam = getCamera();
    const detected = isFaceDetected ? isFaceDetected() : true;
    const streamPoint = detected ? mirroredPredicted : [0.5, 0.5];
    updateScene(streamPoint);
    if (cam) updateStreaming(streamPoint, cam);

    logPrediction(gaze, predicted);
    updateMetrics(dt, {
      mode,
      mlReady: latestMlStats.ready,
      mlAvgInferenceMs: latestMlStats.avgInferenceMs,
      mlBufferFill: latestMlStats.bufferFill,
      mlBufferCapacity: latestMlStats.bufferCapacity,
    });
  }

  animate();
}

function wireUi() {
  const modeSelect = document.getElementById("mode-select");
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      const g = getGaze();
      resetKalman(g.x, g.y);
      resetPopIn(); // Reset pop-in counter when switching modes
      syncModeButtons(modeSelect.value || "reactive");
    });
  }

  const modeButtons = document.querySelectorAll("[data-mode]");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode") || "reactive";
      if (modeSelect) {
        modeSelect.value = mode;
        modeSelect.dispatchEvent(new Event("change"));
      }
    });
  });
  syncModeButtons(modeSelect ? modeSelect.value : "reactive");

  const sceneSelect = document.getElementById("scene-select");
  if (sceneSelect) {
    setSceneMode(sceneSelect.value || "gallery");
    sceneSelect.addEventListener("change", () => {
      setSceneMode(sceneSelect.value || "gallery");
    });
  }
}

function getMode() {
  const modeSelect = document.getElementById("mode-select");
  if (!modeSelect) return "reactive";
  return modeSelect.value || "reactive";
}

function syncModeButtons(mode) {
  const modeButtons = document.querySelectorAll("[data-mode]");
  modeButtons.forEach((btn) => {
    const btnMode = btn.getAttribute("data-mode");
    if (btnMode === mode) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

init();
