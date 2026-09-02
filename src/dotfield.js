// ---------------------------------------------------------------------------
// Particle field. Replaces the old CSS-mask dot grid, which could only hide or
// reveal a static pattern — it could never move an individual dot, which is
// the entire point of this version.
//
// Canvas 2D rather than WebGL on purpose: a few thousand 1px rects is nothing
// for canvas 2D, and a second GL context would compete with the drone scene
// for resources on exactly the low-end devices where that hurts most.
// ---------------------------------------------------------------------------

// Every tunable lives here. Also exposed on window.__dotfield in dev, so these
// can be changed live in the console — call __dotfield.rebuild() afterwards if
// you change spacing, dotSize or the alpha values, since those are baked in at
// init; everything else takes effect on the next frame.
export const CONFIG = {
  spacing: 18,
  // Denser grids cost linearly; a phone gets a coarser field rather than a
  // degraded effect, per the brief.
  spacingSmall: 24,
  smallViewport: 768,

  // Drawn side length in CSS px. The brief said "1.0-1.4px radius"; at this
  // magnitude drawing the side equal to that number is what matches the
  // pinpoint look of the reference — treating it as a true radius doubles the
  // dots to 2-2.8px and they stop reading as pinpoints. Raise it here if you
  // want them chunkier.
  dotSize: 1.2,
  dotSizeVariance: 0.2,

  // Rest brightness, randomised per particle at init. Uniform brightness is
  // what makes a grid read as machine-generated.
  baseAlpha: 0.55,
  alphaVariance: 0.2,
  colour: [200, 210, 245],

  // Cursor interaction, layered by distance. FADE < JITTER < REPEL, always:
  // the hole is small and the push is wide.
  REPEL_RADIUS: 150,
  REPEL_STRENGTH: 4.5,
  FADE_RADIUS: 40,
  JITTER_RADIUS: 90,
  JITTER_AMOUNT: 0.35,

  // Return to rest. These are NOT the 0.055 / 0.88 from the brief, and the
  // reason is worth keeping: while the system is underdamped its amplitude
  // decays by sqrt(DAMPING) per frame, independent of SPRING. So DAMPING
  // alone decides how fast the field settles, and raising SPRING to
  // compensate for a high DAMPING cannot help — it only makes the field
  // oscillate faster while dying just as slowly. At 0.055 / 0.88 a 30px
  // displacement takes 933ms to settle, against the 400-600ms the brief asks
  // for. Swept the space for the target feel: 0.10 / 0.75 settles in 400ms
  // with a single 1.1px overshoot, and holds 367-583ms for pushes from 10px
  // to 100px. Lower DAMPING here means quicker, not deader, because SPRING
  // went up to match.
  SPRING: 0.1,
  DAMPING: 0.75,

  cursorLerp: 0.15,
  // Alpha multiplier at the viewport centre; edges stay at 1. Should be felt
  // as depth, never identifiable as a gradient.
  centreFalloff: 0.75,

  // Baked into each home position so the grid is ordered but not perfect.
  homeJitter: 1.5,

  restEpsilon: 0.01,
  alphaBuckets: 10,
  maxDpr: 2,
};

const PARKED = -9999;

