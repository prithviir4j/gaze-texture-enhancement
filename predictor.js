// predictor.js — Phase 1 (no logic bugs, minor guard added)

let state = [0.5, 0.5];
let velocity = [0, 0];

const SMOOTHING  = 0.8;
const LOOKAHEAD  = 0.15; // seconds (150 ms)

export function predictKalman(measurement, dt = 0.016) {
  if (!Array.isArray(measurement) || measurement.length !== 2) return state;

  const [mx, my] = measurement;
  if (isNaN(mx) || isNaN(my)) return state;

  // clamp dt to avoid velocity explosion on tab-switch (dt can be huge)
  const safeDt = Math.max(Math.min(dt, 0.5), 0.001);

  const vx = (mx - state[0]) / safeDt;
  const vy = (my - state[1]) / safeDt;

  velocity[0] = SMOOTHING * velocity[0] + (1 - SMOOTHING) * vx;
  velocity[1] = SMOOTHING * velocity[1] + (1 - SMOOTHING) * vy;

  state[0] = mx;
  state[1] = my;

  let futureX = Math.max(0, Math.min(1, mx + velocity[0] * LOOKAHEAD));
  let futureY = Math.max(0, Math.min(1, my + velocity[1] * LOOKAHEAD));

  return [futureX, futureY];
}
