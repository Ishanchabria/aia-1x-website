# AIA-1X site — outstanding work

Live: https://ishanchabria.github.io/aia-1x-website/

Updated 2026-09-02. The visual direction overhaul is complete, including the
blue motor lamps. What follows is everything genuinely left.

---

## Needs you — I cannot do these from here

- [ ] **Decide whether the load hitch is worth a design change.** Measured on
      your hardware: the laptop freezes ~280ms once, right at load, and 107ms
      of that is the painted background layers — almost entirely the aurora's
      `blur(120px)` being rasterized for the first time. The phone does not
      care (57ms vs 61ms with the layers off).

      I did not change it. Cutting the blur to 48px makes the aurora visibly
      stronger and more concentrated rather than diffuse, so it is an art
      direction decision, not an optimization, and it is yours. Keeping the
      softness at a lower blur means widening the gradients and dropping their
      alpha — doable, but it is a re-tune of a look you have not judged yet.

      My read: leave it. It is one-time, it lands inside the boot overlay, and
      scrolling is clean. Say the word if you want the cheaper version built
      so you can compare them.

- [ ] **Look at the hero now.** The aurora, the dot grid and the studio pool
      behind them were never rendering — `body` carried an opaque background
      that painted over all three. Fixed, and I have now seen them, but the
      page you judged as "looking good" was missing its entire background
      treatment, so it is worth a fresh opinion. Particularly whether the
      aurora is too strong at the top of the page.
- [ ] **Mobile layout**, still written blind.
- [ ] **Safari.** `@property`, `MeshPhysicalMaterial` transmission and
      `backdrop-filter` are all risk areas. The shine border has a deliberate
      fallback path, but it is untested there.

## Measured, and now closed

- **Framerate is fine.** On your laptop and phone every worst-frame peak was
  tagged `load` and happened within the first 0.6s. Scrolling never produced
  the worst frame on either device, and the rolling worst frame during scroll
  read 14.5ms (laptop, 75Hz) and 17ms (phone, 60Hz) — one clean frame each.
- Ruled out along the way, each with a number rather than a guess: lazy shader
  compilation (all 33 programs exist after the hero frame), PMREM generation
  (8.3ms), full shader recompile (13.5ms against a 14.1ms steady frame), and
  the resize handler (5-16ms including the frame after it).

To re-measure any of this later, see the `?fps` section in the README.

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

- **Draw calls cut 32%, 876 to 596 per frame**, triangles 124k to 83k. One
  material was responsible: the amber diode glass used real `transmission`,
  which makes three.js render the entire opaque scene a second time into a
  transmission buffer every frame. 280 draw calls for four 4mm cylinders that
  are half-buried in the airframe. Clearcoat over a translucent body is the
  same picture — compared crops side by side — for one draw call. Median frame
  time on this machine went 17-22.5ms to 10.9ms.
- **The page never actually idled.** The render-on-demand gate had an
  `|| envRotates` term that is true on every desktop, so the early return
  never fired and the scene redrew at full display rate forever. Env-only
  frames are now throttled to ~24fps, with elapsed time banked so the drift
  speed is unchanged (verified identical at 60/144/240Hz). Idle draws drop 6x
  at 144Hz and 10x at 240Hz; scrolling still renders every frame.

- **The background layers were invisible and had always been.** `html, body`
  shared one opaque `background`, and body's paints in step 3 of the CSS
  painting order — after every negative z-index layer. That buried the studio
  pool (`body::before`, z-index -3), the aurora (-2) and the dot grid (-1).
  The background now lives on `html` alone. Worst-case contrast over the
  brightest part of the aurora is 7.9:1 for muted body text, so nothing
  regressed on the accessibility side.
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
