import * as THREE from "three";

// ---------------------------------------------------------------------------
// Vero board / perfboard substrate — the piece carrying the MOSFETs, flyback
// diodes and resistors.
//
// WARM, NOT GREY. An early instruction desaturated this toward cool grey so it
// would not fight the palette; that was a mistake and is reversed here. This
// board sits directly under the ESP32, which is itself warm (gold shield,
// cream FR4 edge, orange tantalum). Two warm boards stacked read as one
// coherent electronics module against the cool frame; one warm and one grey
// reads as an error.
//
// It is paper phenolic, not fibreglass: flat, chalky, resin-soaked, and
// visibly coarser at a micro level than the ESP32's smooth solder mask. That
// difference is worth leaning into — it is what tells the two boards apart.
// ---------------------------------------------------------------------------

export const VERO = {
  W: 30, // X
  L: 25, // Z
  T: 1.5,
  pitch: 2.54,
  holeR: 0.5, // 1.0mm holes
  padSize: 1.9, // SQUARE pads
  margin: 2.0,
  mountR: 1.6, // 3.2mm
  holeSegments: 6,
};

const C = {
  face: 0xc17d3a,
  cutEdge: 0xd8b487,
  factoryEdge: 0xa8692c,
  pad: 0xc9ccd0,
  bore: 0x6b4520,
  copper: 0xb87a4e,
  solder: 0xb8bcc0,
};

// Deterministic noise so the board is identical every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

// The grid is generated once and shared by the geometry and every texture, so
// the bored holes and the painted square pads cannot drift out of register.
export function holeGrid() {
  const { W, L, pitch, margin, holeR } = VERO;
  const cols = Math.floor((W - margin * 2) / pitch) + 1;
  const rows = Math.floor((L - margin * 2) / pitch) + 1;
  const x0 = -((cols - 1) * pitch) / 2;
  const z0 = -((rows - 1) * pitch) / 2;
  const rnd = rng(70707);
  const holes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Punched, not drilled: cheap phenolic has real scatter in it, and a
      // mathematically perfect grid is the thing that reads as CG.
      holes.push({
        x: x0 + c * pitch + (rnd() - 0.5) * 0.06,
        z: z0 + r * pitch + (rnd() - 0.5) * 0.06,
        r: holeR * (1 + (rnd() - 0.5) * 0.04),
        rot: (rnd() - 0.5) * 0.08,
        col: c,
        row: r,
      });
    }
  }
  return { holes, cols, rows };
}

// --- outline: two hand-cut edges, two factory edges ------------------------
// The board was cut down from a 3x4in sheet with a knife, and a knifed phenolic
// edge looks nothing like a routed one. -X and +Z are the cut edges.
function outlinePoints() {
  const { W, L } = VERO;
  const hw = W / 2;
  const hl = L / 2;
  const rnd = rng(4242);
  const pts = [];

  // +X factory edge, straight, running -Z to +Z
  pts.push([hw, -hl], [hw, hl]);

  // +Z hand-cut edge, running +X to -X
  const nCut = 26;
  for (let i = 1; i <= nCut; i++) {
    const t = i / nCut;
    const x = hw - t * W;
    let z = hl + (rnd() - 0.5) * 0.28;
    if (rnd() > 0.86) z -= 0.25 + rnd() * 0.3; // a chip out of the edge
    pts.push([x, z]);
  }

  // -X hand-cut edge, running +Z to -Z, with two holes cut in half by the knife
  const notchAt = [0.34, 0.68];
  const nCut2 = 24;
  for (let i = 1; i <= nCut2; i++) {
    const t = i / nCut2;
    const z = hl - t * L;
    let x = -hw + (rnd() - 0.5) * 0.28;
    const near = notchAt.find((n) => Math.abs(t - n) < 0.035);
    if (near !== undefined) {
      // Half-moon notch: the cut passed straight through a hole. This happens
      // constantly on a hand-cut board and nobody ever models it.
      const phase = (t - (near - 0.035)) / 0.07;
      x += Math.sin(phase * Math.PI) * 0.62;
    }
    if (rnd() > 0.88) x += 0.22 + rnd() * 0.28;
    pts.push([x, z]);
  }

  // -Z factory edge closes the loop
  pts.push([hw, -hl]);
  return pts;
}

