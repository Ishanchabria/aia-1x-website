import * as THREE from "three";

// ---------------------------------------------------------------------------
// Smart 100 carbon fibre frame. Replaces the Q100 moulded-ABS implementation
// entirely — different architecture, different silhouette, different material.
//
// The material is the point. Carbon is not dark plastic: it has a woven relief
// that catches light, a directional sheen that stretches rather than pools, and
// a smooth epoxy clearcoat sitting over a textured substrate. Render it as
// plain dark plastic and the entire reason for choosing carbon is thrown away.
//
// The other half of the read is the edge treatment. A routed plate shows its
// laminate cross-section on every cutout: matte, flat, no weave. Letting the
// weave wrap onto the edges is the most common way carbon renders wrong, so
// faces and edges are separate materials here and the split is by face normal.
// ---------------------------------------------------------------------------

// The kit's red 3D-printed camera mount. AIA-1X has no camera — that is AIA-2 —
// so whether it is fitted is a judgement call, not a fact. Default off; one
// render of each was produced for the decision.
export const SHOW_CAMERA_MOUNT = false;

// In dev you can also append ?camera=1 to compare without rebuilding, the same
// way the motor finish works.
export function resolveCameraMount() {
  try {
    const q = new URLSearchParams(location.search).get("camera");
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
  } catch {
    /* no location available */
  }
  return SHOW_CAMERA_MOUNT;
}

// WHEELBASE CONFLICT, resolved deliberately. The brief estimates the frame at
// 85 x 85mm. The rest of this project is built on 100mm motor-to-motor — it is
// in the README, in the captions, and it is the right wheelbase for 8520
// motors on 65mm props. "Smart 100" almost certainly refers to that 100mm
// wheelbase. So the motor rings stay at 50mm radius and the plate is scaled to
// suit; the 85mm figure is the one I am treating as the estimate. Worth
// re-checking against the real part.
const RING_R = 50; // motor ring centres, giving 100mm motor-to-motor
const RING_OUT = 7; // 14mm outer diameter
const RING_BORE = 5.5; // 11mm hole for the grommet
const PLATE_T = 1.5;
const ARM_HALF_ROOT = 5;
const HUB_R = 13;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// --- weave maps ------------------------------------------------------------
// One 12mm cell holding an 8-tow plain weave, tiled. At 1024px that is 85
// px/mm — far higher density than a 2048 map stretched over the whole 100mm
// frame would give (20 px/mm), because tiling is what buys the resolution
// here. Tow width lands at 1.5mm in world scale, which is the figure that
// matters: oversized weave is the second most common carbon error.
const CELL_MM = 12;
const TOWS = 8;

function weaveCanvas(size, mode) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const t = size / TOWS;

  const base =
    mode === "colour" ? "#141418" : mode === "rough" ? "#8c8c8c" : "#808080";
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < TOWS; row++) {
    for (let col = 0; col < TOWS; col++) {
      // plain weave: checkerboard of over-under
      const warpOver = (row + col) % 2 === 0;
      const x = col * t;
      const y = row * t;
      if (mode === "colour") {
        // one direction very slightly lighter, which is what makes the weave
        // legible at all on a near-black material
        ctx.fillStyle = warpOver ? "#1b1b20" : "#101014";
      } else if (mode === "rough") {
        // tow crests are marginally smoother; resin pools in the valleys
        ctx.fillStyle = warpOver ? "#7e7e7e" : "#9c9c9c";
      } else {
        // height: crests proud, valleys recessed
        ctx.fillStyle = warpOver ? "#c8c8c8" : "#3c3c3c";
      }
      ctx.fillRect(x, y, t, t);

      // fine striation along the fibre direction inside each tow
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, t, t);
      ctx.clip();
      ctx.globalAlpha = mode === "colour" ? 0.18 : 0.3;
      ctx.strokeStyle = mode === "height" ? "#ffffff" : "#000000";
      ctx.lineWidth = 1;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const o = (i / n) * t;
        ctx.beginPath();
        if (warpOver) {
          ctx.moveTo(x, y + o);
          ctx.lineTo(x + t, y + o);
        } else {
          ctx.moveTo(x + o, y);
          ctx.lineTo(x + o, y + t);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  return c;
}

function heightToNormal(canvas, strength) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const d = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = ((H(x + 1, y) - H(x - 1, y)) / 255) * strength;
      const dy = ((H(x, y + 1) - H(x, y - 1)) / 255) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").putImageData(out, 0, 0);
  return c;
}

