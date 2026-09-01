import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createDrone, updateDynamicWires } from "./drone.js";
import "./style.css";

gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById("drone-canvas");
const scene = new THREE.Scene();

// Radial gradient generated at runtime — used to fade the floor out at its
// edges and to fake a soft contact shadow, so neither ships as an image.
function radialFadeTexture(inner = 1, outer = 0) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(255,255,255,${inner})`);
  g.addColorStop(0.55, `rgba(255,255,255,${inner * 0.55})`);
  g.addColorStop(1, `rgba(255,255,255,${outer})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Scene is modeled in true mm — drone reads ~100mm across, so the camera
// and lights sit tens/hundreds of units out rather than the 1-4 unit range
// a toy scene would use.
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.set(0, 55, 260);
camera.lookAt(0, 25, 0);

const isMobile = window.matchMedia("(max-width: 768px)").matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// --- environment map: metal is pure reflection, so this is what makes the
// gunmetal read as metal at all. RoomEnvironment goes in immediately (zero
// download) so no frame ever renders unlit; the studio HDRI upgrades it. ---
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// Spec called for ~0.9, but studio_small_09 is a bright-softbox HDRI: at 0.9 its
// reflection blew the clearcoat surfaces (frame, ESP32 shield) to pure white and
// stole the "motors are the brightest thing" read. Lowered to keep the intent.
scene.environmentIntensity = 0.32;
scene.background = null;

let readyFired = false;
function sceneReady() {
  if (readyFired) return;
  readyFired = true;
  document.documentElement.classList.add("is-ready");
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.add("is-done");
  // don't leave the overlay's removal depending on a transition completing —
  // if it never fires, the page would sit behind a black screen forever
  setTimeout(() => boot.remove(), 900);
}

new RGBELoader().load(
  "/hdr/studio_small_09_1k.hdr",
  (hdri) => {
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    const prev = scene.environment;
    scene.environment = pmrem.fromEquirectangular(hdri).texture;
    prev?.dispose();
    hdri.dispose();
    sceneReady();
  },
  undefined,
  () => {
    // keep the RoomEnvironment fallback already in place
    console.warn("[AIA-1X] studio HDRI failed to load — using RoomEnvironment fallback");
    sceneReady();
  }
);
// never let a slow/blocked HDRI hold the page hostage
setTimeout(sceneReady, 4000);

// --- low-key studio lighting. The environment map does the fill work, so
// ambient stays near zero; raising it is what flattens a studio look. ---
scene.add(new THREE.AmbientLight(0xffffff, 0.08));

// KEY — dramatic overhead pool, neutral white (tinting it blue turns the
// gunmetal fully blue and kills the neutral-metal read)
const keyLight = new THREE.SpotLight(0xffffff, 3.8, 0, 0.4, 0.92, 0);
keyLight.position.set(-90, 260, 110);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
keyLight.shadow.camera.near = 120;
keyLight.shadow.camera.far = 460;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);
scene.add(keyLight.target);

// RIM — with a near-black body this IS the silhouette. Not optional.
const rimLight = new THREE.DirectionalLight(0x7fa8ff, 2.2);
rimLight.position.set(-55, 30, -240);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(170, 70, 120);
scene.add(fillLight);

// onboard electronics glow
const accentLight = new THREE.PointLight(0x3d7dff, 1, 90, 2);
accentLight.position.set(0, 6, 0);
scene.add(accentLight);

// --- floor: dark and glossy enough to catch a blurred environment reflection,
// faded at the edges so it never shows a hard horizon ---
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x0a0a0c,
  metalness: 0.55,
  roughness: 0.85,
  transparent: true,
  alphaMap: radialFadeTexture(1.0, 0.0),
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -46;
ground.receiveShadow = true;
scene.add(ground);

// soft contact shadow blob directly under the drone
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    alphaMap: radialFadeTexture(1.0, 0.0),
    depthWrite: false,
  })
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = -45.6;
scene.add(contact);

