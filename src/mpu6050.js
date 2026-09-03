import * as THREE from "three";

// ---------------------------------------------------------------------------
// MPU6050 / GY-521 breakout.
//
// The blue is the point. At the old 0x14315e navy this board sank into the
// blue-black frame and read as part of it; at royal it reads as its own
// object, which matters because it is the only blue component on the drone.
// The cream FR4 edge against that saturated blue is a stronger contrast than
// the same edge gives on the black ESP32.
//
// Three boards, three finishes, and they should be tellable apart when the
// exploded view puts them side by side: chalky phenolic (Vero), matte black
// mask (ESP32), and this one — visibly the glossiest of the three.
// ---------------------------------------------------------------------------

export const MPU = {
  W: 21.2, // X, the long axis the header runs along
  L: 16.4, // Z
  T: 1.0, // noticeably thinner than the ESP32's 1.6
  corner: 0.8,
  pinCount: 8,
  pitch: 2.54,
  padR: 0.9, // 1.8mm plated ring
  holeR: 0.5,
  mountR: 1.5, // 3.0mm
  headerZ: -MPUZ(),
};

function MPUZ() {
  return 16.4 / 2 - 1.6;
}

const C = {
  mask: 0x1f52a8,
  fr4: 0xc9bf9e,
  pad: 0xc9ccd0,
  chip: 0x18181c,
  chipLead: 0xc0c4c8,
  tantalum: 0xd9a338,
  tantalumBand: 0x8a6420,
  sot: 0x141418,
  copper: 0xb87a4e,
};

// Top face, left to right. This is REVERSED from the bottom-face view, which
// is where it is easy to get wrong: image 2 shows VCC first only because you
// are looking through the board.
const PINS = ["INT", "AD0", "XCL", "XDA", "SDA", "SCL", "GND", "VCC"];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function pinX(i) {
  return -((MPU.pinCount - 1) * MPU.pitch) / 2 + i * MPU.pitch;
}

// --- textures --------------------------------------------------------------
// 1024 across 21.2mm is 48 px/mm — a higher texel density than the ESP32 gets
// at 2048 across 51.5mm, which is what legibility actually depends on. A 1mm
// pin label lands on 48 pixels. Spending 2048 here would be 96 px/mm and 4x
// the memory for detail the part is too small to ever show.
const TEX = { colour: 1024, data: 512 };

function paint(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
}

// Shared coordinate helpers so every map lands in register.
function mapper(w, h) {
  const PX = w / MPU.W;
  return {
    PX,
    x: (mm) => w / 2 + mm * PX,
    z: (mm) => h / 2 + mm * PX,
  };
}

function axisDiagram(ctx, m, cx, cz, ink) {
  // The X/Y/Z rotation glyph. It is the visual signature of this specific
  // board — anyone who has handled a GY-521 recognises it instantly.
  const px = m.x(cx);
  const pz = m.z(cz);
  const r = 1.9 * m.PX;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, 0.13 * m.PX);
  ctx.lineCap = "round";
  const arm = (dx, dz) => {
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + dx * r, pz + dz * r);
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    ctx.moveTo(px + dx * r, pz + dz * r);
    ctx.lineTo(px + dx * r - (dx + dz) * 0.28 * r, pz + dz * r - (dz - dx) * 0.28 * r);
    ctx.lineTo(px + dx * r - (dx - dz) * 0.28 * r, pz + dz * r - (dz + dx) * 0.28 * r);
    ctx.closePath();
    ctx.fill();
  };
  arm(1, 0); // X
  arm(0, -1); // Y
  arm(-0.62, 0.62); // Z, drawn oblique
  // curved rotation arrows around two of the axes
  ctx.lineWidth = Math.max(1, 0.1 * m.PX);
  ctx.beginPath();
  ctx.arc(px + r * 0.55, pz, r * 0.42, -0.9, 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, pz - r * 0.55, r * 0.42, 0.5, 3.3);
  ctx.stroke();
}

