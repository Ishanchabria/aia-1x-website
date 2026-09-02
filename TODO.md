# AIA-1X site — outstanding work

Live: https://ishanchabria.github.io/aia-1x-website/

Updated 2026-09-02. The visual direction overhaul is complete, including the
blue motor lamps. What follows is everything genuinely left.

---

## Needs you — I cannot do these from here

- [ ] **Measure the framerate.** There is now an on-page meter: open
      https://ishanchabria.github.io/aia-1x-website/?fps and scroll the whole
      page. Nothing to paste into a console. It reads:

      `58 fps · 58 draws/s · worst 24.1ms (peak 31.7ms)`

      - **fps** — animation frames per second. Should sit at your display's
        refresh rate while scrolling.
      - **draws/s** — frames the 3D scene actually rendered. This drops to 0
        when you stop scrolling, and that is correct: the page deliberately
        stops redrawing an unchanging picture. Only judge it while moving.
      - **worst / peak** — longest gap between frames, in the last second and
        for the whole visit. This is the number that shows up as a stutter.
        Under ~22ms is smooth; the bar turns amber past that and red past 50ms.

      Worth doing on desktop and phone. `?fps` works on the live site and on
      `npm run dev` alike.
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
- `keyLight.shadow.bias` stays negative. Setting it to 0 — which is the usual
  advice for VSM — makes the battery top self-shadow into a moiré. Measured:
  high-frequency energy 0.99 to 4.05.
- `shadow.radius` / `blurSamples` are left at their defaults because they do
  nothing measurable here (radius 8 moves the shadow edge 4%). The soft edge
  you see comes from the ground alphaMap and the contact blob, not the shadow
  filter.

## Low priority

- [ ] Scene chunk 793KB (243KB gzipped), essentially three.js. Entry is 4.4KB,
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

- Three deprecation warnings cleared: `RGBELoader` to `HDRLoader`, `THREE.Clock`
  to a direct `performance.now()` delta, `PCFSoftShadowMap` to `VSMShadowMap`.
  Console is clean.
- Checked whether the shadow map change was worth anything: PCF vs VSM is 4653
  vs 4685 hard-edge pixels over the floor, i.e. visually identical. The switch
  silences the warning; it did not restore soft shadows, because the softness
  was never coming from the shadow filter. Recorded in the code so it does not
  get re-litigated.
- `?fps` meter, so framerate can be measured without a console.
- Blue motor lamps — root cause was the rim light sitting level with the motor
  top caps, not bloom and not the chamfers
- `srcset` on the part photos, roughly halving bytes per tile
- Verified `window.__debug` and the `.shots` middleware never reach production
- Build-log status collapsed to a single source of truth
- README added, covering setup, module layout, the two-palette rule and the
  scroll model