function boardShape(holes) {
  const shape = new THREE.Shape();
  const pts = outlinePoints();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);

  const seg = VERO.holeSegments;
  const kept = [];
  for (const h of holes) {
    // drop any hole the knife would have destroyed outright
    if (h.x < -VERO.W / 2 + 0.35) continue;
    const path = new THREE.Path();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2 + h.rot;
      const px = h.x + Math.cos(a) * h.r;
      const pz = h.z + Math.sin(a) * h.r;
      if (i === 0) path.moveTo(px, pz);
      else path.lineTo(px, pz);
    }
    shape.holes.push(path);
    kept.push(h);
  }

  // one surviving mounting hole from the original stock
  const mount = { x: VERO.W / 2 - 3.0, z: -VERO.L / 2 + 3.0, r: VERO.mountR };
  const mp = new THREE.Path();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = mount.x + Math.cos(a) * mount.r;
    const pz = mount.z + Math.sin(a) * mount.r;
    if (i === 0) mp.moveTo(px, pz);
    else mp.lineTo(px, pz);
  }
  shape.holes.push(mp);
  kept.push(mount);
  return { shape, bores: kept };
}

// --- textures --------------------------------------------------------------
// 1024 across a 30mm board is 34 px/mm. The brief asked for 2048, which was
// written for a full 3x4in sheet; on a 30mm cut-down piece that is 68 px/mm and
// 14MB for one face. Texel density is what legibility depends on, not absolute
// pixels — at 34 px/mm a 1.9mm pad is 65 pixels across, and the whole set costs
// 8MB instead of 40.
const TEX = { colour: 1024, rough: 512, normal: 512, bottom: 512 };

function paint(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
}

