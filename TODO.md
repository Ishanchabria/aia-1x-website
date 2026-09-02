# AIA-1X site — outstanding work

Live: https://ishanchabria.github.io/aia-1x-website/

Updated 2026-09-02, after the visual direction overhaul. Everything from that
work order is done except the items below.

---

## Needs you (cannot be done from here)

- [ ] **Framerate never measured.** rAF is throttled in this environment, so any
      number produced here would be fiction. Needs a real browser, desktop and
      mobile. Ask for a  readout if that would help.
- [ ] **Aurora, dot grid and shine borders are unreviewed by me.** They are DOM
      layers and only the WebGL canvas is capturable here. Deployed for you to
      judge.
- [ ] **DOT_MASK_INVERT** in  — currently false (dots clear around
      the cursor). Flip to true to brighten instead. One line.
- [ ] Mobile layout, still written blind.
- [ ] Safari: ,  transmission and
       are all risk areas. The shine border has a documented
      fallback path but it is untested on Safari.

## Known artifact

- [ ] **Motor top-rim chamfers bloom into small blue lamps** under the rim
      light, visible on the right-hand motors. Raising shaft roughness and
      lifting the bloom threshold to 0.88 both failed to remove it, so it is a
      strong specular well above threshold rather than a marginal one. Likely
      needs the rim light angle changed or those chamfer tori given their own
      lower envMapIntensity.

## Deliberate, not oversights

- Header pins and MOSFET legs stay sharp; rounding ~120 sub-mm parts costs
  triangles for edges that never resolve.
-  0.32 rather than 0.9 — measured: the bright studio
  HDRI was supplying ~58% of scene light and flattening the key pool.
- Perfboard holes, traces and silkscreen are textures, not geometry. Maps are
  now ~3x resolution with max anisotropy; still fake up close.
- Procedural geometry rather than a Blender .glb.

## Low priority

- [ ] Scene chunk 793KB (243KB gzipped), essentially three.js. Entry is 3.8KB.
- [ ] HDRI 1.6MB. Async behind the RoomEnvironment fallback so it never blocks,
      but it is the largest asset. No HDR tooling here to downsample it.
- [ ]  and the  middleware are committed. Both are
      DEV-gated and stripped from production builds, but they are in the source.
- [ ] Part photos have lazy loading but no .
- [ ] No battery photo was ever supplied; modelled from spec only.
- [ ] Deferred by the work order: light sweep, canvas film grain, depth of
      field, dust motes. The aurora may have made these redundant.
