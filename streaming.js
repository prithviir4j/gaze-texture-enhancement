// streaming.js — Multi-resolution texture streaming manager

const LEVELS = {
  LOW: { size: 64, delay: 0, tint: "#7f8b96" },
  MID: { size: 256, delay: 80, tint: "#d1a96e" },
  HIGH: { size: 512, delay: 200, tint: "#8ad5ff" },
};

let objects = [];
let popIn = 0;
let totalLoadMs = 0;
let loadCount = 0;
let memoryBytes = 0;

function levelOrder(level) {
  if (level === "HIGH") return 2;
  if (level === "MID") return 1;
  return 0;
}

export function registerObjects(sceneObjects) {
  const THREE = window.THREE;
  if (!THREE) return;

  objects = sceneObjects.map((mesh, idx) => {
    const texLow = makeTierTexture(THREE, idx, "LOW");
    const texMid = makeTierTexture(THREE, idx, "MID");
    const texHigh = makeTierTexture(THREE, idx, "HIGH");
    const textures = { LOW: texLow, MID: texMid, HIGH: texHigh };

    if (mesh.material) mesh.material.dispose();
    mesh.material = new THREE.MeshBasicMaterial({ map: texLow, side: THREE.DoubleSide });

    return {
      mesh,
      idx,
      loaded: new Set(["LOW"]),
      current: "LOW",
      target: "LOW",
      loading: null,
      textures,
    };
  });

  memoryBytes = objects.length * LEVELS.LOW.size * LEVELS.LOW.size * 4;
}

export function updateStreaming(predictedGaze, camera) {
  if (!Array.isArray(predictedGaze) || predictedGaze.length !== 2) return;
  if (!camera || objects.length === 0) return;

  for (const obj of objects) {
    const screen = obj.mesh.position.clone().project(camera);
    const sx = (screen.x + 1) * 0.5;
    const sy = (1 - screen.y) * 0.5;
    const dx = sx - predictedGaze[0];
    const dy = sy - predictedGaze[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Tier thresholds from plan: HIGH < 18% of screen radius, MID < 40%.
    const needed = dist < 0.18 ? "HIGH" : dist < 0.4 ? "MID" : "LOW";
    obj.target = needed;

    if (levelOrder(obj.current) < levelOrder(needed)) {
      popIn++;
    }

    requestTier(obj, needed);
    maybeApplyBestLoadedTier(obj);
  }
}

function requestTier(obj, level) {
  if (obj.loaded.has(level)) return;
  if (obj.loading === level) return;

  obj.loading = level;
  const started = performance.now();
  const delay = LEVELS[level].delay;

  setTimeout(() => {
    obj.loaded.add(level);
    memoryBytes += LEVELS[level].size * LEVELS[level].size * 4;
    obj.loading = null;
    totalLoadMs += performance.now() - started;
    loadCount++;
    maybeApplyBestLoadedTier(obj);
  }, delay);
}

function maybeApplyBestLoadedTier(obj) {
  const best =
    obj.loaded.has("HIGH") && levelOrder(obj.target) >= 2 ? "HIGH"
      : obj.loaded.has("MID") && levelOrder(obj.target) >= 1 ? "MID"
      : "LOW";

  if (best === obj.current) return;
  obj.current = best;
  obj.mesh.material.map = obj.textures[best];
  obj.mesh.material.needsUpdate = true;
}

function makeTierTexture(THREE, index, level) {
  const cfg = LEVELS[level];
  const canvas = document.createElement("canvas");
  canvas.width = cfg.size;
  canvas.height = cfg.size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = cfg.tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cell = Math.max(8, Math.floor(cfg.size / 8));
  for (let y = 0; y < canvas.height; y += cell) {
    for (let x = 0; x < canvas.width; x += cell) {
      const dark = ((x / cell + y / cell) & 1) === 0;
      ctx.fillStyle = dark ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.12)";
      ctx.fillRect(x, y, cell, cell);
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.max(12, Math.floor(cfg.size / 9))}px monospace`;
  ctx.fillText(`${level} ${cfg.size}px`, 10, Math.max(18, Math.floor(cfg.size * 0.12)));
  ctx.fillText(`P${index + 1}`, 10, Math.max(34, Math.floor(cfg.size * 0.22)));

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = true;
  return texture;
}

export function getPopIn() {
  return popIn;
}

export function getAvgLoadLatencyMs() {
  return loadCount > 0 ? totalLoadMs / loadCount : 0;
}

export function getGpuMemoryKB() {
  return memoryBytes / 1024;
}

export function resetPopIn() {
  popIn = 0;
}