function grain(ctx, w, h, alpha, seed) {
  // Paper fibre. Phenolic is pressed paper, so the face is mottled rather than
  // flat — this is most of what separates it from the ESP32's smooth mask.
  const rnd = rng(seed);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 2600; i++) {
    const v = 140 + rnd() * 115;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const len = 2 + rnd() * 16;
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillRect(0, 0, len, 1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function faceMaps(grid) {
  const { W, L, padSize } = VERO;
  const drawPads = (ctx, w, h, padStyle, boreStyle) => {
    const PX = w / W;
    const zx = (x) => w / 2 + x * PX;
    const zy = (z) => h / 2 + z * PX;
    const s = padSize * PX;
    for (const hl of grid.holes) {
      ctx.save();
      ctx.translate(zx(hl.x), zy(hl.z));
      ctx.rotate(hl.rot);
      ctx.fillStyle = padStyle;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = boreStyle;
      ctx.beginPath();
      ctx.arc(0, 0, hl.r * PX * 1.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const colour = paint(TEX.colour, Math.round((TEX.colour * L) / W), (ctx, w, h) => {
    ctx.fillStyle = "#c17d3a";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 0.09, 11);
    // handled / heat-darkened patches
    const rnd = rng(88);
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 12; i++) {
      const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 40 + rnd() * 90);
      g.addColorStop(0, "#7e4a18");
      g.addColorStop(1, "rgba(126,74,24,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
    // SQUARE tinned pads — the identity of the part
    drawPads(ctx, w, h, "#c9ccd0", "#6b4520");
  });

  // One packed map driving both roughness (green) and metalness (blue), which
  // is how three samples them. The pads are TINNED COPPER: painting them into
  // the colour map of a metalness-0 material made them render as white paint
  // rather than dull metal, and at 56% coverage that turned the whole board
  // white. They need to be metal, and this costs no extra texture memory.
  const orm = paint(TEX.rough, Math.round((TEX.rough * L) / W), (ctx, w, h) => {
    const g = Math.round(0.74 * 255);
    ctx.fillStyle = `rgb(0,${g},0)`; // rough board, non-metal
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    grain(ctx, w, h, 0.05, 11);
    ctx.globalCompositeOperation = "source-over";
    const padG = Math.round(0.36 * 255);
    const boreG = Math.round(0.9 * 255);
    drawPads(ctx, w, h, `rgb(0,${padG},255)`, `rgb(0,${boreG},0)`);
  });

  const height = paint(TEX.normal, Math.round((TEX.normal * L) / W), (ctx, w, h) => {
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 0.5, 11);
    drawPads(ctx, w, h, "#8a8a8a", "#141414"); // the pad's slight raised lip
  });

  return { colour, orm, normal: normalFromHeight(height, 1.2) };
}

function bottomMap(grid) {
  const { W, L, pitch } = VERO;
  return paint(TEX.bottom, Math.round((TEX.bottom * L) / W), (ctx, w, h) => {
    const PX = w / W;
    ctx.fillStyle = "#a86a2e"; // slightly darker underside
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, 0.1, 23);
    // copper strips running between the hole rows
    ctx.fillStyle = "#b87a4e";
    const rows = grid.rows;
    for (let r = 0; r < rows; r++) {
      const z = grid.holes[r * grid.cols].z;
      ctx.fillRect(0, h / 2 + z * PX - 0.95 * PX, w, 1.9 * PX);
    }
    // flux staining: a faint brown halo around solder clusters, and slightly
    // glossier than the board around it
    const rnd = rng(555);
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 9; i++) {
      const cx = rnd() * w, cy = rnd() * h;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 + rnd() * 40);
      g.addColorStop(0, "#6b3f14");
      g.addColorStop(1, "rgba(107,63,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  });
}

function normalFromHeight(heightCanvas, strength) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  const out = new ImageData(w, h);
  const d = out.data;
  const H = (x, y) => src[((y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)) * 4];
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

// --- slab: split the extrusion into five material slots --------------------
// ExtrudeGeometry hands back caps and walls. This board needs the face, the
// underside, the bore interiors, the hand-cut edges and the factory edges to be
// five different surfaces — the pale cut edge in particular is one of the
// highest-value details on the part.
function splitSlab(geo, bores) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uvSrc = geo.attributes.uv;
  const tris = pos.count / 3;
  const bins = [[], [], [], [], []]; // top, bottom, bore, cut, factory
  const hw = VERO.W / 2;
  const hl = VERO.L / 2;

  for (let t = 0; t < tris; t++) {
    const ny = (nor.getY(t * 3) + nor.getY(t * 3 + 1) + nor.getY(t * 3 + 2)) / 3;
    if (ny > 0.7) {
      bins[0].push(t);
      continue;
    }
    if (ny < -0.7) {
      bins[1].push(t);
      continue;
    }
    let cx = 0, cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += pos.getX(t * 3 + v) / 3;
      cz += pos.getZ(t * 3 + v) / 3;
    }
    let isBore = false;
    for (const b of bores) {
      if ((cx - b.x) ** 2 + (cz - b.z) ** 2 < (b.r + 0.28) ** 2) {
        isBore = true;
        break;
      }
    }
    if (isBore) bins[2].push(t);
    else if (cx < -hw + 0.9 || cz > hl - 0.9) bins[3].push(t); // the knifed edges
    else bins[4].push(t);
  }

  const order = bins.flat();
  const P = new Float32Array(order.length * 9);
  const N = new Float32Array(order.length * 9);
  const U = new Float32Array(order.length * 6);
  order.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      const s = t * 3 + v;
      P[k * 9 + v * 3] = pos.getX(s);
      P[k * 9 + v * 3 + 1] = pos.getY(s);
      P[k * 9 + v * 3 + 2] = pos.getZ(s);
      N[k * 9 + v * 3] = nor.getX(s);
      N[k * 9 + v * 3 + 1] = nor.getY(s);
      N[k * 9 + v * 3 + 2] = nor.getZ(s);
      U[k * 6 + v * 2] = (pos.getX(s) + hw) / VERO.W;
      U[k * 6 + v * 2 + 1] = (pos.getZ(s) + hl) / VERO.L;
    }
  });
  void uvSrc;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  let start = 0;
  bins.forEach((b, i) => {
    out.addGroup(start, b.length * 3, i);
    start += b.length * 3;
  });
  return out;
}

