import "./style.css";
import { initDotField } from "./dotfield.js";

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

const params = new URLSearchParams(location.search);

// ?plain strips the three painted background layers — the aurora and its
// blur(120px), the dot grid's full-viewport mask, and the grain — leaving the
// canvas and the type. Paired with ?fps it answers "is the stutter the WebGL
// or is it the CSS" in one run, which is not something I can profile from a
// development machine.
if (params.has("plain")) document.documentElement.dataset.fx = "off";

// --- cursor-reactive particle field ---
// Real particles on a canvas, not a CSS mask: the dots are pushed around by
// the cursor and spring back, which a mask fundamentally cannot do.
(function dotField() {
  const canvas = document.getElementById("dotfield");
  if (!canvas || params.has("plain")) return;
  const field = initDotField(canvas);
  if (import.meta.env.DEV && field) window.__dotfield = field;
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

// A peak on its own says a stutter happened but not why, and I have guessed
// wrong about the cause more than once. So the worst frame carries a tag: what
// the page was doing at the moment it happened. `resize` is the interesting
// one on a phone — hiding the address bar mid-scroll fires it, and the handler
// reallocates every render target.
function startFpsMeter(handle) {
  const el = document.createElement("div");
  el.className = "fpsmeter";
  el.setAttribute("role", "status");
  document.body.appendChild(el);

  const drawsNow = () => handle?.drawsSoFar?.() ?? 0;

  let lastResize = -Infinity;
  let lastPointer = -Infinity;
  addEventListener("resize", () => (lastResize = performance.now()), { passive: true });
  addEventListener("pointermove", () => (lastPointer = performance.now()), { passive: true });

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;
  let firstDrawAt = 0;
  let lastDraws = drawsNow();
  let lastTickDraws = lastDraws;
  let scrollPeak = 0;
  let peakTag = "";

  function tick(now) {
    requestAnimationFrame(tick);
    const gap = now - last;
    last = now;
    frames++;

    const draws = drawsNow();
    const drew = draws > lastTickDraws;
    lastTickDraws = draws;
    if (drew && !firstDrawAt) firstDrawAt = now;

    const credible = gap < REAL_FRAME_LIMIT_MS && !document.hidden;
    if (credible) {
      if (gap > worst) worst = gap;
      if (drew && gap > scrollPeak) {
        scrollPeak = gap;
        const since = (now - firstDrawAt) / 1000;
        // Measure the window from the START of the frame, not the end. A long
        // stutter is exactly when an event lands mid-frame, and comparing
        // against `now` would push the thing that caused it out of range.
        const frameStart = now - gap;
        const causes = [];
        if (lastResize > frameStart - 400) causes.push("resize");
        if (lastPointer > frameStart - 120) causes.push("pointer");
        if (since < 2) causes.push("load");
        peakTag = `@${since.toFixed(1)}s${causes.length ? " " + causes.join("+") : ""}`;
      }
    }

    const elapsed = now - windowStart;
    if (elapsed < 500) return;

    const rafFps = Math.round((frames * 1000) / elapsed);
    const drawFps = Math.round(((draws - lastDraws) * 1000) / elapsed);

    el.textContent =
      `${rafFps} fps · ${drawFps} draws/s · worst ${worst.toFixed(1)}ms · ` +
      `peak ${scrollPeak.toFixed(0)}ms ${peakTag}`;
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
    if (params.has("fps")) startFpsMeter(scene);
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
