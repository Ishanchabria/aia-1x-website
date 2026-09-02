# AIA-1X site — outstanding work

Live: https://ishanchabria.github.io/aia-1x-website/

Updated 2026-09-02. The visual direction overhaul is complete, including the
blue motor lamps. What follows is everything genuinely left.

---

## Needs you — I cannot do these from here

- [ ] **Framerate has never been measured.** rAF is throttled in this
      environment, so any number produced here would be invented. Needs a real
      browser, desktop and mobile. Ask for a `?fps` readout if that helps.
- [ ] **The aurora, dot grid and shine borders are unreviewed by me.** They are
      DOM layers and only the WebGL canvas is capturable here. Deployed for you
      to judge.
- [ ] **Mobile layout**, still written blind.
- [ ] **Safari.** `@property`, `MeshPhysicalMaterial` transmission and
      `backdrop-filter` are all risk areas. The shine border has a deliberate
      fallback path, but it is untested there.

## Deliberate, not oversights

- Header pins and MOSFET legs stay sharp; rounding ~120 sub-mm parts costs
  triangles for edges that never resolve on screen.
- `environmentIntensity` 0.32 rather than 0.9 — measured: the bright studio
  HDRI was supplying ~58% of all scene light and flattening the key pool.
- Perfboard holes, traces and silkscreen are textures, not geometry. Maps are
  ~3x resolution with max anisotropy; still fake at very close range.
- Procedural geometry rather than a Blender `.glb`.
- Two of the eight photo cutouts (MPU6050, frame-kit) keep interior white
  regions that are genuinely holes in the physical part, so they read as white
  discs. Correct behaviour for an edge-connected fill, not a failure.
- `DOT_MASK_INVERT` is `false`: dots clear around the cursor. Flip it in
  `src/main.js` to brighten instead.

## Low priority

- [ ] Scene chunk 793KB (243KB gzipped), essentially three.js. Entry is 3.8KB,
      so the shell paints immediately regardless.
- [ ] HDRI 1.6MB. Async behind the RoomEnvironment fallback so it never blocks
      first paint, but it is the largest asset. No HDR tooling here to
      downsample it, and Poly Haven does not serve a 512 variant at the path I
      tried.
- [ ] No battery photo was ever supplied; the battery is modelled from spec only.
- [ ] Deferred by the work order: light sweep, canvas film grain, depth of
      field, dust motes. The aurora may have made these redundant — worth
      reassessing now you can see it.

## Done since the last update

- Blue motor lamps — root cause was the rim light sitting level with the motor
  top caps, not bloom and not the chamfers
- `srcset` on the part photos, roughly halving bytes per tile
- Verified `window.__debug` and the `.shots` middleware never reach production
- Build-log status collapsed to a single source of truth
- README added, covering setup, module layout, the two-palette rule and the
  scroll model