// thin accent ring encircling the drone on the floor (lives in the 3D scene,
// so it follows the COOL rule)
const ring = new THREE.Mesh(
  new THREE.RingGeometry(96, 97.5, 96),
  new THREE.MeshBasicMaterial({ color: 0x3d7dff, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -45.4;
scene.add(ring);

const { group: drone, parts, dynamicWires, stageCount } = createDrone(
  renderer.capabilities.getMaxAnisotropy()
);
drone.traverse((obj) => {
  if (obj.isMesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});
scene.add(drone);

// --- post-processing ---
// Order matters. OutputPass MUST be last: once a composer is in play the
// renderer's own tone mapping and colour-space conversion are bypassed, and
// without it the whole scene renders washed out and wrongly gamma'd.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.35, // strength — only speculars and the emissive trim should cross
  0.6, // radius
  0.8 // threshold
);
composer.addPass(bloom);
composer.addPass(new SMAAPass());
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener("resize", resize);

// Props spin continuously, but only once they've separated from the motors —
// `spinT` is set by updateScene to how far along that part's explosion is.
const spinners = parts.filter((p) => p.spin);
const clock = new THREE.Clock();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;
let canvasVisible = true;

// pointer parallax state, in -0.5..0.5 of the viewport
const pointer = { x: 0, y: 0 };
const parallax = { x: 0, y: 0 };
if (!isTouch) {
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX / window.innerWidth - 0.5;
      pointer.y = e.clientY / window.innerHeight - 0.5;
    },
    { passive: true }
  );
}

function render() {
  requestAnimationFrame(render);
  if (!canvasVisible) return;

  const dt = Math.min(clock.getDelta(), 0.1);

  // ease the scene toward the scroll target rather than snapping to it
  if (!reducedMotion && Math.abs(scrollTarget - scrollCurrent) > 0.0001) {
    scrollCurrent += (scrollTarget - scrollCurrent) * Math.min(1, dt * 6);
    updateScene(scrollCurrent);
  }

  spinners.forEach((p) => {
    if (p.spinT) p.mesh.rotation.y += p.spin * p.spinT * dt;
    // blur ghosts only exist while the blade is actually moving
    const blurring = p.spinT > 0.12 && !reducedMotion;
    if (p.blurVisible !== blurring) {
      p.blurVisible = blurring;
      p.mesh.children.forEach((c) => {
        if (c.userData.isBlur) c.visible = blurring;
      });
    }
  });

  // cursor parallax — heavily damped, so the scene reads as a space
  if (!reducedMotion && !isTouch) {
    parallax.x += (pointer.x - parallax.x) * Math.min(1, dt * 2.5);
    parallax.y += (pointer.y - parallax.y) * Math.min(1, dt * 2.5);
    camera.position.x += parallax.x * 14;
    camera.position.y += parallax.y * 9;
    camera.lookAt(0, 25 + scrollCurrent * 15, 0);
  }
  // drifting reflections across the gunmetal — the strongest "real object" cue
  if (!reducedMotion && !isMobile) scene.environmentRotation.y += 0.02 * dt;

  composer.render();
}

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

// Scroll drives a *target*; the scene eases toward it every frame so the drone
// carries weight instead of snapping. Under reduced motion it tracks directly.
let scrollTarget = 0;
let scrollCurrent = 0;

const nav = document.getElementById("topnav");
const railFill = document.getElementById("rail-fill");

ScrollTrigger.create({
  trigger: "#scroll-scene",
  start: "top top",
  end: "bottom bottom",
  scrub: 0.3,
  onUpdate: (self) => {
    scrollTarget = self.progress;
    if (reducedMotion) {
      scrollCurrent = scrollTarget;
      updateScene(scrollCurrent);
    }
    railFill.style.height = `${self.progress * 100}%`;
  },
});

// --- DOM chrome: nav backdrop, section reveals ---
const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 80);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        revealObserver.unobserve(e.target);
      }
    });
  },
  { rootMargin: "0px 0px -12% 0px" }
);
document.querySelectorAll(".section .section-inner").forEach((el) => {
  el.classList.add("reveal");
  revealObserver.observe(el);
});

// Pause rendering entirely when the canvas is offscreen.
new IntersectionObserver(
  ([entry]) => {
    canvasVisible = entry.isIntersecting;
    if (canvasVisible) clock.getDelta(); // drop the accumulated gap
  },
  { threshold: 0 }
).observe(canvas);

if (import.meta.env.DEV) {
  window.__debug = { scene, camera, renderer, composer, drone, parts, updateScene, THREE };
}

render();
