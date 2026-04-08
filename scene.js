// scene.js — Three.js Gallery and Tunnel panel scenes

let renderer;
let scene;
let camera;
let objects = [];
let sceneMode = "gallery";
let sceneVersion = 0;

export function initScene() {
  const THREE = window.THREE;
  if (!THREE) throw new Error("Three.js not available");

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "1";
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06080f);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 14);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(8, 10, 12);
  scene.add(directional);

  rebuildScene(sceneMode);
  window.addEventListener("resize", onResize);
}

export function getCamera() {
  return camera;
}

export function getStreamObjects() {
  return objects;
}

export function getSceneVersion() {
  return sceneVersion;
}

export function setSceneMode(mode) {
  const next = mode === "tunnel" ? "tunnel" : "gallery";
  if (next === sceneMode) return;
  sceneMode = next;
  rebuildScene(sceneMode);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function rebuildScene(mode) {
  const THREE = window.THREE;
  if (!THREE || !scene) return;

  for (const mesh of objects) {
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  objects = [];

  if (mode === "tunnel") {
    buildTunnel(THREE);
  } else {
    buildGallery(THREE);
  }
  sceneVersion++;
}

function buildGallery(THREE) {
  // 8 panels arranged in a ring around the viewer.
  const count = 8;
  const radius = 8.5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const geometry = new THREE.PlaneGeometry(3.2, 2.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x6a7280 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Math.sin(a) * radius, 0.6 * Math.sin(a * 2), Math.cos(a) * radius - 2);
    mesh.lookAt(0, 0.2, -2);
    scene.add(mesh);
    objects.push(mesh);
  }
}

function buildTunnel(THREE) {
  // Corridor-like tunnel with side panels.
  const segments = 6;
  for (let i = 0; i < segments; i++) {
    const z = -i * 4 - 2;
    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(2.8, 2.2);
      const material = new THREE.MeshBasicMaterial({ color: 0x6a7280 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(side * 3.6, 0.2, z);
      mesh.rotation.y = side > 0 ? -Math.PI / 2.35 : Math.PI / 2.35;
      scene.add(mesh);
      objects.push(mesh);
    }
  }
}

export function updateScene(predictedGaze) {
  if (!renderer || !scene || !camera) return;

  if (Array.isArray(predictedGaze) && predictedGaze.length === 2) {
    const targetX = (predictedGaze[0] - 0.5) * 3.2;
    const targetY = (0.5 - predictedGaze[1]) * 2.2;
    camera.position.x = camera.position.x * 0.92 + targetX * 0.08;
    camera.position.y = camera.position.y * 0.92 + targetY * 0.08;
    camera.lookAt(0, 0, sceneMode === "tunnel" ? -8 : -2);
  }

  renderer.render(scene, camera);
}
