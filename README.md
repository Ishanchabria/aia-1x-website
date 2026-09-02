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
| `src/style.css` | All page styling, including the aurora and dot-grid layers. |
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

## Two palettes, kept separate

This is the core art direction and the easiest thing to get wrong:

- **Inside the canvas — cool.** Blue-black drone, violet/indigo aurora, blue
  accent trim. The only warm things are the real wire colours, which are small
  enough to read as accurate detail.
- **In the DOM — warm.** Coral accent, cream type, warm shine on the buttons.

The contrast between a cool object and warm UI is deliberate. Don't harmonise
them.

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
