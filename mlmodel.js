// mlModel.js — Phase 1 (fixed)
// NOTE: This model is scaffolding for Phase 3. In Phase 1 it is built but not
// used for predictions — predictKalman() handles predictions instead.
// Phase 3 will train this model on collected gaze logs and swap it in.

let model = null;

export async function initModel() {
  // wait for TF global
  await new Promise((resolve) => {
    const check = () => (typeof window.tf !== "undefined" ? resolve() : setTimeout(check, 50));
    check();
  });

  const tf = window.tf;

  try {
    const input = tf.layers.input({ shape: [10, 4] });

    // ── CNN BRANCH ─────────────────────────────────────────────────────────
    const conv = tf.layers.conv1d({
      filters: 16, kernelSize: 3, padding: "same", activation: "relu"
    }).apply(input);

    const gap = tf.layers.globalAveragePooling1d().apply(conv);

    const denseAttn = tf.layers.dense({ units: 16, activation: "sigmoid" }).apply(gap);
    const expand    = tf.layers.reshape({ targetShape: [1, 16] }).apply(denseAttn);
    const convScaled = tf.layers.multiply().apply([conv, expand]);
    const convFlat  = tf.layers.flatten().apply(convScaled);

    // ── ATTENTION BRANCH ───────────────────────────────────────────────────
    const attn     = tf.layers.dense({ units: 16, activation: "relu" }).apply(input);
    const attnFlat = tf.layers.flatten().apply(attn);

    // ── LSTM BRANCH ────────────────────────────────────────────────────────
    // BUG FIX: original had TWO identical LSTMs both applied to `input` independently.
    // The second was completely redundant — same input, same architecture, just doubles
    // params with no benefit. Replaced with a single LSTM.
    const lstm = tf.layers.lstm({ units: 32, returnSequences: false }).apply(input);

    // ── FUSION ─────────────────────────────────────────────────────────────
    const concat = tf.layers.concatenate().apply([convFlat, attnFlat, lstm]);

    const gate  = tf.layers.dense({
      units: concat.shape[1], activation: "sigmoid"
    }).apply(concat);

    const fused = tf.layers.multiply().apply([concat, gate]);

    // ── OUTPUT ─────────────────────────────────────────────────────────────
    const output = tf.layers.dense({ units: 2, activation: "sigmoid" }).apply(fused);

    model = tf.model({ inputs: input, outputs: output });

    console.log(`[mlModel] initialized — ${model.countParams().toLocaleString()} params`);
  } catch (err) {
    console.warn("[mlModel] build failed:", err.message);
  }
}

export function getModel() {
  return model;
}
