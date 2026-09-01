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

function showFallback() {
  if (canvas) canvas.hidden = true;
  if (fallback) fallback.hidden = false;
  // the boot overlay must never strand the page behind a black screen
  document.documentElement.classList.add("is-ready");
  const boot = document.getElementById("boot");
  if (boot) {
    boot.classList.add("is-done");
    setTimeout(() => boot.remove(), 900);
  }
}

let scene = null;

async function start() {
  if (!supportsWebGL()) {
    showFallback();
    return;
  }
  try {
    const { initScene } = await import("./scene.js");
    scene = initScene();
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
  if (fallback) fallback.hidden = true;
  if (canvas) canvas.hidden = false;
  start();
});

start();
