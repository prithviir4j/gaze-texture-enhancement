/**
 * model.js  —  Phase 3: DB-LSTM Inference Wrapper
 * Samsung PRISM — Real-Time Predictive Texture Streaming
 *
 * This module loads the TF.js graph model exported by train.py and
 * provides a rolling-buffer infer() function that the main RAF loop
 * calls every gaze tick to get a 200 ms lookahead prediction.
 *
 * Integration checklist:
 *   1. Copy the exported tfjs_model/ folder next to index.html
 *   2. Add <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js"></script>
 *      to index.html before this module
 *   3. Import and use GazeLSTMPredictor in main.js (see Usage section below)
 *
 * Usage (main.js):
 *
 *   import { GazeLSTMPredictor } from './model.js';
 *
 *   const predictor = new GazeLSTMPredictor('./tfjs_model/model.json');
 *   await predictor.load();                    // called once at startup
 *
 *   // On every gaze tick (in the gazeupdate handler):
 *   predictor.pushTick({ x, y, vx, vy });
 *   const { predX, predY } = predictor.infer();   // returns current-pos fallback until buffer is full
 */

const SEQ_LEN   = 10;   // must match training SEQ_LEN
const INPUT_DIM =  4;   // [x, y, vx, vy]

export class GazeLSTMPredictor {
  /**
   * @param {string} modelUrl  - path to tfjs_model/model.json
   */
  constructor(modelUrl = './tfjs_model/model.json') {
    this.modelUrl  = modelUrl;
    this.model     = null;
    this.ready     = false;

    // Rolling buffer of the last SEQ_LEN gaze ticks
    // Each tick: Float32Array([x, y, vx, vy])
    this._buffer   = [];

    // Latency tracking
    this._inferenceMs = 0;
    this._inferenceCount = 0;

    // Fallback: last known gaze position used when buffer is not yet full
    this._lastGaze = { x: 0.5, y: 0.5 };
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────

  /**
   * Load the TF.js model from disk.
   * Call once during application initialisation (async).
   *
   * @returns {Promise<void>}
   */
  async load() {
    try {
      console.log(`[model] Loading DB-LSTM from ${this.modelUrl} …`);
      this.model = await tf.loadGraphModel(this.modelUrl);

      // Warm-up: run a single dummy inference so WebGL shaders compile before
      // the user's first real gaze tick arrives.
      const warmup = tf.zeros([1, SEQ_LEN, INPUT_DIM]);
      this.model.predict(warmup).dispose();
      warmup.dispose();

      this.ready = true;
      console.log('[model] DB-LSTM ready. Warm-up inference complete.');
    } catch (err) {
      console.warn('[model] Failed to load DB-LSTM model:', err.message);
      console.warn('[model] Falling back to Kalman filter predictor.');
      this.ready = false;
    }
  }

  /**
   * Push one gaze tick into the rolling buffer.
   * Call this immediately after each gazeupdate event.
   *
   * @param {{ x: number, y: number, vx: number, vy: number }} tick
   */
  pushTick({ x, y, vx, vy }) {
    this._lastGaze = { x, y };

    this._buffer.push(new Float32Array([x, y, vx, vy]));
    if (this._buffer.length > SEQ_LEN) {
      this._buffer.shift();   // maintain fixed-length sliding window
    }
  }

  /**
   * Run DB-LSTM inference on the current rolling buffer.
   *
   * If the model is not loaded or the buffer has fewer than SEQ_LEN ticks,
   * returns the current gaze position as a no-op fallback so the
   * streaming manager always receives a valid prediction.
   *
   * @returns {{ predX: number, predY: number, inferenceMs: number, ready: boolean }}
   */
  infer() {
    // ── Fallback: buffer not yet filled or model failed to load ──────────
    if (!this.ready || this._buffer.length < SEQ_LEN) {
      return {
        predX: this._lastGaze.x,
        predY: this._lastGaze.y,
        inferenceMs: 0,
        ready: false,
      };
    }

    const t0 = performance.now();

    // ── Build input tensor (1, SEQ_LEN, INPUT_DIM) ───────────────────────
    // Flatten the rolling buffer into a single Float32Array for tf.tensor3d
    const flat = new Float32Array(SEQ_LEN * INPUT_DIM);
    for (let i = 0; i < SEQ_LEN; i++) {
      flat.set(this._buffer[i], i * INPUT_DIM);
    }

    let predX, predY;

    // All TF.js operations must be wrapped in tf.tidy to prevent memory leaks
    tf.tidy(() => {
      const inputTensor = tf.tensor3d(flat, [1, SEQ_LEN, INPUT_DIM]);
      const outputTensor = this.model.predict(inputTensor);   // (1, 2)
      const output = outputTensor.dataSync();                 // synchronous read

      predX = output[0];
      predY = output[1];
    });

    const inferenceMs = performance.now() - t0;
    this._inferenceMs = this._inferenceMs * 0.9 + inferenceMs * 0.1;   // EMA
    this._inferenceCount++;

    // Clamp predictions to valid normalised canvas range
    predX = Math.max(0, Math.min(1, predX));
    predY = Math.max(0, Math.min(1, predY));

    return { predX, predY, inferenceMs, ready: true };
  }

  // ─────────────────────────────────────────────────────────────
  // DIAGNOSTICS
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns diagnostic info for the HUD overlay.
   * @returns {{ avgInferenceMs: number, bufferFill: number, ready: boolean }}
   */
  getStats() {
    return {
      avgInferenceMs: +this._inferenceMs.toFixed(2),
      bufferFill: this._buffer.length,
      bufferCapacity: SEQ_LEN,
      ready: this.ready,
      inferenceCount: this._inferenceCount,
    };
  }

  /**
   * Reset the rolling buffer (e.g. when the scene changes or the user
   * has been idle for >2 s).
   */
  reset() {
    this._buffer = [];
    console.log('[model] Rolling buffer reset.');
  }

  /**
   * Dispose TF.js tensors and free GPU memory.
   * Call on page unload or when switching away from the DB-LSTM predictor.
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.ready = false;
      console.log('[model] DB-LSTM disposed.');
    }
  }
}


// ─────────────────────────────────────────────────────────────
// INTEGRATION EXAMPLE (illustrates how main.js wires this in)
// ─────────────────────────────────────────────────────────────
//
//  // In main.js — startup sequence
//  import { GazeLSTMPredictor } from './model.js';
//  import { KalmanPredictor }    from './kalman.js';
//
//  const lstmPredictor   = new GazeLSTMPredictor('./tfjs_model/model.json');
//  const kalmanPredictor = new KalmanPredictor();
//
//  let currentMode = 'reactive';   // 'reactive' | 'kalman' | 'dblstm'
//
//  // Load the model in the background; streaming continues with kalman fallback
//  lstmPredictor.load().then(() => {
//    console.log('[main] DB-LSTM ready for mode switch');
//  });
//
//  // Gaze update handler (fires at ~10 Hz from gaze.js)
//  document.addEventListener('gazeupdate', (e) => {
//    const { x, y, vx, vy } = e.detail;
//
//    // Always push to predictor regardless of current mode (keeps buffer warm)
//    lstmPredictor.pushTick({ x, y, vx, vy });
//    kalmanPredictor.update(x, y);
//
//    let predX, predY;
//    switch (currentMode) {
//      case 'reactive':
//        predX = x;  predY = y;
//        break;
//      case 'kalman':
//        ({ predX, predY } = kalmanPredictor.predict());
//        break;
//      case 'dblstm': {
//        const result = lstmPredictor.infer();
//        // Fallback to Kalman if model not yet ready
//        if (result.ready) {
//          predX = result.predX;
//          predY = result.predY;
//        } else {
//          ({ predX, predY } = kalmanPredictor.predict());
//        }
//        break;
//      }
//    }
//
//    // Hand predicted position to the texture streaming manager
//    textureStreamer.update(predX, predY);
//  });
