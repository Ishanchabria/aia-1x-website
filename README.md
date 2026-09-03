# AIA-1X

Site for the AIA-1X: a hand-built, self-programmed ESP32 micro-quadcopter.

**Live:** https://ishanchabria.github.io/aia-1x-website/

The page is a scroll-driven exploded view. A procedural 3D model of the drone
stays pinned while scroll position drives a seven-stage disassembly, with
captions, a telemetry-style readout and a progress rail alongside it.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
```

The Claude Code browser pane reads `.claude/launch.json`, which is gitignored
because it can contain machine-specific paths. Copy the template to create it:

```bash
cp .claude/launch.example.json .claude/launch.json
```

## Layout

| Path | What it is |
|---|---|
| `src/main.js` | Entry point. Page chrome, WebGL detection, dot grid. Loads the scene dynamically so a browser without WebGL never downloads three.js. |
| `src/scene.js` | Everything WebGL: renderer, environment, lighting, post-processing, scroll wiring, keyboard stage controls. |
| `src/drone.js` | The procedural model. 1 unit = 1mm, so the drone is genuinely 100mm motor-to-motor. |
| `src/esp32.js` | The ESP32 DevKit board, rebuilt from reference photography. Own geometry, texture set and material palette; ~3,300 triangles. |
| `src/dotfield.js` | The cursor-reactive particle field. Canvas 2D, ~6,600 particles at 1080p, with every tunable in one `CONFIG` object at the top. |
| `src/style.css` | All page styling, including the aurora. |
| `public/parts/cut/` | Part photos with backgrounds removed. |
| `public/hdr/` | Studio HDRI used for the environment map. |

## Measuring performance

Append `?fps` to any URL — dev server or the live site — for an on-page meter:

```
75 fps · 20 draws/s · worst 13.4ms · peak 168ms @2.3s resize
```

- **fps** — animation frames per second, i.e. your display's refresh rate.
- **draws/s** — frames the 3D scene actually rendered, which is not the same
  thing. The page stops redrawing when nothing has changed; at rest only the
  environment drift redraws, throttled to ~24fps, and on mobile not even that.
  A small number while sitting still is the render-on-demand loop working.
- **worst** — longest frame gap in the last window. Resets constantly, so read
  it while moving.
- **peak** — longest gap on a frame that actually drew, kept for the whole
  visit, with a tag saying how far in it happened and whether a `resize`,
  `pointer` move or the `load` coincided with it. Gaps over 500ms and anything
  while the tab is hidden are discarded, so backgrounding the tab does not
  poison the reading.

Add `?plain` alongside it to strip the painted background layers — the aurora
and its 120px blur, the dot grid's full-viewport mask, the grain. Comparing
`?fps` against `?fps&plain` separates WebGL cost from CSS cost.

## The particle field

`src/dotfield.js`. Real particles with positions and velocities on a canvas,
not a CSS mask — a mask can only hide or reveal a static pattern, and these
dots have to move individually.

Three cursor effects layered by distance, and the layering is the point: a
40px hole fades out directly under the pointer, a 90px radius gets a faint
random jitter, and a 150px radius is pushed outward with a **squared** falloff.
Linear falloff draws a visible hard-edged circle; squared reads as a soft
bulge. Measured density around the cursor, per 1000px of ring area: cleared to
zero inside 40px, still depleted at 40-60px, piled up from 11 to 15 at
100-120px, and exactly unchanged past 150px. Matter is conserved — the dots
are displaced, not erased.

Everything tunable lives in one `CONFIG` object at the top of the module, and
in dev it is on `window.__dotfield` — change values in the console, then call
`__dotfield.rebuild()` if you touched spacing, size or alpha.

The page background behind it is true `#000`. That is not decoration: at
`#08080a`, let alone the `#131318` studio pool that used to sit here, dim dots
read as grey static instead of a star field.

Cost, measured, per frame with the cursor active:

| viewport | spacing | particles | ms/frame | of a 60fps budget |
|---|---|---|---|---|
| 1920x1080 | 18px | 6,588 | 1.55 | 9.3% |
| 1440x900 | 18px | 4,131 | 0.87 | 5.2% |
| 768x1024 | 18px | 2,552 | 0.54 | 3.3% |
| 390x844 | 24px | 666 | 0.15 | 0.9% |

Idle costs nothing at all — the loop skips the frame entirely rather than
clearing and redrawing, so a still field is free. Touch devices and
`prefers-reduced-motion` get the static field drawn exactly once, with no loop
and no listeners.

## Palette

The DOM ran a warm coral/cream scheme deliberately set against the cool
canvas. That separation was dropped on purpose — the whole page is cool now.

Two accent roles, and they are not interchangeable:

- **`--accent`, quartz white (`#f7f9fb`) — the solid one.** Button fills, HUD
  values, eyebrows, the progress rail, stage markers. Pitched slightly cooler
  and brighter than the cream body text (`--fg`) so it still sits above it in
  the hierarchy.
- **`--glow`, neon electric blue (`#2ec8ff`) — the lit one.** Every glowing
  edge: the travelling ring on the buttons, the nav underline sweep, the
  halos. Never use it as a text or fill colour; at the saturation it needs to
  glow, it fails contrast.

The neon reads as neon because the ring runs blue with a near-white core
(`--glow-hot`), the way a real tube is white at the centre and coloured at the
edges. Halos are `box-shadow`, deliberately not animated, so the blurred layer
stays out of the animation.

Inside the canvas nothing changed: blue-black drone, violet/indigo aurora,
blue trim, with the real wire colours as the only warm thing.

Measured after the change — quartz accent 18.96:1 on the page background and
14.94:1 over the brightest part of the aurora, body copy 9.29:1 and 7.87:1.
All comfortably past AA and AAA.

## Scroll model

`src/scene.js` maps scroll progress 0–1 across seven stages. Frame and motors
are the fixed anchor and never move; everything else has an `origin` and an
`explode` offset, and the stage order is a physical bottom-up disassembly:

1. Hero, assembled
2. Frame + motors (the anchor)
3. Battery, drops away below
4. Power board
5. MPU6050
6. ESP32
7. Propellers, last and highest

Note this differs from the seven *coding* stages in the project brief — the
captions follow the physical teardown, not the firmware roadmap.

Propellers never spin on their own. Rotation is derived from scroll position
rather than accumulated over time, which is what makes scrolling back up wind
them back exactly rather than drifting out of sync.

## Known gaps

See `TODO.md`.
