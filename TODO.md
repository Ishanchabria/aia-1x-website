# AIA-1X site — outstanding work

Everything known to be broken, unfinished, unverified, or deliberately skipped.
Written 2026-09-02, after the 3D realism + visual design pass.

---

## 1. Actual bugs (misbehave for a real visitor)

- [ ] **Cursor parallax drifts the camera away permanently.** In `src/main.js`,
      `camera.position.x += parallax.x * 14` uses `+=` on an absolute position.
      `updateScene()` only rewrites the camera while the scroll value is
      *changing*, so holding the pointer off-centre without scrolling compounds
      the offset every frame and the camera flies off. Must be `base + offset`,
      not an accumulation. **Highest priority — only item that actively breaks.**
- [ ] **No WebGL fallback.** If WebGL is unavailable or the context is lost, the
      visitor gets an empty page. No detection, no message, no static image.
- [ ] Dead code: `allTextures` in `drone.js` is collected and never returned or
      used (was intended for disposal). `sag` param in `makeDynamicWire` unused.

## 2. Spec requirements not met

- [ ] **Render-on-demand never implemented** (spec 1H explicitly: "do not run an
      unconditional full-rate rAF loop"). It still runs one. Pausing when
      offscreen is not the same thing.
- [ ] **Blades have no real camber/twist.** Single fixed pitch rotation, not a
      twist varying along the span. Spec called this out directly: without it
      there is no highlight sweep for the glossy prop material to catch. Then
      prop roughness went 0.16 -> 0.52 to kill a white-blade blowout, weakening
      it further. Correct fix is a genuinely twisted blade, then restore gloss.
- [ ] **Drone not offset to the right two-thirds** (spec 2F). Camera is centred,
      so the hero headline sits on top of the drone and the watermark.
- [ ] **No disposal/teardown.** Only the HDRI disposes.
- [ ] Not every `BoxGeometry` became `RoundedBoxGeometry` — header pins and
      MOSFET legs left sharp on purpose (sub-mm edges never resolve on screen,
      and rounding ~120 pins is real triangle cost). Deviation, but deliberate.
- [ ] Skipped from Part 3: light sweep, canvas film-grain pass, depth of field,
      dust motes.
- [ ] `environmentIntensity` is 0.32, spec said ~0.9. Deliberate — measurement
      showed the bright studio HDRI was supplying ~58% of all scene light and
      flattening the key pool. Revisit if the HDRI is ever swapped.

## 3. Never verified (could not check in this environment)

- [ ] **The composed page has never been seen by me.** Canvas renders and
      numeric DOM inspection only. Type scale, watermark weight, CTA placement,
      spacing, and rhythm are all unreviewed.
- [ ] **Mobile layout entirely unverified.** Breakpoints written blind.
- [ ] **Framerate never measured once.** Spec asks for 60fps desktop.
- [ ] **Whether the emissive accent trim actually crosses the bloom threshold.**
      Emissive 1.4 vs threshold 0.80. Spec warned too-low emissive "looks flat
      and dead." Unconfirmed.
- [ ] `prefers-reduced-motion` path untested.
- [ ] Cross-browser, **Safari especially** — `MeshPhysicalMaterial` transmission
      and `backdrop-filter` are both risk areas there.
- [ ] Lighthouse / real perf profiling never run.

## 4. Visual compromises

- [ ] Frame reads blue-grey from some angles rather than true near-black; the
      rim light is doing a lot of work on it.
- [ ] ESP32 shield is still among the brightest objects — spec wanted the motors
      to hold that.
- [ ] Camera framing sits the drone low, clipped at the viewport bottom.
- [ ] Contact shadow is a static blob. It does not track the silhouette or react
      to the explode state, so it is wrong in the exploded view.
- [ ] Perfboard holes, copper traces, silkscreen, castellated pads are
      **textures, not geometry** — correct at distance, fake up close.
- [ ] Silkscreen is generic, not real pin labels.
- [ ] **Cream photo tiles (`#f2ebe0`) in the spec sheet glare against the
      near-black page.** Predates this pass, never revisited.
- [ ] Still procedural geometry, not the Blender `.glb` from the original plan.

## 5. Content / honesty

- [ ] **HUD telemetry is simulated.** ALT / PITCH / VBAT are derived from scroll
      position, not real data. CLAUDE.md's tone rule says do not oversell —
      this should be labelled as a simulated readout, or it reads as live
      telemetry from a drone that has never flown.
- [ ] Build-log stage statuses are hardcoded; update as stages complete.
- [ ] CLAUDE.md is now out of date — the caption narrative changed from the
      7 coding stages to a 7-step physical disassembly order.
- [ ] `download (1).avif` was never identified or used.
- [ ] No battery photo was ever supplied; the battery is modelled from spec only.

## 6. Accessibility

- [ ] Scroll experience is **not keyboard accessible** — exploded states are
      unreachable without scrolling. No alternative controls.
- [ ] `--fg-muted` at 0.55 alpha on near-black likely **fails WCAG AA** for small
      body text. Needs a contrast check.
- [ ] Canvas has no accessible description of what it depicts.
- [ ] No skip link.

## 7. Project / infrastructure

- [ ] **GitHub Pages was never configured — the site is not deployed anywhere.**
      Needs a build-and-deploy workflow, plus `base` set in `vite.config.js` for
      a project-path URL.
- [ ] Bundle ~700KB (190KB gzipped), no code splitting; chunk-size warning on
      every build. HDRI adds 1.6MB.
- [ ] Part photos: no `srcset`, no lazy loading, full-size webp.
- [ ] No meta description, Open Graph tags, or social preview image.
- [ ] Still the default Vite favicon; `public/icons.svg` unused.
- [ ] `window.__debug` and the `.shots` capture middleware are committed
      (DEV-gated, but present in source).
- [ ] `.claude/launch.json` is gitignored, so a fresh clone cannot preview via
      that path without recreating it.
- [ ] Node needs a PATH workaround in this environment each session; the dev
      server does not survive between sessions.

---

## Suggested order

1. Parallax drift (bug, small fix)
2. WebGL fallback (bug, visitors get nothing today)
3. GitHub Pages deploy — the site does not exist publicly yet
4. Look at the page on desktop + mobile and fix what that surfaces
5. Blade twist, then restore prop gloss
6. Drone offset right / caption column
7. HUD honesty labelling + accessibility contrast
8. Render-on-demand, disposal, code splitting
9. Remaining Part 3 polish