function drawTop(ctx, w, h, mode) {
  const m = mapper(w, h);
  const ink =
    mode === "colour"
      ? { mask: "#1f52a8", silk: "#e6ebf2", pad: "#c9ccd0", trace: "#1a468f" }
      : mode === "rough"
      ? { mask: rgbG(0.44), silk: rgbG(0.8), pad: rgbG(0.3), trace: rgbG(0.44) }
      : { mask: "#202020", silk: "#c0c0c0", pad: "#303030", trace: "#3a3a3a" };

  ctx.fillStyle = ink.mask;
  ctx.fillRect(0, 0, w, h);

  // faint darker blue where traces run under the mask
  ctx.strokeStyle = ink.trace;
  ctx.lineWidth = 0.35 * m.PX;
  const rnd = rng(4242);
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    let px = rnd() * w;
    let pz = rnd() * h;
    ctx.moveTo(px, pz);
    for (let s = 0; s < 3; s++) {
      px += (rnd() - 0.5) * w * 0.2;
      pz += (rnd() - 0.5) * h * 0.25;
      ctx.lineTo(px, pz);
    }
    ctx.stroke();
  }

  // plated rings at the header holes
  for (let i = 0; i < MPU.pinCount; i++) {
    ctx.fillStyle = ink.pad;
    ctx.beginPath();
    ctx.arc(m.x(pinX(i)), m.z(-MPU.headerZ), MPU.padR * m.PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink.mask;
    ctx.beginPath();
    ctx.arc(m.x(pinX(i)), m.z(-MPU.headerZ), MPU.holeR * m.PX * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pin labels, printed VERTICALLY reading outward. The rotation is
  // distinctive to this board; printed horizontally it looks like a different
  // part entirely.
  ctx.fillStyle = ink.silk;
  const fs = Math.round(1.05 * m.PX);
  ctx.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (let i = 0; i < MPU.pinCount; i++) {
    ctx.save();
    ctx.translate(m.x(pinX(i)), m.z(-MPU.headerZ + 1.5));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(PINS[i], 0, 0);
    ctx.restore();
  }

  // part number across the bottom
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(1.9 * m.PX)}px "Space Grotesk", Inter, sans-serif`;
  ctx.fillText("MPU-6050", m.x(1.5), m.z(6.4));

  axisDiagram(ctx, m, -7.2, 4.4, ink.silk);

  // SMD footprint pads
  ctx.fillStyle = ink.pad;
  const padRect = (x, z, dx, dz) =>
    ctx.fillRect(m.x(x - dx / 2), m.z(z - dz / 2), dx * m.PX, dz * m.PX);
  const rnd2 = rng(777);
  for (let i = 0; i < 17; i++) {
    const x = -7 + rnd2() * 14;
    const z = -3.5 + rnd2() * 8;
    padRect(x - 0.7, z, 0.5, 1.0);
    padRect(x + 0.7, z, 0.5, 1.0);
  }

  if (mode === "rough") {
    ctx.globalAlpha = 0.1;
    const r3 = rng(99);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = r3() > 0.5 ? "#cfcfcf" : "#8a8a8a";
      ctx.fillRect(r3() * w, r3() * h, 2 + r3() * 18, 1.2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawBottom(ctx, w, h, mode) {
  const m = mapper(w, h);
  const ink =
    mode === "colour"
      ? { mask: "#1f52a8", silk: "#e6ebf2", pad: "#c9ccd0", copper: "#b87a4e" }
      : { mask: rgbG(0.44), silk: rgbG(0.8), pad: rgbG(0.3), copper: rgbG(0.45) };
  ctx.fillStyle = ink.mask;
  ctx.fillRect(0, 0, w, h);

  // Exposed routing — the bottom carries almost no components, so the traces
  // are the thing you actually see down here.
  ctx.strokeStyle = ink.copper;
  ctx.lineWidth = 0.42 * m.PX;
  ctx.lineJoin = "round";
  for (let i = 0; i < MPU.pinCount; i++) {
    ctx.beginPath();
    ctx.moveTo(m.x(pinX(i)), m.z(-MPU.headerZ));
    ctx.lineTo(m.x(pinX(i)), m.z(-MPU.headerZ + 2.2 + i * 0.5));
    ctx.lineTo(m.x(pinX(i) + (i - 3.5) * 0.8), m.z(1.5 + (i % 3) * 1.2));
    ctx.stroke();
  }

  for (let i = 0; i < MPU.pinCount; i++) {
    ctx.fillStyle = ink.pad;
    ctx.beginPath();
    ctx.arc(m.x(pinX(i)), m.z(-MPU.headerZ), MPU.padR * m.PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink.mask;
    ctx.beginPath();
    ctx.arc(m.x(pinX(i)), m.z(-MPU.headerZ), MPU.holeR * m.PX * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // labels here run horizontally, unlike the top face
  ctx.fillStyle = ink.silk;
  ctx.font = `600 ${Math.round(0.95 * m.PX)}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (let i = 0; i < MPU.pinCount; i++) {
    ctx.fillText(PINS[i], m.x(pinX(i)), m.z(-MPU.headerZ + 2.0));
  }

  // and the part number runs diagonally
  ctx.save();
  ctx.translate(m.x(-1), m.z(3.6));
  ctx.rotate(-0.32);
  ctx.font = `700 ${Math.round(2.4 * m.PX)}px "Space Grotesk", Inter, sans-serif`;
  ctx.fillText("MPU-6050", 0, 0);
  ctx.restore();
}

function rgbG(v) {
  const g = Math.round(v * 255);
  return `rgb(${g},${g},${g})`;
}

function normalFromHeight(canvas, strength) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext("2d").getImageData(0, 0, w, h).data;
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

// --- slab with three material slots ----------------------------------------
function boardSlab() {
  const { W, L, T, corner } = MPU;
  const shape = new THREE.Shape();
  const x = -W / 2, y = -L / 2, r = corner;
  shape.moveTo(x + r, y);
  shape.lineTo(x + W - r, y);
  shape.absarc(x + W - r, y + r, r, -Math.PI / 2, 0);
  shape.lineTo(x + W, y + L - r);
  shape.absarc(x + W - r, y + L - r, r, 0, Math.PI / 2);
  shape.lineTo(x + r, y + L);
  shape.absarc(x + r, y + L - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);

  const bores = [];
  const circle = (cx, cz, rad, seg) => {
    const p = new THREE.Path();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = cx + Math.cos(a) * rad;
      const pz = cz + Math.sin(a) * rad;
      if (i === 0) p.moveTo(px, pz);
      else p.lineTo(px, pz);
    }
    shape.holes.push(p);
    bores.push({ x: cx, z: cz, r: rad });
  };
  // the eight header holes, bored for real — they are large and prominent
  for (let i = 0; i < MPU.pinCount; i++) circle(pinX(i), -MPU.headerZ, MPU.holeR, 8);
  // and both mounting holes, well inboard of the corners
  circle(-W / 2 + 3.2, L / 2 - 3.4, MPU.mountR, 12);
  circle(W / 2 - 3.2, L / 2 - 3.4, MPU.mountR, 12);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: T,
    bevelEnabled: false,
    curveSegments: 4,
  });
  // rotateX(-90) already maps the extrusion onto +Y — no further translate, or
  // the board floats and anything sitting on it ends up inside it.
  geo.rotateX(-Math.PI / 2);
  return { geo, bores };
}

