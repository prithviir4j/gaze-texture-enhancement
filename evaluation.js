// evaluation.js — Phase 1 (fixed)

let buffer = [];

export function logPrediction(actual, predicted) {
  // BUG FIX: original check was `if (!predicted)` — but an array like [0.5, 0.5]
  // is always truthy, so a malformed array with wrong length slipped through.
  // Fix: explicitly check it's an array with 2 numeric values.
  if (!Array.isArray(predicted) || predicted.length !== 2) return;
  if (isNaN(predicted[0]) || isNaN(predicted[1])) return;
  if (!actual || isNaN(actual.x) || isNaN(actual.y)) return;

  buffer.push({
    t:  performance.now(),
    ax: actual.x,
    ay: actual.y,
    px: predicted[0],
    py: predicted[1],
  });

  if (buffer.length > 300) buffer.shift();
}

export function getError() {
  if (buffer.length < 20) return 0;

  let error = 0;
  let count = 0;
  const TARGET_DELAY = 150; // ms

  for (let i = 0; i < buffer.length; i++) {
    const p = buffer[i];
    const future = buffer.find(b => b.t >= p.t + TARGET_DELAY);
    if (!future) continue;

    // BUG NOTE: coords are normalised 0–1. This error is in normalised units,
    // not pixels. To convert to pixels multiply by canvas width/height.
    // Left as-is for Phase 1 — Phase 2 will track pixel error properly.
    const dx = p.px - future.ax;
    const dy = p.py - future.ay;
    error += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  return count > 0 ? error / count : 0;
}