// --- plate outlines --------------------------------------------------------
// Every internal corner is radiused, because a carbon plate is routed with a
// round cutter and physically cannot have a sharp inside corner.
function mainPlateShape() {
  const shape = new THREE.Shape();
  const angles = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180);
  const pt = (a, along, across) =>
    new THREE.Vector2(
      Math.cos(a) * along - Math.sin(a) * across,
      Math.sin(a) * along + Math.cos(a) * across
    );

  const TAN = (115 * Math.PI) / 180; // where the arm sides meet the ring
  let first = true;
  angles.forEach((a, i) => {
    const sideIn = pt(a, HUB_R, -ARM_HALF_ROOT);
    const ringA = pt(a, RING_R + Math.cos(-TAN) * RING_OUT, Math.sin(-TAN) * RING_OUT);
    const ringB = pt(a, RING_R + Math.cos(TAN) * RING_OUT, Math.sin(TAN) * RING_OUT);
    const sideOut = pt(a, HUB_R, ARM_HALF_ROOT);

    if (first) {
      shape.moveTo(sideIn.x, sideIn.y);
      first = false;
    } else {
      // concave scoop between arms — generous, no sharp internal corner
      const prev = angles[(i + angles.length - 1) % angles.length];
      const mid = (prev + a) / 2;
      const ctrl = new THREE.Vector2(Math.cos(mid) * (HUB_R - 4.5), Math.sin(mid) * (HUB_R - 4.5));
      shape.quadraticCurveTo(ctrl.x, ctrl.y, sideIn.x, sideIn.y);
    }
    shape.lineTo(ringA.x, ringA.y);
    // around the outside of the motor ring
    const cx = Math.cos(a) * RING_R;
    const cy = Math.sin(a) * RING_R;
    shape.absarc(cx, cy, RING_OUT, a - TAN, a + TAN, false);
    shape.lineTo(sideOut.x, sideOut.y);
  });
  // close back into the first arm
  const lastA = angles[angles.length - 1];
  const firstA = angles[0];
  const mid = (lastA + firstA + Math.PI * 2) / 2;
  const ctrl = new THREE.Vector2(Math.cos(mid) * (HUB_R - 4.5), Math.sin(mid) * (HUB_R - 4.5));
  const back = pt(firstA, HUB_R, -ARM_HALF_ROOT);
  shape.quadraticCurveTo(ctrl.x, ctrl.y, back.x, back.y);

  // motor bores
  angles.forEach((a) => {
    const p = new THREE.Path();
    p.absarc(Math.cos(a) * RING_R, Math.sin(a) * RING_R, RING_BORE, 0, Math.PI * 2, true);
    shape.holes.push(p);
  });

  // Central lightening pattern. Symmetrical on both axes — on a real plate
  // these are load-path decisions, and symmetry is what makes them read as
  // engineered rather than as holes punched at random.
  const slot = (x, y, w, h, r = 0.8) => {
    const p = new THREE.Path();
    p.moveTo(x - w / 2 + r, y - h / 2);
    p.lineTo(x + w / 2 - r, y - h / 2);
    p.absarc(x + w / 2 - r, y - h / 2 + r, r, -Math.PI / 2, 0);
    p.lineTo(x + w / 2, y + h / 2 - r);
    p.absarc(x + w / 2 - r, y + h / 2 - r, r, 0, Math.PI / 2);
    p.lineTo(x - w / 2 + r, y + h / 2);
    p.absarc(x - w / 2 + r, y + h / 2 - r, r, Math.PI / 2, Math.PI);
    p.lineTo(x - w / 2, y - h / 2 + r);
    p.absarc(x - w / 2 + r, y - h / 2 + r, r, Math.PI, 1.5 * Math.PI);
    shape.holes.push(p);
  };
  const round = (x, y, r, seg = 10) => {
    const p = new THREE.Path();
    p.absarc(x, y, r, 0, Math.PI * 2, true);
    void seg;
    shape.holes.push(p);
  };
  slot(0, 0, 9, 6.5);
  [-1, 1].forEach((sx) => {
    slot(sx * 8.5, 0, 3.2, 8);
    [-1, 1].forEach((sy) => {
      round(sx * 5.6, sy * 7.4, 1.5);
      round(sx * 10.5, sy * 6.2, 1.1); // standoff clearance
    });
  });
  [-1, 1].forEach((sy) => slot(0, sy * 8.2, 7, 2.6));

  return shape;
}

