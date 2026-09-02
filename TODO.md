# AIA-1X site — outstanding work

Live: https://ishanchabria.github.io/aia-1x-website/

Rewritten 2026-09-02 after the nine-item work order. Everything below is either
still broken, unfinished, unverified, or a decision waiting on you.

---

## 1. Bugs / correctness

- [ ] **Dead code.** `allTextures` in `drone.js` is still collected and never
      returned or used — it was written for disposal that never got wired up.
      The `sag` parameter in `makeDynamicWire` is also unused.
- [ ] **Disposal is only half done.** `initScene()` returns a `dispose()` that
      calls `renderer.dispose()` and `composer.dispose()`, but nothing disposes
      the geometries, materials or textures. Fine for a static page; wrong if
      this ever mounts and unmounts.
- [ ] **Heat-shrink sleeve orientation is probably wrong.** The sleeve does
      `lookAt(to)` where `to` is in the parent's space, but `lookAt` works in
      world space. Small and easy to miss visually, but it is not doing what
      the code says.

## 2. Spec items still not met

- [ ] **Render-on-demand.** Spec 1H said explicitly: do not run an unconditional
      full-rate rAF loop. It still does. Rendering pauses when the canvas is
      offscreen, which is not the same thing. Note the prop spin phase needs
      continuous frames, so this needs care rather than a naive dirty flag.
- [ ] **Part 3 polish never done:** light sweep, canvas film-grain pass, depth
      of field, dust motes.
- [ ] Not every `BoxGeometry` is a `RoundedBoxGeometry` — header pins and MOSFET
      legs stay sharp deliberately (sub-mm edges never resolve, and rounding
      ~120 pins costs real triangles).
- [ ] `environmentIntensity` is 0.32 rather than ~0.9, and prop
      `envMapIntensity` is 0.7 rather than 1.0. Both deliberate and measured.
      Revisit if the HDRI is ever swapped.

## 3. Never verified

- [ ] **The composed page.** I can render the canvas and inspect the DOM
      numerically, but I cannot see the page. Type scale, spacing, watermark
      weight and CTA placement are unreviewed by me.
- [ ] **Mobile layout — entirely unverified.** Breakpoints written blind.
- [ ] **Framerate never measured.** The 60fps target is unconfirmed, and the
      detail pass added ~28k triangles since the last look.
- [ ] **The prop spin-down**, which is the most tuning-sensitive thing added.
- [ ] Whether the emissive accent trim actually crosses the bloom threshold
      (emissive 1.4 vs threshold 0.80).
- [ ] `prefers-reduced-motion` path.
- [ ] Safari specifically — `MeshPhysicalMaterial` transmission and
      `backdrop-filter` are both risk areas there.
- [ ] Lighthouse / real profiling.

## 4. Decisions waiting on you

- [ ] **Cream photo tiles.** Investigated: eight of them, all rendering, no
      404s, 8341px down (80% of the page) in the Spec Sheet. `#f2ebe0` plates
      against a `#08080a` page. The plates exist because the product photos have
      white backgrounds, so recolouring the plate just moves the white inside
      it — the real fix is background-removed cutouts.
- [ ] **HUD telemetry is simulated.** ALT / PITCH / VBAT are derived from scroll
      position for a drone that has not flown. CLAUDE.md's own tone rule says
      don't oversell; this should probably be labelled as a simulated readout.

## 5. Visual compromises

- [ ] Contact shadow is a static blob — it does not track the silhouette or
      react to the explode state, so it is wrong in the exploded view.
- [ ] ESP32 shield is still among the brightest objects; the motors should hold
      that.
- [ ] Camera framing sits the drone low, clipped at the viewport bottom.
- [ ] Perfboard holes, copper traces, silkscreen and pads are textures, not
      geometry — correct at distance, fake up close.
- [ ] Silkscreen is generic rather than real pin labels.
- [ ] Still procedural geometry, not the Blender `.glb` from the original plan.

## 6. Accessibility

- [ ] **The scroll experience is not keyboard accessible.** Exploded states are
      unreachable without scrolling; there are no alternative controls. This is
      the biggest gap — the whole product demo is scroll-gated.
- [ ] `--fg-muted` at 0.55 alpha on near-black likely fails WCAG AA for small
      body text. Needs a contrast check.
- [ ] No skip link.
- [x] Canvas has a `role` and `aria-label`.

## 7. Project / infrastructure

- [ ] **Scene chunk is 792KB (243KB gzipped).** The entry chunk is now only
      3.2KB because the scene is dynamically imported, so the shell paints
      immediately — but the scene payload itself is unchanged. three.js is the
      bulk of it.
- [ ] HDRI is 1.6MB. Loads async behind the RoomEnvironment fallback, so it
      never blocks, but it is the single largest asset.
- [ ] Part photos: no `srcset`, no lazy loading (340KB total).
- [ ] `window.__debug` and the `.shots` capture middleware are committed. Both
      are DEV-only, but they are in the source.
- [ ] `.claude/launch.json` is gitignored, so a fresh clone cannot preview via
      that path without recreating it.
- [ ] CLAUDE.md is out of date — the caption narrative changed from the seven
      coding stages to a seven-step physical disassembly order.
- [ ] Build-log stage statuses are hardcoded; update them as stages complete.
- [ ] `download (1).avif` was never identified or used.
- [ ] No battery photo was ever supplied; the battery is modelled from spec only.

---

## Done in the nine-item work order

- [x] Cursor parallax camera drift — was walking the camera 12,490 units out
- [x] WebGL fallback: detection, static image, context lost/restored, try/catch
- [x] Pixelated platform — plane scale vs texture resolution, plus anisotropy 1
- [x] GitHub Pages deploy, live, with base-aware asset paths
- [x] Propeller blades rebuilt as lofted airfoils with real twist
- [x] Propeller scroll choreography: running, spin-down, stationary, separating
- [x] Detail pass across motors, frame, PCBs, wires, battery
- [x] Cream photo tiles investigated
- [x] Final static assets captured from the finished model
- [x] Entry bundle code-split 700KB -> 3.2KB
- [x] Favicon, meta description, Open Graph and Twitter tags

## Suggested order

1. Keyboard accessibility — the demo is entirely scroll-gated today
2. Look at the deployed page on desktop and mobile; fix what that surfaces
3. HUD honesty labelling and the text contrast check
4. Cream tile decision (cutouts, if you want them fixed properly)
5. Contact shadow tracking the explode state
6. Render-on-demand, full disposal, dead code
7. Remaining Part 3 polish
