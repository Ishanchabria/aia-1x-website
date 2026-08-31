import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createDrone } from "./drone.js";
import "./style.css";

gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById("drone-canvas");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 4.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

scene.add(new THREE.AmbientLight(0xfae1c3, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(3, 4, 2);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc25640, 0.6);
rimLight.position.set(-3, 1, -2);
scene.add(rimLight);

const { group: drone, parts, stageCount } = createDrone();
scene.add(drone);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);

function render() {
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
  // Explode each part based on which stage "owns" it
  parts.forEach(({ mesh, origin, explode, stage }) => {
    const { start } = stageWindow(stage);
    const localT = THREE.MathUtils.clamp((progress - start) / (1 - start), 0, 1);
    const eased = gsap.parseEase("power2.out")(localT);
    mesh.position.lerpVectors(origin, origin.clone().add(explode), eased);
  });

  drone.rotation.y = progress * Math.PI * 1.3;

  const camAngle = progress * Math.PI * 0.7;
  const radius = 4.2 + progress * 2.4;
  camera.position.x = Math.sin(camAngle) * radius;
  camera.position.z = Math.cos(camAngle) * radius;
  camera.position.y = 1.6 + progress * 1.8;
  camera.lookAt(0, 0.2, 0);

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
