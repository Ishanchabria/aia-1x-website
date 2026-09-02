import "./style.css";

// ---------------------------------------------------------------------------
// Entry point. Page chrome works with or without WebGL; the 3D scene is loaded
// dynamically so a browser that can't run it never downloads three.js at all.
// ---------------------------------------------------------------------------

// --- DOM chrome: nav backdrop, section reveals ---
const nav = document.getElementById("topnav");
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

// --- cursor-reactive dot grid ---
// Flip to brighten the dots around the cursor instead of clearing them.
const DOT_MASK_INVERT = false;

(function dotGrid() {
  const grid = document.getElementById("dotgrid");
  if (!grid) return;
  if (DOT_MASK_INVERT) grid.classList.add("is-inverted");
  // no pointer to follow, or motion is unwanted: leave the plain dot field
  if (window.matchMedia("(hover: none)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight * 0.4;
  let cx = tx;
  let cy = ty;
  let queued = false;

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(step);
  }

  // One style write per frame at most — never one per pointer event — and
  // lerped so the hole trails the cursor with a little weight.
  function step() {
    queued = false;
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    grid.style.setProperty("--mx", `${cx.toFixed(1)}px`);
    grid.style.setProperty("--my", `${cy.toFixed(1)}px`);
    if (Math.abs(tx - cx) > 0.5 || Math.abs(ty - cy) > 0.5) schedule();
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      schedule();
    },
    { passive: true }
  );
  step();
})();

// --- WebGL support ---
function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const canvas = document.getElementById("drone-canvas");
const fallback = document.getElementById("gl-fallback");

// Single source of truth: 'live' | 'fallback'. CSS keys off this, so the canvas
// and the fallback can never both be visible.
function setGLState(state) {
  document.documentElement.dataset.gl = state;
  if (state === "fallback" && fallback) {
    // set from BASE_URL rather than a literal: Vite only rewrites public paths
    // it can resolve at build time, and this image is generated later
    const img = fallback.querySelector("img");
    if (img && !img.src) img.src = `${import.meta.env.BASE_URL}drone-fallback.webp`;
  }
}

function showFallback() {
  setGLState("fallback");
  // the boot overlay must never strand the page behind a black screen
  document.documentElement.classList.add("is-ready");
  const boot = document.getElementById("boot");
  if (boot) {
    boot.classList.add("is-done");
    setTimeout(() => boot.remove(), 900);
  }
}

let scene = null;

// --- ?fps readout ---------------------------------------------------------
// Add ?fps to the URL for an on-page meter. This exists because framerate can
// only honestly be measured on a real machine, and typing a URL is easier than
// getting a paste past Chrome's console protection.
//
// Two numbers, because they mean different things. "draws" is frames the 3D
// scene actually rendered — the page idles at zero on purpose when nothing has
// changed, so a low draws figure while sitting still is correct, not a stall.
// "worst" is the longest gap between animation frames in the last second; that
// is the one that shows up as a stutter.
function startFpsMeter(handle) {
  const el = document.createElement("div");
  el.className = "fpsmeter";
  el.setAttribute("role", "status");
  document.body.appendChild(el);

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;
  let lastDraws = handle?.drawsSoFar?.() ?? 0;
  let sessionWorst = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    const gap = now - last;
    last = now;
    frames++;
    if (gap > worst) worst = gap;

    const elapsed = now - windowStart;
    if (elapsed < 500) return;

    const draws = handle?.drawsSoFar?.() ?? 0;
    const rafFps = Math.round((frames * 1000) / elapsed);
    const drawFps = Math.round(((draws - lastDraws) * 1000) / elapsed);
    if (worst > sessionWorst) sessionWorst = worst;

    el.textContent = `${rafFps} fps · ${drawFps} draws/s · worst ${worst.toFixed(
      1
    )}ms (peak ${sessionWorst.toFixed(1)}ms)`;
    el.dataset.health = sessionWorst > 50 ? "bad" : sessionWorst > 22 ? "warn" : "ok";

    frames = 0;
    worst = 0;
    windowStart = now;
    lastDraws = draws;
  }
  requestAnimationFrame(tick);
}

async function start() {
  if (!supportsWebGL()) {
    showFallback();
    return;
  }
  try {
    const { initScene } = await import("./scene.js");
    scene = initScene();
    setGLState("live");
    if (new URLSearchParams(location.search).has("fps")) startFpsMeter(scene);
  } catch (err) {
    console.error("[AIA-1X] 3D scene failed to initialise", err);
    showFallback();
  }
}

// A lost context leaves a frozen or blank canvas, so swap in the same fallback
// and pick the scene back up if the browser restores it.
canvas?.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  scene?.dispose?.();
  scene = null;
  showFallback();
});

canvas?.addEventListener("webglcontextrestored", () => {
  setGLState("live");
  start();
});

start();