export function initDotField(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(hover: none)");

  // Structure-of-arrays rather than an array of objects: this loop touches
  // every particle every frame, and flat typed arrays keep it in cache.
  let count = 0;
  let homeX, homeY, x, y, vx, vy, restAlpha, size;

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;

  // raw cursor from the event, smoothed cursor used by the physics
  let rawX = PARKED;
  let rawY = PARKED;
  let curX = PARKED;
  let curY = PARKED;

  let running = false;
  let rafId = 0;
  let asleep = false;

  // Bucket lists hold particle indices. Allocated once and truncated by
  // setting .length = 0, so a steady-state frame allocates nothing.
  const buckets = [];
  for (let i = 0; i < CONFIG.alphaBuckets; i++) buckets.push([]);

  // A viewport can measure 0x0 — a background or prerendered tab, or a pane
  // that has not been shown yet. Building then yields a one-particle grid at a
  // zero-size canvas that never recovers, so refuse to build and retry instead.
  let needsBuild = true;

  function build() {
    cssW = window.innerWidth || document.documentElement.clientWidth;
    cssH = window.innerHeight || document.documentElement.clientHeight;
    if (cssW < 1 || cssH < 1) {
      needsBuild = true;
      return false;
    }
    needsBuild = false;
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const spacing =
      cssW < CONFIG.smallViewport ? CONFIG.spacingSmall : CONFIG.spacing;
    const cols = Math.ceil(cssW / spacing) + 1;
    const rows = Math.ceil(cssH / spacing) + 1;
    count = cols * rows;

    homeX = new Float32Array(count);
    homeY = new Float32Array(count);
    x = new Float32Array(count);
    y = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    restAlpha = new Float32Array(count);
    size = new Float32Array(count);

    // Centre falloff is a function of the home position only, so it is folded
    // into restAlpha once here rather than recomputed per frame.
    const cx = cssW / 2;
    const cy = cssH / 2;
    const maxDist = Math.hypot(cx, cy) || 1;
    const jitter = CONFIG.homeJitter;
    const aMin = CONFIG.baseAlpha - CONFIG.alphaVariance;
    const aSpan = CONFIG.alphaVariance * 2;
    const sMin = CONFIG.dotSize - CONFIG.dotSizeVariance;
    const sSpan = CONFIG.dotSizeVariance * 2;

    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const hx = c * spacing + (Math.random() - 0.5) * 2 * jitter;
        const hy = r * spacing + (Math.random() - 0.5) * 2 * jitter;
        homeX[i] = hx;
        homeY[i] = hy;
        x[i] = hx;
        y[i] = hy;
        const t = Math.min(1, Math.hypot(hx - cx, hy - cy) / maxDist);
        const depth = CONFIG.centreFalloff + (1 - CONFIG.centreFalloff) * t;
        restAlpha[i] = (aMin + Math.random() * aSpan) * depth;
        size[i] = sMin + Math.random() * sSpan;
      }
    }
    return true;
  }

  // devicePixelRatio changes when a window moves between displays, and reads
  // as 1 on a tab that has not been shown. Either way the canvas would be
  // rasterised at the wrong density and the dots would look soft.
  function dprStale() {
    return Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr) !== dpr;
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);

    const n = CONFIG.alphaBuckets;
    for (let b = 0; b < n; b++) buckets[b].length = 0;

    const fadeR = CONFIG.FADE_RADIUS;
    const fadeR2 = fadeR * fadeR;

    for (let i = 0; i < count; i++) {
      let a = restAlpha[i];
      // Fade toward zero directly under the cursor. Squared compare first so
      // the sqrt only runs for the handful of particles inside the hole.
      const dx = x[i] - curX;
      const dy = y[i] - curY;
      const d2 = dx * dx + dy * dy;
      if (d2 < fadeR2) a *= Math.sqrt(d2) / fadeR;
      if (a <= 0.005) continue;
      const b = a >= 1 ? n - 1 : (a * n) | 0;
      buckets[b].push(i);
    }

    const [cr, cg, cb] = CONFIG.colour;
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    for (let b = 0; b < n; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      // One globalAlpha write per bucket instead of one per particle: setting
      // it thousands of times a frame is the dominant cost in a field this
      // size, far more than the fills themselves.
      ctx.globalAlpha = (b + 0.5) / n;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        const s = size[i];
        ctx.fillRect(x[i] - s * 0.5, y[i] - s * 0.5, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function step() {
    const lerp = CONFIG.cursorLerp;
    // Snap rather than crawl when the cursor is parked, so leaving the window
    // does not drag a phantom pointer across the field on the way out.
    if (rawX === PARKED) {
      curX = PARKED;
      curY = PARKED;
    } else {
      curX += (rawX - curX) * lerp;
      curY += (rawY - curY) * lerp;
    }

    const repelR = CONFIG.REPEL_RADIUS;
    const repelR2 = repelR * repelR;
    const jitterR = CONFIG.JITTER_RADIUS;
    const jitterR2 = jitterR * jitterR;
    const strength = CONFIG.REPEL_STRENGTH;
    const amount = CONFIG.JITTER_AMOUNT;
    const spring = CONFIG.SPRING;
    const damping = CONFIG.DAMPING;
    const eps = CONFIG.restEpsilon;
    const eps2 = eps * eps;

    let moving = false;

    for (let i = 0; i < count; i++) {
      const dxHome = homeX[i] - x[i];
      const dyHome = homeY[i] - y[i];
      let ivx = vx[i];
      let ivy = vy[i];

      const dx = x[i] - curX;
      const dy = y[i] - curY;
      const d2 = dx * dx + dy * dy;

      // Most of the field is idle most of the time. A particle that is at
      // home, still, and out of reach of the cursor needs no work at all.
      if (
        d2 > repelR2 &&
        ivx * ivx + ivy * ivy < eps2 &&
        dxHome * dxHome + dyHome * dyHome < eps2
      ) {
        continue;
      }

      if (d2 < repelR2) {
        // Clamp: the cursor can land exactly on a particle, and normalising a
        // zero vector gives NaN that then poisons the position permanently.
        const d = Math.max(1, Math.sqrt(d2));
        const falloff = 1 - d / repelR;
        // Squared, not linear. Linear falloff draws a hard-edged circle of
        // displacement; squared fades out at the rim and reads as a bulge.
        const force = falloff * falloff * strength;
        ivx += (dx / d) * force;
        ivy += (dy / d) * force;

        if (d2 < jitterR2) {
          const proximity = 1 - d / jitterR;
          ivx += (Math.random() - 0.5) * amount * proximity;
          ivy += (Math.random() - 0.5) * amount * proximity;
        }
      }

      ivx = (ivx + dxHome * spring) * damping;
      ivy = (ivy + dyHome * spring) * damping;

      x[i] += ivx;
      y[i] += ivy;
      vx[i] = ivx;
      vy[i] = ivy;

      // Displacement counts as movement, not just velocity. Every particle
      // shares one spring constant, so they reach the top of the swing in
      // phase — at that instant velocity is ~0 across the whole field while
      // it is still visibly displaced. Testing velocity alone would let the
      // loop fall asleep there and freeze the field mid-bulge.
      const rx = homeX[i] - x[i];
      const ry = homeY[i] - y[i];
      if (ivx * ivx + ivy * ivy > eps2 || rx * rx + ry * ry > eps2) moving = true;
    }

    return moving;
  }

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    if (needsBuild || dprStale()) {
      if (!build()) return; // still no viewport; try again next frame
      asleep = false;
    }

    const cursorSettled =
      rawX === PARKED
        ? curX === PARKED
        : Math.abs(rawX - curX) < 0.1 && Math.abs(rawY - curY) < 0.1;
    const cursorLive = rawX !== PARKED;

    // Sleep when there is genuinely nothing to change. A static field costs
    // nothing to leave on screen — skipping the frame means not clearing and
    // not redrawing, which is the only way "idle" actually reaches zero.
    if (asleep && cursorSettled && !cursorLive) return;

    const moving = step();
    draw();

    asleep = !moving && cursorSettled && !cursorLive;
  }

  function wake() {
    asleep = false;
  }

  function drawStaticOnce() {
    curX = PARKED;
    curY = PARKED;
    draw();
  }

  // --- events ---
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!build()) return;
      if (interactive()) wake();
      else drawStaticOnce();
    }, 150);
  }

  function onPointerMove(e) {
    // Store raw coordinates only. Pointer events fire faster than frames, and
    // running the physics here would do the same work several times per frame.
    rawX = e.clientX;
    rawY = e.clientY;
    wake();
  }

  function onPointerLeave() {
    rawX = PARKED;
    rawY = PARKED;
    wake();
  }

  function interactive() {
    return !reducedMotion.matches && !coarsePointer.matches;
  }

  function start() {
    build();

    if (!interactive()) {
      // Reduced motion, or a touch device: draw the field once and stop. No
      // loop, no listeners, nothing to animate. The only reason a frame is
      // requested at all here is to wait for a viewport to exist; the moment
      // one does, this draws a single time and stops for good.
      const paintWhenReady = () => {
        if (needsBuild && !build()) {
          rafId = requestAnimationFrame(paintWhenReady);
          return;
        }
        drawStaticOnce();
      };
      paintWhenReady();
      window.addEventListener("resize", onResize, { passive: true });
      return;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    document.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) onPointerLeave();
    });
    window.addEventListener("blur", onPointerLeave);
    window.addEventListener("resize", onResize, { passive: true });

    running = true;
    rafId = requestAnimationFrame(frame);
  }

  // Re-evaluate if the user flips the OS motion setting mid-session.
  const onMotionChange = () => {
    stop();
    start();
  };
  reducedMotion.addEventListener?.("change", onMotionChange);

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    clearTimeout(resizeTimer);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("blur", onPointerLeave);
    window.removeEventListener("resize", onResize);
  }

  start();

  return {
    config: CONFIG,
    rebuild() {
      build();
      wake();
    },
    wake,
    stop,
    get particleCount() {
      return count;
    },
    // used by the perf harness to time a frame in isolation
    _step: step,
    _draw: draw,
    _setCursor(px, py) {
      rawX = px;
      rawY = py;
      curX = px;
      curY = py;
    },
  };
}
