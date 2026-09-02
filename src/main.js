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
// Three numbers, because they mean different things.
//
// "draws" is frames the 3D scene actually rendered. The page idles at a low
// number on purpose — at rest only the environment drift redraws, throttled to
// ~24fps, and on mobile not even that — so a small figure while sitting still
// is correct, not a stall.
//
// "worst" is the longest frame gap in the last window. It resets constantly,
// so read it while moving.
//
// "scroll peak" is the one to report: the longest gap on a frame that actually
// drew something, kept for the whole visit. It answers "did scrolling ever
// stutter" without needing to be read at the right instant.
//
// Both peaks ignore gaps over half a second. A tab switch, a sleep, or the
// initial load reads as a multi-second gap that is not a stutter — a real
// measurement came back with a 37-second "peak", which made the only
// persistent number worthless.
const REAL_FRAME_LIMIT_MS = 500;

function startFpsMeter(handle) {
  const el = document.createElement("div");
  el.className = "fpsmeter";
  el.setAttribute("role", "status");
  document.body.appendChild(el);

  const drawsNow = () => handle?.drawsSoFar?.() ?? 0;

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;
  let lastDraws = drawsNow();
  let lastTickDraws = lastDraws;
  let scrollPeak = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    const gap = now - last;
    last = now;
    frames++;

    const draws = drawsNow();
    const drew = draws > lastTickDraws;
    lastTickDraws = draws;

    const credible = gap < REAL_FRAME_LIMIT_MS && !document.hidden;
    if (credible) {
      if (gap > worst) worst = gap;
      if (drew && gap > scrollPeak) scrollPeak = gap;
    }

    const elapsed = now - windowStart;
    if (elapsed < 500) return;

    const rafFps = Math.round((frames * 1000) / elapsed);
    const drawFps = Math.round(((draws - lastDraws) * 1000) / elapsed);

    el.textContent =
      `${rafFps} fps · ${drawFps} draws/s · worst ${worst.toFixed(1)}ms · ` +
      `scroll peak ${scrollPeak.toFixed(1)}ms`;
    el.dataset.health = scrollPeak > 50 ? "bad" : scrollPeak > 22 ? "warn" : "ok";

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
