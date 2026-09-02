import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createDrone, updateDynamicWires } from "./drone.js";

// Everything WebGL lives here so main.js can decide whether to load it at all.
// A browser without WebGL never downloads three.js.
export function initScene() {

  gsap.registerPlugin(ScrollTrigger);

  const canvas = document.getElementById("drone-canvas");
  const scene = new THREE.Scene();

  // Radial gradient generated at runtime — used to fade the floor out at its
  // edges and to fake a soft contact shadow, so neither ships as an image.
  // The floor plane is 900 units across. At the old 256px this was ~3.5 world
  // units per texel with anisotropy 1, which is what made the light pool look
  // pixelated. Resolution and anisotropy both matter here.
  const FADE_TEX_SIZE = 2048;
  function radialFadeTexture(inner = 1, outer = 0) {
    const c = document.createElement("canvas");
    c.width = c.height = FADE_TEX_SIZE;
    const ctx = c.getContext("2d");
    const half = FADE_TEX_SIZE / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, `rgba(255,255,255,${inner})`);
    g.addColorStop(0.55, `rgba(255,255,255,${inner * 0.55})`);
    g.addColorStop(1, `rgba(255,255,255,${outer})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FADE_TEX_SIZE, FADE_TEX_SIZE);
    const t = new THREE.CanvasTexture(c);
    // alphaMap is data, not colour — tagging it sRGB would gamma-shift the fade
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
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
  // PCFSoftShadowMap is deprecated here and silently downgrades to PCF, which
  // is what the page was really rendering. VSM replaces it without a warning.
  // Measured, so nobody re-tunes this on a hunch: PCF vs VSM is 4653 vs 4685
  // hard-edge pixels over the floor - visually identical, because the softness
  // you see comes from the ground alphaMap and the contact blob, not the
  // shadow filter. shadow.radius does nothing either (radius 8 moves it 4%).
  // shadow.bias MUST stay negative: at bias 0 the battery top self-shadows
  // into a moire (high-frequency energy 0.99 -> 4.05).
  renderer.shadowMap.type = THREE.VSMShadowMap;
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

  new HDRLoader().load(
    // string literals in JS are not base-rewritten by Vite the way HTML
    // attributes are, so this must be built from BASE_URL or it 404s on a
    // GitHub Pages project URL
    `${import.meta.env.BASE_URL}hdr/studio_small_09_1k.hdr`,
    (hdri) => {
      hdri.mapping = THREE.EquirectangularReflectionMapping;
      const prev = scene.environment;
      scene.environment = pmrem.fromEquirectangular(hdri).texture;
      prev?.dispose();
      hdri.dispose();
      invalidate();
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
  // At y=30 this sat level with the motor top caps and mirrored straight off
  // them, which is what produced the blue lamps - not bloom, and not the
  // chamfers. Dropping it below the drone makes it graze the silhouette
  // instead of glinting off the cans: measured blue-hotspot pixels 500 -> 178.
  const rimLight = new THREE.DirectionalLight(0x7fa8ff, 2.6);
  rimLight.position.set(-55, -4, -255);
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
    new THREE.RingGeometry(60, 61.1, 256),
    new THREE.MeshBasicMaterial({
      color: 0x3d7dff,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -45.4;
  scene.add(ring);

  const { group: drone, parts, dynamicWires, textures, stageCount } = createDrone(
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
  window.addEventListener("resize", () => { resize(); invalidate(); });

  // Props spin continuously, but only once they've separated from the motors —
  // `spinT` is set by updateScene to how far along that part's explosion is.
  const spinners = parts.filter((p) => p.spin);
  spinners.forEach((p, i) => {
    p.angle = 0;
    p.lastAngle = 0;
    // a phase offset per prop so the four never sit at identical angles
    p.phase = i * 0.55;
  });

  // Roughly 1.75 revolutions across a full page scroll — a deliberate turn you
  // can follow, not a blur.
  const PROP_TURNS_PER_PAGE = 1.75;
  const PROP_SCROLL_K = PROP_TURNS_PER_PAGE * Math.PI * 2;
  // THREE.Clock is deprecated and THREE.Timer is not shipped in this version,
  // so track delta directly rather than adding a dependency for it.
  let lastFrameTime = performance.now();
  const getDelta = () => {
    const now = performance.now();
    const d = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    return d;
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none)").matches;
  let canvasVisible = true;

  // pointer parallax state, in -0.5..0.5 of the viewport
  const pointer = { x: 0, y: 0 };
  const parallax = { x: 0, y: 0 };
  // The scroll orbit writes here; the camera's real position is this plus the
  // clamped parallax offset, resolved fresh every frame.
  const baseCameraPos = new THREE.Vector3(0, 55, 260);
  const lookTarget = new THREE.Vector3(0, 25, 0);
  // ~2 degrees of drift at the scene's working camera distance
  const PARALLAX_MAX_X = 9;
  const PARALLAX_MAX_Y = 6;
  const PARALLAX_EASE = 0.06;
  const parallaxEnabled = !reducedMotion && !isTouch;
  if (!isTouch) {
    window.addEventListener(
      "pointermove",
      (e) => {
        pointer.x = e.clientX / window.innerWidth - 0.5;
        pointer.y = e.clientY / window.innerHeight - 0.5;
      invalidate();
      },
      { passive: true }
    );
  }

  // --- render on demand -------------------------------------------------
  // Now that the props no longer turn on their own, nothing animates
  // continuously except the environment rotation and settling. Anything that
  // changes the image calls invalidate().
  //
  // The environment drift is the catch: it never stops, so on desktop it used
  // to defeat this gate entirely and the page rendered at full display rate
  // forever. At 0.02 rad/s it does not need a frame every 7ms on a 144Hz
  // panel, so env-only frames are throttled to ~24fps. The drift itself is
  // unchanged — the elapsed time is banked and applied whole on the frames
  // that do render, so the speed does not depend on the frame rate.
  const ENV_IDLE_INTERVAL = 1 / 24;
  let envIdleAccum = 0;
  let envDt = 0;
  let needsRender = true;
  // Counts frames actually pushed through the composer, which is the only
  // number worth reporting: rAF ticks at display rate whether or not the
  // picture changed, so an rAF-only meter reads 60 on a still image.
  let drawCount = 0;
  const invalidate = () => {
    needsRender = true;
  };
  const envRotates = !reducedMotion && !isMobile;

  function render() {
    requestAnimationFrame(render);
    if (!canvasVisible) return;

    const dt = Math.min(getDelta(), 0.1);

    const settlingScroll = Math.abs(scrollTarget - scrollCurrent) > 0.0001;
    const settlingParallax =
      parallaxEnabled &&
      (Math.abs(pointer.x - parallax.x) > 0.001 || Math.abs(pointer.y - parallax.y) > 0.001);
    const settlingProps = spinners.some((p) => Math.abs(p.angle - p.lastAngle) > 0.0005);

    envDt += dt;

    const busy = needsRender || settlingScroll || settlingParallax || settlingProps;
    if (!busy) {
      if (!envRotates) return;
      envIdleAccum += dt;
      if (envIdleAccum < ENV_IDLE_INTERVAL) return;
      envIdleAccum = 0;
    } else {
      envIdleAccum = 0;
    }
    needsRender = false;

    // ease the scene toward the scroll target rather than snapping to it
    if (!reducedMotion && Math.abs(scrollTarget - scrollCurrent) > 0.0001) {
      scrollCurrent += (scrollTarget - scrollCurrent) * Math.min(1, dt * 6);
      updateScene(scrollCurrent);
    }

    // Props never turn on their own. The angle is derived from scroll position
    // rather than accumulated over time, which is what makes scrolling back up
    // wind them back rather than drifting out of sync. The displayed angle
    // eases toward that target, so a sudden scroll stop coasts a fraction of a
    // turn before settling — inertia, not freewheeling.
    spinners.forEach((p) => {
      if (reducedMotion) {
        p.mesh.rotation.y = p.phase;
        return;
      }
      // props keep turning a little as they lift away at the end
      const residual = Math.max(0, scrollCurrent - 0.85) * Math.PI * 1.6;
      const target = Math.sign(p.spin) * (scrollCurrent * PROP_SCROLL_K + residual) + p.phase;
      p.lastAngle = p.angle;
      p.angle += (target - p.angle) * Math.min(1, dt * 3.2);
      p.mesh.rotation.y = p.angle;
    });

    // Cursor parallax. The scroll system owns the camera's base position; this is
    // only ever an offset applied on top of it, recomputed absolutely each frame.
    // It must never accumulate onto camera.position — doing so compounds every
    // frame while the page is still and walks the camera out of the scene.
    if (parallaxEnabled) {
      parallax.x += (pointer.x - parallax.x) * PARALLAX_EASE;
      parallax.y += (pointer.y - parallax.y) * PARALLAX_EASE;
    }
    camera.position.set(
      baseCameraPos.x + THREE.MathUtils.clamp(parallax.x * 2 * PARALLAX_MAX_X, -PARALLAX_MAX_X, PARALLAX_MAX_X),
      baseCameraPos.y + THREE.MathUtils.clamp(parallax.y * 2 * PARALLAX_MAX_Y, -PARALLAX_MAX_Y, PARALLAX_MAX_Y),
      baseCameraPos.z
    );
    camera.lookAt(lookTarget);
    // drifting reflections across the gunmetal — the strongest "real object" cue
    // envDt, not dt: this frame may be standing in for several skipped ones
    if (envRotates) scene.environmentRotation.y += 0.02 * envDt;
    envDt = 0;

    composer.render();
    drawCount++;
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

    // the blob does not track the silhouette, so rather than lie about a shape
    // it no longer has, it fades and tightens as the drone comes apart
    contact.material.opacity = 0.55 * (1 - Math.min(1, progress * 1.6));
    const cs = 1 - progress * 0.35;
    contact.scale.set(cs, cs, 1);

    drone.rotation.y = progress * Math.PI * 1.1;

    // writes the BASE camera position only — parallax is layered on in render()
    const camAngle = progress * Math.PI * 0.7;
    const radius = 196 + progress * 250;
    baseCameraPos.set(
      Math.sin(camAngle) * radius,
      34 + progress * 150,
      Math.cos(camAngle) * radius
    );
    // aim lower so the drone lifts in frame and its feet clear the bottom edge
    lookTarget.set(0, 11 + progress * 20, 0);

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
      invalidate();
      if (reducedMotion) {
        scrollCurrent = scrollTarget;
        updateScene(scrollCurrent);
      }
      railFill.style.height = `${self.progress * 100}%`;
    },
  });

  // Pause rendering entirely when the canvas is offscreen.
  // --- keyboard route through the exploded view -------------------------
  // Without this the entire demo is scroll-gated. Stepping scrolls the page to
  // the middle of each stage window, so keyboard and scroll drive one system
  // rather than two that can disagree.
  (function stageControls() {
    const prev = document.getElementById("stage-prev");
    const next = document.getElementById("stage-next");
    const now = document.getElementById("stage-now");
    const live = document.getElementById("stage-live");
    const section = document.getElementById("scroll-scene");
    if (!prev || !next || !section) return;

    const stageOf = (p) => Math.min(stageCount - 1, Math.floor(p * stageCount));

    function goTo(stage) {
      const s = Math.max(0, Math.min(stageCount - 1, stage));
      const mid = (s + 0.5) / stageCount;
      const top = section.offsetTop;
      const range = section.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + range * mid, behavior: "smooth" });
      announce(s);
    }

    function announce(s) {
      if (now) now.textContent = String(s + 1);
      const cap = document.querySelector(`.caption[data-stage="${s}"]`);
      if (live && cap) {
        const h = cap.querySelector("h1, h2");
        live.textContent = `Stage ${s + 1} of ${stageCount}: ${h ? h.textContent.trim() : ""}`;
      }
    }

    prev.addEventListener("click", () => goTo(stageOf(scrollTarget) - 1));
    next.addEventListener("click", () => goTo(stageOf(scrollTarget) + 1));

    // arrows / PageUp / PageDown once anything in the scene region has focus
    section.addEventListener("keydown", (e) => {
      const back = ["ArrowLeft", "ArrowUp", "PageUp"];
      const fwd = ["ArrowRight", "ArrowDown", "PageDown"];
      if (!back.includes(e.key) && !fwd.includes(e.key)) return;
      e.preventDefault();
      goTo(stageOf(scrollTarget) + (fwd.includes(e.key) ? 1 : -1));
    });

    canvas.tabIndex = 0;
    announce(0);
    // keep the readout honest when the user scrolls instead of stepping
    let lastStage = 0;
    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const s = stageOf(self.progress);
        if (s !== lastStage) {
          lastStage = s;
          announce(s);
        }
      },
    });
  })();

  new IntersectionObserver(
    ([entry]) => {
      canvasVisible = entry.isIntersecting;
      if (canvasVisible) getDelta(); // drop the accumulated gap
    },
    { threshold: 0 }
  ).observe(canvas);

  if (import.meta.env.DEV) {
    window.__debug = { scene, camera, renderer, composer, drone, parts, updateScene, THREE };
  }



  render();
  return {
    drawsSoFar: () => drawCount,
    dispose() {
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) v.dispose();
          });
          m.dispose();
        });
      });
      textures.forEach((t) => t.dispose());
      scene.environment?.dispose();
      pmrem.dispose();
      composer.dispose?.();
      renderer.dispose();
    },
  };
}