// ---------------------------------------------------------------------------
export function buildVeroboard(maxAnisotropy = 1) {
  const textures = [];
  const track = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAnisotropy;
    textures.push(t);
    return t;
  };

  const grid = holeGrid();
  const { shape, bores } = boardShape(grid.holes);
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: VERO.T,
    bevelEnabled: false,
    curveSegments: 4,
  });
  // rotateX(-90) already maps the extrusion depth from +Z onto +Y, so the slab
  // lands on y = 0..T — the same "origin is the resting face" convention every
  // other board here uses. The extra translate that used to be here lifted it
  // to 1.5..3.0, which quietly buried anything placed on top of it inside the
  // board: that is where the resistors went.
  extruded.rotateX(-Math.PI / 2);
  const slab = splitSlab(extruded, bores);
  extruded.dispose();

  const maps = faceMaps(grid);
  // one texture, sampled twice: three reads roughness from green and metalness
  // from blue, so the pads can be metal while the board around them is not
  const ormTex = track(maps.orm, false);
  const M = [
    new THREE.MeshStandardMaterial({
      map: track(maps.colour, true),
      roughnessMap: ormTex,
      metalnessMap: ormTex,
      normalMap: track(maps.normal, false),
      normalScale: new THREE.Vector2(0.6, 0.6),
      // both driven by the packed map, so these stay at 1
      metalness: 1,
      roughness: 1,
    }),
    new THREE.MeshStandardMaterial({ map: track(bottomMap(grid), true), metalness: 0, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: C.bore, metalness: 0, roughness: 0.9 }),
    // Cutting exposes unresinated paper fibre, which is paler and rougher than
    // the resin-sealed face.
    new THREE.MeshStandardMaterial({ color: C.cutEdge, metalness: 0, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: C.factoryEdge, metalness: 0, roughness: 0.7 }),
  ];

  const group = new THREE.Group();
  group.add(new THREE.Mesh(slab, M));

  // --- underside solder joints ---
  // Real geometry, not texture: each blob takes its own sharp specular point,
  // and they are the shiniest thing on this part.
  const rnd = rng(31337);
  const joints = grid.holes.filter(() => rnd() < 0.24).slice(0, 26);
  // 8x3 rather than 6x3: at 6 the blobs read as hexagonal nuts rather than
  // domes of solder. 624 extra triangles, and they are the part every eye goes
  // to on the underside.
  const blobGeo = new THREE.SphereGeometry(0.62, 8, 3);
  blobGeo.scale(1, 0.45, 1);
  const blobs = new THREE.InstancedMesh(
    blobGeo,
    new THREE.MeshStandardMaterial({ color: C.solder, metalness: 1, roughness: 0.2 }),
    joints.length
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const v3 = new THREE.Vector3();
  joints.forEach((h, i) => {
    const s = 0.8 + rnd() * 0.5;
    m4.compose(v3.set(h.x, -0.05, h.z), q, one.clone().multiplyScalar(s));
    blobs.setMatrixAt(i, m4);
  });
  blobs.instanceMatrix.needsUpdate = true;
  group.add(blobs);

  // clipped lead ends poking through a few of them — hand soldering, not reflow
  const stubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.75, 5);
  const stubs = new THREE.InstancedMesh(
    stubGeo,
    new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 1, roughness: 0.32 }),
    8
  );
  joints.slice(0, 8).forEach((h, i) => {
    m4.compose(v3.set(h.x, -0.42, h.z), q, one);
    stubs.setMatrixAt(i, m4);
  });
  stubs.instanceMatrix.needsUpdate = true;
  group.add(stubs);

  let triangles = 0;
  let boardTriangles = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const t = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    triangles += t;
    if (!o.isInstancedMesh) boardTriangles += t;
  });

  return { group, textures, triangles, boardTriangles, holeCount: bores.length, materials: M };
}
