// kalman.js — Phase 2 constant-velocity Kalman filter on [x, y, vx, vy]

let x = [0.5, 0.5, 0, 0]; // [x, y, vx, vy]

// Covariance matrix (4x4), initialized to small uncertainty.
let P = [
  [0.1, 0, 0, 0],
  [0, 0.1, 0, 0],
  [0, 0, 0.1, 0],
  [0, 0, 0, 0.1],
];

// Process noise and measurement noise.
const Q_BASE = 0.002;
const R = [
  [0.01, 0],
  [0, 0.01],
];

function mat4Mul(A, B) {
  const out = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[r][c] =
        A[r][0] * B[0][c] +
        A[r][1] * B[1][c] +
        A[r][2] * B[2][c] +
        A[r][3] * B[3][c];
    }
  }
  return out;
}

function mat4Transpose(A) {
  return [
    [A[0][0], A[1][0], A[2][0], A[3][0]],
    [A[0][1], A[1][1], A[2][1], A[3][1]],
    [A[0][2], A[1][2], A[2][2], A[3][2]],
    [A[0][3], A[1][3], A[2][3], A[3][3]],
  ];
}

function mat4Add(A, B) {
  const out = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) out[r][c] = A[r][c] + B[r][c];
  }
  return out;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function resetKalman(initialX = 0.5, initialY = 0.5) {
  x = [clamp01(initialX), clamp01(initialY), 0, 0];
  P = [
    [0.1, 0, 0, 0],
    [0, 0.1, 0, 0],
    [0, 0, 0.1, 0],
    [0, 0, 0, 0.1],
  ];
}

export function predictKalmanState(measurement, dt = 0.016) {
  if (!Array.isArray(measurement) || measurement.length !== 2) return [x[0], x[1]];
  const mx = measurement[0];
  const my = measurement[1];
  if (Number.isNaN(mx) || Number.isNaN(my)) return [x[0], x[1]];

  const safeDt = Math.max(Math.min(dt, 0.2), 0.001);

  // State transition matrix F for constant velocity model.
  const F = [
    [1, 0, safeDt, 0],
    [0, 1, 0, safeDt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  // Process noise (scaled by dt).
  const q = Q_BASE * (1 + safeDt * 30);
  const Q = [
    [q, 0, 0, 0],
    [0, q, 0, 0],
    [0, 0, q * 2, 0],
    [0, 0, 0, q * 2],
  ];

  // Prediction: x = F*x
  const xp = [
    F[0][0] * x[0] + F[0][2] * x[2],
    F[1][1] * x[1] + F[1][3] * x[3],
    x[2],
    x[3],
  ];

  // Covariance prediction: P = F*P*F^T + Q
  const FP = mat4Mul(F, P);
  const FPFt = mat4Mul(FP, mat4Transpose(F));
  const Pp = mat4Add(FPFt, Q);

  // Measurement model H projects to position only: z = [x, y].
  // Innovation y = z - H*xp
  const y0 = mx - xp[0];
  const y1 = my - xp[1];

  // S = H*P*H^T + R => top-left 2x2 of Pp + R
  const s00 = Pp[0][0] + R[0][0];
  const s01 = Pp[0][1] + R[0][1];
  const s10 = Pp[1][0] + R[1][0];
  const s11 = Pp[1][1] + R[1][1];

  const det = s00 * s11 - s01 * s10;
  if (Math.abs(det) < 1e-9) {
    x = [clamp01(xp[0]), clamp01(xp[1]), xp[2], xp[3]];
    P = Pp;
    return [x[0], x[1]];
  }

  // inv(S) for 2x2
  const invS00 = s11 / det;
  const invS01 = -s01 / det;
  const invS10 = -s10 / det;
  const invS11 = s00 / det;

  // Kalman gain K = Pp*H^T*inv(S).
  // Since H selects first 2 states, Pp*H^T is first two columns of Pp.
  const K = [
    [Pp[0][0] * invS00 + Pp[0][1] * invS10, Pp[0][0] * invS01 + Pp[0][1] * invS11],
    [Pp[1][0] * invS00 + Pp[1][1] * invS10, Pp[1][0] * invS01 + Pp[1][1] * invS11],
    [Pp[2][0] * invS00 + Pp[2][1] * invS10, Pp[2][0] * invS01 + Pp[2][1] * invS11],
    [Pp[3][0] * invS00 + Pp[3][1] * invS10, Pp[3][0] * invS01 + Pp[3][1] * invS11],
  ];

  // State update x = xp + K*y
  x = [
    clamp01(xp[0] + K[0][0] * y0 + K[0][1] * y1),
    clamp01(xp[1] + K[1][0] * y0 + K[1][1] * y1),
    xp[2] + K[2][0] * y0 + K[2][1] * y1,
    xp[3] + K[3][0] * y0 + K[3][1] * y1,
  ];

  // Covariance update P = (I - K*H) * Pp
  // With H selecting first 2 states, K*H has K col0 affecting row->x and col1 affecting row->y.
  const IminusKH = [
    [1 - K[0][0], -K[0][1], 0, 0],
    [-K[1][0], 1 - K[1][1], 0, 0],
    [-K[2][0], -K[2][1], 1, 0],
    [-K[3][0], -K[3][1], 0, 1],
  ];
  P = mat4Mul(IminusKH, Pp);

  const lookahead = 0.2; // 200 ms
  return [
    clamp01(x[0] + x[2] * lookahead),
    clamp01(x[1] + x[3] * lookahead),
  ];
}