function roundedRectPath(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, 1.5 * Math.PI);
  return s;
}

// The upper plates carry their own skeletal pattern — the reference shows a
// bowtie-ish void rather than a repeat of the main plate's slots.
function topPlateShape() {
  const s = roundedRectPath(40, 32, 3);
  const bow = new THREE.Path();
  bow.moveTo(-13, 0);
  bow.quadraticCurveTo(-6, 9, 0, 3.2);
  bow.quadraticCurveTo(6, 9, 13, 0);
  bow.quadraticCurveTo(6, -9, 0, -3.2);
  bow.quadraticCurveTo(-6, -9, -13, 0);
  s.holes.push(bow);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sy) => {
      const p = new THREE.Path();
      p.absarc(sx * 15.5, sy * 11.5, 1.1, 0, Math.PI * 2, true);
      s.holes.push(p);
    })
  );
  return s;
}

function midPlateShape() {
  const s = roundedRectPath(35, 30, 2.5);
  [-1, 1].forEach((sx) => {
    const p = new THREE.Path();
    p.moveTo(sx * 4, -9);
    p.quadraticCurveTo(sx * 13, -5, sx * 13, 0);
    p.quadraticCurveTo(sx * 13, 5, sx * 4, 9);
    p.quadraticCurveTo(sx * 6, 0, sx * 4, -9);
    s.holes.push(p);
  });
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sy) => {
      const p = new THREE.Path();
      p.absarc(sx * 13.5, sy * 10.5, 1.1, 0, Math.PI * 2, true);
      s.holes.push(p);
    })
  );
  return s;
}

// Split faces from edges by normal. Cap UVs come out of ExtrudeGeometry in
// shape units, i.e. millimetres, which is exactly what a tiled weave wants —
// the repeat below turns mm into weave cells.
function plate(shape, weaveRotation, faceMat, edgeMat) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: PLATE_T,
    bevelEnabled: true,
    // routed carbon has an eased edge, and this chamfer is what catches the
    // fine bright line all the way round every cutout
    bevelSize: 0.15,
    bevelThickness: 0.15,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uvIn = geo.attributes.uv;
  const tris = pos.count / 3;
  const faces = [];
  const edges = [];
  for (let t = 0; t < tris; t++) {
    const ny = (nor.getY(t * 3) + nor.getY(t * 3 + 1) + nor.getY(t * 3 + 2)) / 3;
    (Math.abs(ny) > 0.75 ? faces : edges).push(t);
  }
  const order = [...faces, ...edges];
  const P = new Float32Array(order.length * 9);
  const N = new Float32Array(order.length * 9);
  const U = new Float32Array(order.length * 6);
  const cos = Math.cos(weaveRotation);
  const sin = Math.sin(weaveRotation);
  order.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      const s = t * 3 + v;
      P[k * 9 + v * 3] = pos.getX(s);
      P[k * 9 + v * 3 + 1] = pos.getY(s);
      P[k * 9 + v * 3 + 2] = pos.getZ(s);
      N[k * 9 + v * 3] = nor.getX(s);
      N[k * 9 + v * 3 + 1] = nor.getY(s);
      N[k * 9 + v * 3 + 2] = nor.getZ(s);
      // Rotate the UVs per plate rather than the geometry: real plates are
      // nested onto a sheet at whatever angle fits, so a stack rarely shares
      // fibre direction, and different plates catching the sheen at different
      // moments is a genuinely convincing detail.
      const ux = uvIn ? uvIn.getX(s) : pos.getX(s);
      const uy = uvIn ? uvIn.getY(s) : pos.getZ(s);
      U[k * 6 + v * 2] = (ux * cos - uy * sin) / CELL_MM;
      U[k * 6 + v * 2 + 1] = (ux * sin + uy * cos) / CELL_MM;
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  out.addGroup(0, faces.length * 3, 0);
  out.addGroup(faces.length * 3, edges.length * 3, 1);
  geo.dispose();
  return new THREE.Mesh(out, [faceMat, edgeMat]);
}

