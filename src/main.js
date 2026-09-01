import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createDrone, updateDynamicWires } from "./drone.js";
import "./style.css";

gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById("drone-canvas");
const scene = new THREE.Scene();

// Scene is modeled in true mm — drone reads ~100mm across, so the camera
// and lights sit tens/hundreds of units out rather than the 1-4 unit range
// a toy scene would use.
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.set(0, 55, 260);
camera.lookAt(0, 25, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- three-point lighting ---
scene.add(new THREE.AmbientLight(0xfff4e8, 0.35));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(150, 220, 120);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -180;
keyLight.shadow.camera.right = 180;
keyLight.shadow.camera.top = 180;
keyLight.shadow.camera.bottom = -180;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 800;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xdfe6ea, 0.45);
fillLight.position.set(-180, 90, -80);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xc9d6e0, 0.9);
rimLight.position.set(-60, 150, -220);
scene.add(rimLight);

// soft neutral ground to catch contact shadows — sits outside the
// rotating drone group so it always stays level
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45, metalness: 0.05 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -46;
ground.receiveShadow = true;
scene.add(ground);

const { group: drone, parts, dynamicWires, stageCount } = createDrone();
drone.traverse((obj) => {
  if (obj.isMesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});
scene.add(drone);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);

// Props spin continuously, but only once they've separated from the motors —
// `spinT` is set by updateScene to how far along that part's explosion is.
const spinners = parts.filter((p) => p.spin);
const clock = new THREE.Clock();

function render() {
  const dt = clock.getDelta();
  spinners.forEach((p) => {
    if (p.spinT) p.mesh.rotation.y += p.spin * p.spinT * dt;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

// --- Scroll-driven explode + camera orbit ---
const captions = gsap.utils.toArray(".caption");
const hud = {
  build: document.getElementById("hud-build"),
  alt: document.getElementById("hud-alt"),
  pitch: document.getElementById("hud-pitch"),
  vbat: document.getElementById("hud-vbat"),
  stage: document.getElementById("hud-stage"),
};

function stageWindow(stage) {
  const span = 1 / stageCount;
  return { start: stage * span, end: (stage + 1) * span };
}

function updateScene(progress) {
  parts.forEach((part) => {
    const { mesh, origin, explode, stage } = part;
    const { start } = stageWindow(stage);
    const localT = THREE.MathUtils.clamp((progress - start) / (1 - start), 0, 1);
    const eased = gsap.parseEase("power2.out")(localT);
    mesh.position.lerpVectors(origin, origin.clone().add(explode), eased);
    part.spinT = eased;
  });

  updateDynamicWires(dynamicWires);

  drone.rotation.y = progress * Math.PI * 1.1;

  const camAngle = progress * Math.PI * 0.7;
  const radius = 260 + progress * 220;
  camera.position.x = Math.sin(camAngle) * radius;
  camera.position.z = Math.cos(camAngle) * radius;
  camera.position.y = 55 + progress * 140;
  camera.lookAt(0, 25 + progress * 15, 0);

  // Captions: fade in/out within each stage window
  captions.forEach((el) => {
    const stage = Number(el.dataset.stage);
    const { start, end } = stageWindow(stage);
    const fade = 0.35 * (end - start);
    let opacity = 0;
    if (progress >= start && progress <= end) {
      const distIn = start === 0 ? 1 : progress - start;
      const distOut = end === 1 ? 1 : end - progress;
      opacity = Math.min(distIn / fade, distOut / fade, 1);
    }
    gsap.set(el, { opacity: Math.max(0, Math.min(1, opacity)) });
  });

  // HUD
  hud.build.textContent = `${Math.round(progress * 100)
    .toString()
    .padStart(2, "0")}%`;
  hud.alt.textContent = `${(progress * 120).toFixed(1)} m`;
  hud.pitch.textContent = `${(Math.sin(progress * Math.PI * 2) * 18).toFixed(1)}°`;
  hud.vbat.textContent = `${(4.2 - progress * 0.5).toFixed(2)} V`;
  hud.stage.textContent = `${Math.min(stageCount, Math.floor(progress * stageCount) + 1)
    .toString()
    .padStart(2, "0")}`;
}

updateScene(0);

ScrollTrigger.create({
  trigger: "#scroll-scene",
  start: "top top",
  end: "bottom bottom",
  scrub: 0.3,
  onUpdate: (self) => updateScene(self.progress),
});