function splitSlab(geo, bores) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const tris = pos.count / 3;
  const bins = [[], [], []]; // top, bottom, edge
  for (let t = 0; t < tris; t++) {
    const ny = (nor.getY(t * 3) + nor.getY(t * 3 + 1) + nor.getY(t * 3 + 2)) / 3;
    bins[ny > 0.7 ? 0 : ny < -0.7 ? 1 : 2].push(t);
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
      U[k * 6 + v * 2] = (pos.getX(s) + MPU.W / 2) / MPU.W;
      U[k * 6 + v * 2 + 1] = (pos.getZ(s) + MPU.L / 2) / MPU.L;
    }
  });
  void bores;
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
// `shared` carries the ESP32's materials so the header plastic, pins, solder
// fillets and FR4 edge are literally the same instances rather than duplicates
// with the same numbers in them.
export function buildMpu6050(maxAnisotropy = 1, shared = null) {
  const textures = [];
  const track = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAnisotropy;
    textures.push(t);
    return t;
  };

  const wide = (w) => [w, Math.round((w * MPU.L) / MPU.W)];
  const topColour = track(paint(...wide(TEX.colour), (c, w, h) => drawTop(c, w, h, "colour")), true);
  const topRough = track(paint(...wide(TEX.data), (c, w, h) => drawTop(c, w, h, "rough")), false);
  const topNormal = track(
    normalFromHeight(paint(...wide(TEX.data), (c, w, h) => drawTop(c, w, h, "height")), 1.1),
    false
  );
  const botColour = track(paint(...wide(TEX.colour), (c, w, h) => drawBottom(c, w, h, "colour")), true);
  const botRough = track(paint(...wide(TEX.data), (c, w, h) => drawBottom(c, w, h, "rough")), false);

  const M = {
    top: new THREE.MeshStandardMaterial({
      map: topColour,
      roughnessMap: topRough,
      normalMap: topNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      metalness: 0,
      roughness: 1,
    }),
    bottom: new THREE.MeshStandardMaterial({ map: botColour, roughnessMap: botRough, metalness: 0, roughness: 1 }),
    edge: shared?.edge ?? new THREE.MeshStandardMaterial({ color: C.fr4, metalness: 0, roughness: 0.85 }),
    headerPlastic: shared?.headerPlastic ?? new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0, roughness: 0.52 }),
    pin: shared?.pin ?? new THREE.MeshStandardMaterial({ color: 0xc6cace, metalness: 1, roughness: 0.34 }),
    fillet: shared?.fillet ?? new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 1, roughness: 0.22 }),
    plating: new THREE.MeshStandardMaterial({ color: C.pad, metalness: 1, roughness: 0.3 }),
    chip: new THREE.MeshStandardMaterial({ color: C.chip, metalness: 0, roughness: 0.6 }),
    chipLead: new THREE.MeshStandardMaterial({ color: C.chipLead, metalness: 1, roughness: 0.28 }),
    tantalum: new THREE.MeshStandardMaterial({ color: C.tantalum, metalness: 0, roughness: 0.36 }),
    tantalumBand: new THREE.MeshStandardMaterial({ color: C.tantalumBand, metalness: 0, roughness: 0.4 }),
    sot: new THREE.MeshStandardMaterial({ color: C.sot, metalness: 0, roughness: 0.62 }),
  };

  const g = new THREE.Group();
  const { geo, bores } = boardSlab();
  g.add(new THREE.Mesh(splitSlab(geo, bores), [M.top, M.bottom, M.edge]));
  geo.dispose();

  const T = MPU.T;

  // plated rings around the two mounting holes
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(MPU.mountR, MPU.mountR + 0.45, 16), M.plating);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(sx * (MPU.W / 2 - 3.2), T + 0.01, MPU.L / 2 - 3.4);
    g.add(ring);
  }

  // --- header: strip, instanced pins, instanced fillets ---
  // ASSUMPTION, and it is a build decision rather than a fact about the part:
  // the header ships loose and unsoldered, so which way it faces is the
  // builder's choice. Pins point DOWN here, matching the ESP32, so the board
  // sits flat with its pins through the frame. Flip this one line if the
  // physical build went the other way.
  const PINS_DOWN = true;
  const span = (MPU.pinCount - 1) * MPU.pitch;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(span + 2.5, 2.5, 2.5), M.headerPlastic);
  strip.position.set(0, PINS_DOWN ? T + 1.25 : T + 1.25, -MPU.headerZ);
  g.add(strip);

  const pinGeo = new THREE.BoxGeometry(0.64, 8.5, 0.64);
  const pins = new THREE.InstancedMesh(pinGeo, M.pin, MPU.pinCount);
  const filletGeo = new THREE.ConeGeometry(0.6, 0.55, 7);
  const fillets = new THREE.InstancedMesh(filletGeo, M.fillet, MPU.pinCount);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const rnd = rng(20260904);
  for (let i = 0; i < MPU.pinCount; i++) {
    // a cheap header is not perfectly square; a fraction of a degree of lean
    // on a couple of pins is enough
    const lean = (rnd() - 0.5) * 0.045;
    e.set(lean, 0, (rnd() - 0.5) * 0.03);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(pinX(i), T + 2.5 - 8.5 / 2, -MPU.headerZ), q, one);
    pins.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(pinX(i), T + 0.24, -MPU.headerZ), new THREE.Quaternion(), one);
    fillets.setMatrixAt(i, m4);
  }
  pins.instanceMatrix.needsUpdate = true;
  fillets.instanceMatrix.needsUpdate = true;
  // instances sit well away from the mesh origin, so the bounds have to be
  // recomputed or the whole row gets frustum-culled
  pins.computeBoundingSphere();
  fillets.computeBoundingSphere();
  g.add(pins, fillets);

  // --- MPU-6050 QFN, dead centre and slightly above middle ---
  const chip = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.9, 4.0), M.chip);
  chip.position.set(0, T + 0.1 + 0.45, -0.6);
  g.add(chip);
  // castellated leads on all four sides
  const leadGeo = new THREE.BoxGeometry(0.28, 0.3, 0.5);
  const leads = new THREE.InstancedMesh(leadGeo, M.chipLead, 12);
  let li = 0;
  for (let s = 0; s < 4; s++) {
    for (let k = -1; k <= 1; k++) {
      e.set(0, (s * Math.PI) / 2, 0);
      q.setFromEuler(e);
      const off = new THREE.Vector3(k * 1.2, 0, 2.05).applyEuler(e);
      m4.compose(new THREE.Vector3(off.x, T + 0.25, -0.6 + off.z), q, one);
      leads.setMatrixAt(li++, m4);
    }
  }
  leads.instanceMatrix.needsUpdate = true;
  leads.computeBoundingSphere();
  g.add(leads);

  // --- tantalum: the tallest part on the board and its only warm accent ---
  const tant = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.6), M.tantalum);
  tant.position.set(-0.4, T + 0.65, 3.6);
  g.add(tant);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.32, 1.62), M.tantalumBand);
  band.position.set(-0.4 + 1.3, T + 0.65, 3.6);
  g.add(band);

  // --- SOT-23 regulator, upper right ---
  const sot = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.1, 1.6), M.sot);
  sot.position.set(6.6, T + 0.55, -3.4);
  g.add(sot);
  for (const [dx, dz] of [[-0.9, 0.95], [0.9, 0.95], [0, -0.95]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.55), M.chipLead);
    leg.position.set(6.6 + dx, T + 0.12, -3.4 + dz);
    g.add(leg);
  }

  // --- SMD passives: a handful instanced, the rest live in the texture ---
  {
    const n = 14;
    const smdGeo = new THREE.BoxGeometry(1.0, 0.45, 1.6);
    const smd = new THREE.InstancedMesh(smdGeo, M.chip, n);
    const r2 = rng(5150);
    for (let i = 0; i < n; i++) {
      const x = -7 + r2() * 14;
      const z = -3.5 + r2() * 8;
      e.set(0, r2() > 0.5 ? Math.PI / 2 : 0, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, T + 0.22, z), q, one);
      smd.setMatrixAt(i, m4);
    }
    smd.instanceMatrix.needsUpdate = true;
    smd.computeBoundingSphere();
    g.add(smd);
  }

  let triangles = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const q2 = o.geometry;
    triangles += ((q2.index ? q2.index.count : q2.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });

  return { group: g, textures, triangles, materials: M };
}