// --- rubber grommet --------------------------------------------------------
// Mushroom profile with a circumferential groove that snaps into the plate.
// The softest thing on the drone sitting in the hardest — that contrast is
// most of why this part is worth modelling properly.
function grommetGeometry() {
  const R = 6.0;
  const bore = 4.25;
  const pts = [
    [bore, 0],
    [R - 0.4, 0],
    [R, 0.5],
    [R, 1.4],
    [R - 1.05, 2.05], // groove
    [R - 1.05, 2.95],
    [R, 3.6],
    [R - 0.5, 4.5],
    [R - 1.8, 5.0],
    [bore + 0.35, 5.0],
    [bore, 4.6], // dished top face
    [bore, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 18);
}

export function buildFrame(maxAnisotropy = 1, showCameraMount = SHOW_CAMERA_MOUNT) {
  const textures = [];
  const track = (canvas, srgb, repeat) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAnisotropy;
    if (repeat) t.repeat.set(repeat, repeat);
    textures.push(t);
    return t;
  };

  const weaveColour = track(weaveCanvas(1024, "colour"), true, 1);
  const weaveRough = track(weaveCanvas(512, "rough"), false, 1);
  const weaveNormal = track(heightToNormal(weaveCanvas(512, "height"), 1.6), false, 1);

  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: weaveColour,
    roughnessMap: weaveRough,
    normalMap: weaveNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    metalness: 0,
    roughness: 0.34,
    // cured epoxy over the weave: the reflection glides across a smooth
    // clearcoat while the weave relief shows through beneath it
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.0,
  });
  // Present from three r155; guard so an older build degrades rather than throws.
  if ("anisotropy" in faceMat) {
    faceMat.anisotropy = 0.6;
    faceMat.anisotropyRotation = 0;
  }
  // The laminate cross-section: matte, flat, and deliberately carrying NO
  // weave. This contrast shows up on every cutout and every arm edge.
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c1f,
    metalness: 0,
    roughness: 0.72,
  });

  const M = {
    rubber: new THREE.MeshStandardMaterial({ color: 0x0d0d0f, metalness: 0, roughness: 0.88 }),
    standoff: new THREE.MeshStandardMaterial({ color: 0x232326, metalness: 0.3, roughness: 0.55 }),
    screw: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.85, roughness: 0.38 }),
    bore: new THREE.MeshStandardMaterial({ color: 0x08080a, metalness: 0, roughness: 0.9 }),
    zip: new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0, roughness: 0.62 }),
  };

  const group = new THREE.Group();
  const angles = [45, 135, 225, 315];

  // --- plates, each with its own fibre direction ---
  const main = plate(mainPlateShape(), 0, faceMat, edgeMat);
  main.position.y = 0;
  group.add(main);

  const mid = plate(midPlateShape(), 0.62, faceMat, edgeMat);
  mid.position.y = 9.5;
  group.add(mid);

  const top = plate(topPlateShape(), 1.19, faceMat, edgeMat);
  top.position.y = 21;
  group.add(top);

  // --- grommets, one per arm tip ---
  const gGeo = grommetGeometry();
  const grommets = new THREE.InstancedMesh(gGeo, M.rubber, 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const motorTips = [];
  angles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    m4.compose(new THREE.Vector3(dir.x * RING_R, -1.2, dir.z * RING_R), q, one);
    grommets.setMatrixAt(i, m4);
    // The motor presses INTO the grommet rather than into a moulded tube, so
    // its seat is the grommet's bore, not the plate.
    motorTips.push({ tip: new THREE.Vector3(dir.x * RING_R, 3.8, dir.z * RING_R), dir, deg });
  });
  grommets.instanceMatrix.needsUpdate = true;
  grommets.computeBoundingSphere();
  group.add(grommets);

  // --- hex standoffs: two long, two short ---
  const standoffAt = [
    [10.5, 6.2, 15],
    [-10.5, 6.2, 15],
    [10.5, -6.2, 8],
    [-10.5, -6.2, 8],
  ];
  const hexLong = new THREE.CylinderGeometry(3.18, 3.18, 15, 6);
  const hexShort = new THREE.CylinderGeometry(3.18, 3.18, 8, 6);
  const boreGeo = new THREE.CylinderGeometry(1.0, 1.0, 1.2, 8);
  standoffAt.forEach(([x, z, len]) => {
    const s = new THREE.Mesh(len > 10 ? hexLong : hexShort, M.standoff);
    s.position.set(x, PLATE_T + len / 2, z);
    s.rotation.y = 0.3;
    group.add(s);
    // a real recess at each end, not a painted circle
    [PLATE_T + 0.62, PLATE_T + len - 0.62].forEach((y) => {
      const b = new THREE.Mesh(boreGeo, M.bore);
      b.position.set(x, y, z);
      group.add(b);
    });
  });

  // --- button-head screws with a visible socket ---
  const headGeo = new THREE.SphereGeometry(2.0, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.36);
  const socketGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.5, 6);
  const screwSpots = [
    ...standoffAt.map(([x, z]) => [x, PLATE_T + 0.1, z]),
    [10.5, 9.5 + PLATE_T + 0.1, 6.2],
    [-10.5, 9.5 + PLATE_T + 0.1, 6.2],
    [15.5, 21 + PLATE_T + 0.1, 11.5],
    [-15.5, 21 + PLATE_T + 0.1, 11.5],
    [15.5, 21 + PLATE_T + 0.1, -11.5],
    [-15.5, 21 + PLATE_T + 0.1, -11.5],
  ];
  screwSpots.forEach(([x, y, z]) => {
    const h = new THREE.Mesh(headGeo, M.screw);
    h.position.set(x, y, z);
    group.add(h);
    const s = new THREE.Mesh(socketGeo, M.bore);
    s.position.set(x, y + 0.45, z);
    group.add(s);
  });

  // --- O-rings retaining the battery under the main plate ---
  // Stretched over the pack, so slightly oval rather than round.
  const oGeo = new THREE.TorusGeometry(9, 1, 5, 20);
  [-7, 7].forEach((z) => {
    const o = new THREE.Mesh(oGeo, M.rubber);
    o.rotation.y = Math.PI / 2;
    o.position.set(0, -3.2, z);
    o.scale.set(1, 0.62, 1);
    group.add(o);
  });

  // --- zip ties around the arm wire runs ---
  const zipGeo = new THREE.TorusGeometry(3.6, 0.45, 4, 14);
  const headBox = new THREE.BoxGeometry(1.8, 1.4, 1.2);
  angles.forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    const r = 26;
    const z = new THREE.Mesh(zipGeo, M.zip);
    z.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    z.rotation.set(Math.PI / 2, 0, -a);
    z.scale.set(1, 0.55, 1);
    group.add(z);
    const hd = new THREE.Mesh(headBox, M.zip);
    hd.position.set(Math.cos(a) * r, -1.6, Math.sin(a) * r);
    group.add(hd);
  });

  // --- the red camera mount, if it is fitted at all ---
  if (showCameraMount) {
    const layers = document.createElement("canvas");
    layers.width = 32;
    layers.height = 256;
    const lc = layers.getContext("2d");
    lc.fillStyle = "#808080";
    lc.fillRect(0, 0, 32, 256);
    // FDM layer lines, ~0.2mm apart. Cheap, and it is what makes a printed
    // part read as printed rather than moulded.
    lc.fillStyle = "#606060";
    for (let y = 0; y < 256; y += 4) lc.fillRect(0, y, 32, 2);
    const layerNormal = track(heightToNormal(layers, 1.1), false, 1);
    layerNormal.repeat.set(2, 12);

    const red = new THREE.MeshStandardMaterial({
      color: 0xd6392c,
      metalness: 0,
      roughness: 0.55,
      normalMap: layerNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
    const mount = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 9), red);
    mount.add(base);
    [-1, 1].forEach((sx) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 11, 7), red);
      arm.position.set(sx * 6.2, 6, -0.6);
      arm.rotation.x = -0.42; // cradle angled up ~25 degrees
      mount.add(arm);
    });
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(13, 2, 6), red);
    cradle.position.set(0, 10.4, -2.6);
    cradle.rotation.x = -0.42;
    mount.add(cradle);
    mount.position.set(0, 21 + PLATE_T, 9);
    group.add(mount);
  }

  let triangles = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });

  return { group, motorTips, plateRadial: HUB_R, triangles, textures, faceMat, edgeMat };
}
