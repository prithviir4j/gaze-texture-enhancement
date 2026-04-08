// sequenceBuffer.js — Phase 1 (no changes needed — logic is correct)

let buffer = [];
const MAX_LEN = 10;

export function updateSequence(gaze, dt) {
  let vx = 0, vy = 0;

  if (buffer.length > 0) {
    const prev = buffer[buffer.length - 1];
    const safeDt = Math.max(Math.min(dt, 0.5), 0.001); // guard against huge dt and div-by-zero
    vx = (gaze.x - prev[0]) / safeDt;
    vy = (gaze.y - prev[1]) / safeDt;
  }

  buffer.push([gaze.x, gaze.y, vx, vy]);
  if (buffer.length > MAX_LEN) buffer.shift();

  // pad from front if still short
  while (buffer.length < MAX_LEN) {
    buffer.unshift([buffer[0][0], buffer[0][1], 0, 0]);
  }

  return buffer.map(row => [...row]);
}
