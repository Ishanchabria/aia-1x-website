import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// ---------------------------------------------------------------------------
// ESP32 DevKit V1, rebuilt from reference photography.
//
// AXES. The brief calls the long axis X. This module keeps the drone's own
// convention instead, because the board has to sit in an existing stack:
//   local X = 28.5mm short axis      local Z = 51.5mm long axis      Y = up
// So the brief's "-X module end" is +Z here, and its "+X USB end" is -Z.
//
// PALETTE. This board is a warm object inside a cool drone, deliberately. The
// gold shield, cream FR4 edge, orange tantalum and brass pads are all warm and
// none of them may be cool-shifted to match the frame — a real ESP32 is warm,
// and that contrast is what makes it the focal point of the electronics stack.
// ---------------------------------------------------------------------------

export const BOARD = {
  L: 51.5, // long axis (Z)
  W: 28.5, // short axis (X)
  T: 1.6, // thickness
  corner: 1.5,
  holeR: 1.6,
  pinCount: 15,
  pitch: 2.54,
  moduleL: 25.5,
  moduleW: 18.0,
  moduleT: 3.1,
  shieldL: 20.0,
};

const C = {
  mask: 0x0d0d10,
  fr4: 0xc9bf9e,
  shield: 0xbfa878,
  castellation: 0xd4b45a,
  headerPlastic: 0x111114,
  pin: 0xc6cace,
  fillet: 0xb9bdc2,
  usb: 0xd2d6da,
  cavity: 0x08080a,
  buttonBase: 0x0f0f12,
  buttonDome: 0xc8ccd0,
  tantalum: 0xd98624,
  icEpoxy: 0x121215,
  icLead: 0xc0c4c8,
  whiteSmd: 0xe8e6e0,
  plating: 0xc6cace,
};

// Pin labels, read off the board. Both rows run from the module end toward the
// USB end, i.e. +Z to -Z.
const LABELS_A = ["EN","VP","VN","D34","D35","D32","D33","D25","D26","D27","D14","D12","D13","GND","VIN"];
const LABELS_B = ["D23","D22","TX0","RX0","D21","D19","D18","D5","TX2","RX2","D4","D2","D15","GND","3V3"];

// --- texture plumbing ------------------------------------------------------
// Colour maps are sRGB; roughness and normal maps carry data, not colour, and
// must stay linear or three applies a transfer curve to them.
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function colourTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dataTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Height field -> tangent-space normal map, by Sobel. Used for the silkscreen
// lip and the copper traces sitting under the solder mask: individually both
// are far too faint to notice, and together they are what stops the face
// reading as a printed decal.
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
  const c = makeCanvas(w, h);
  c.getContext("2d").putImageData(out, 0, 0);
  return c;
}

// --- the board's top face --------------------------------------------------
// One draw routine feeding three maps. Drawing them separately guarantees they
// drift out of registration eventually; this way the silkscreen, its roughness
// and its height are the same shapes by construction.
//
// mode: "colour" | "rough" | "height"
function drawBoardTop(ctx, w, h, mode) {
  const PX = w / BOARD.L; // px per mm, isotropic by construction
  const zx = (z) => w / 2 + z * PX; // board +Z -> canvas right
  const xy = (x) => h / 2 - x * PX; // board +X -> canvas up

  const ink = {
    // mask 0.62, silkscreen 0.85, exposed pad 0.25
    mask: mode === "colour" ? "#0d0d10" : mode === "rough" ? "#9e9e9e" : "#202020",
    // Silkscreen is off-white ink, not a light source. At #e9e9e4 the bloom
    // pass picked it up and the whole face blew out.
    silk: mode === "colour" ? "#b9bab4" : mode === "rough" ? "#d9d9d9" : "#c8c8c8",
    // Tin over copper reads mid-grey under this lighting, not white.
    pad: mode === "colour" ? "#8d9297" : mode === "rough" ? "#404040" : "#303030",
    hole: mode === "colour" ? "#050506" : mode === "rough" ? "#8a8a8a" : "#101010",
    trace: mode === "height" ? "#3a3a3a" : null,
  };

  ctx.fillStyle = ink.mask;
  ctx.fillRect(0, 0, w, h);

  // Copper traces under the mask. Colour map ignores them — they are only a
  // height variation, which is exactly how they read on a real board.
  if (ink.trace) {
    ctx.strokeStyle = ink.trace;
    ctx.lineWidth = 2.4 * (PX / 40);
    ctx.lineCap = "round";
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      let px = rnd() * w;
      let py = rnd() * h;
      ctx.moveTo(px, py);
      for (let seg = 0; seg < 3; seg++) {
        px += (rnd() - 0.5) * w * 0.16;
        py += (rnd() - 0.5) * h * 0.3;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // Silkscreen: pin labels, parallel to the long axis, just inboard of each pin
  const fs = Math.round(0.62 * PX * 1.05);
  ctx.font = `600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillStyle = ink.silk;
  ctx.textBaseline = "middle";
  const span = (BOARD.pinCount - 1) * BOARD.pitch;
  for (let i = 0; i < BOARD.pinCount; i++) {
    const z = span / 2 - i * BOARD.pitch;
    const cx = zx(z);
    // Inboard of the header, not under it: the plastic strip spans 11.4-13.9mm
    // from centre, so anything printed at 11.65 is hidden by the connector.
    for (const [labels, labelX] of [
      [LABELS_A, -10.1],
      [LABELS_B, 10.1],
    ]) {
      ctx.textAlign = "center";
      ctx.fillText(labels[i], cx, xy(labelX));
    }
  }

  // Through-hole pads: annular rings with a dark barrel, not solid discs. A
  // filled disc is both wrong and much brighter, and at 1.7mm across it was
  // wider than the hole it is supposed to surround.
  for (let i = 0; i < BOARD.pinCount; i++) {
    const z = span / 2 - i * BOARD.pitch;
    for (const edgeX of [-BOARD.W / 2 + 1.27, BOARD.W / 2 - 1.27]) {
      ctx.fillStyle = ink.pad;
      ctx.beginPath();
      ctx.arc(zx(z), xy(edgeX), 0.72 * PX, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink.hole;
      ctx.beginPath();
      ctx.arc(zx(z), xy(edgeX), 0.42 * PX, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // SMD pads are slivers either side of a footprint, not a slab under it — the
  // part covers the middle, and only the ends of the pads are ever visible.
  ctx.fillStyle = ink.pad;
  const padPair = (z, x, dz, dx, along = "z") => {
    const t = 0.55;
    if (along === "z") {
      ctx.fillRect(zx(z - dz / 2 - t), xy(x + dx / 2), t * PX, dx * PX);
      ctx.fillRect(zx(z + dz / 2), xy(x + dx / 2), t * PX, dx * PX);
    } else {
      ctx.fillRect(zx(z - dz / 2), xy(x + dx / 2 + t), dz * PX, t * PX);
      ctx.fillRect(zx(z - dz / 2), xy(x - dx / 2), dz * PX, t * PX);
    }
  };
  padPair(-2.0, 6.5, 5.0, 4.4);
  padPair(-14.0, -6.0, 6.5, 3.5);
  padPair(3.5, -9.0, 3.5, 2.8);
  padPair(-11.0, 8.0, 3.2, 2.2);

  let s2 = 90210;
  const rnd2 = () => ((s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 26; i++) {
    const z = -22 + rnd2() * 32;
    const x = -10 + rnd2() * 20;
    padPair(z, x, 1.0, 0.7);
  }

  // Silkscreen outlines and designators. Thin: a real silkscreen line is about
  // 0.15mm, and at the width this was drawn before it read as a white frame
  // painted round every part.
  ctx.strokeStyle = ink.silk;
  ctx.lineWidth = Math.max(1, 0.1 * PX);
  const outline = (z, x, dz, dx) =>
    ctx.strokeRect(zx(z - dz / 2), xy(x + dx / 2), dz * PX, dx * PX);
  outline(-2.0, 6.5, 6.0, 5.6);
  outline(-14.0, -6.0, 7.2, 4.6);
  outline(3.5, -9.0, 4.2, 3.4);
  ctx.fillStyle = ink.silk;
  ctx.font = `500 ${Math.round(0.5 * PX * 1.05)}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.fillText("U2", zx(-2.0) + 0.2 * PX, xy(10.2));
  ctx.fillText("U1", zx(-14.0) + 0.2 * PX, xy(-9.6));
  // polarity bar on the tantalum
  ctx.fillRect(zx(5.0), xy(-7.6), 0.35 * PX, 2.6 * PX);

  // Handling marks. A perfectly uniform mask is one of the clearest tells that
  // a PCB is CG; real ones are scuffed. Roughness only — no colour shift.
  if (mode === "rough") {
    ctx.globalAlpha = 0.14;
    let s3 = 4242;
    const rnd3 = () => ((s3 = (s3 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rnd3() > 0.5 ? "#c8c8c8" : "#7a7a7a";
      const bw = (2 + rnd3() * 26) * (PX / 40);
      ctx.fillRect(rnd2() * w, rnd3() * h, bw, bw * 0.12);
    }
    ctx.globalAlpha = 1;
  }
}

function drawBoardBottom(ctx, w, h, mode) {
  const PX = w / BOARD.L;
  const zx = (z) => w / 2 + z * PX;
  const xy = (x) => h / 2 - x * PX;
  ctx.fillStyle = mode === "colour" ? "#0d0d10" : "#9e9e9e";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = mode === "colour" ? "#cfd4d8" : "#404040";
  const span = (BOARD.pinCount - 1) * BOARD.pitch;
  for (let i = 0; i < BOARD.pinCount; i++) {
    const z = span / 2 - i * BOARD.pitch;
    for (const edgeX of [-BOARD.W / 2 + 1.27, BOARD.W / 2 - 1.27]) {
      ctx.beginPath();
      ctx.arc(zx(z), xy(edgeX), 0.95 * PX, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- the shield's printed face ---------------------------------------------
function drawShield(ctx, w, h, mode) {
  // Print is matte on a satin ground: in the roughness map the text is
  // noticeably rougher than the metal around it.
  const silk = mode === "colour" ? "#3b3a36" : "#e0e0e0";
  // Exactly the specified 0xbfa878. I had drifted this to #c9b487 when drawing
  // the map, which is ~5% brighter and was enough to push the shield above the
  // motors in the brightness hierarchy.
  ctx.fillStyle = mode === "colour" ? "#bfa878" : "#7a7a7a";
  ctx.fillRect(0, 0, w, h);

  if (mode === "rough") {
    // brushed satin: fine directional streaks along the long axis
    ctx.globalAlpha = 0.25;
    let s = 77;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "#8d8d8d" : "#6a6a6a";
      ctx.fillRect(rnd() * w, rnd() * h, (20 + rnd() * 120) * (w / 1024), 1);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = silk;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const S = w / 1024;
  ctx.font = `700 ${Math.round(96 * S)}px "Space Grotesk", Inter, sans-serif`;
  ctx.fillText("ESP-32", w * 0.42, h * 0.3);
  ctx.font = `500 ${Math.round(40 * S)}px Inter, sans-serif`;
  ctx.fillText("WiFi+BT SoC Inside", w * 0.52, h * 0.47);
  ctx.font = `500 ${Math.round(34 * S)}px Inter, sans-serif`;
  ctx.fillText("ISM24G 802.11/b/g/n", w * 0.5, h * 0.78);

  // certification marks and radio logos, as blocky glyph stand-ins
  ctx.font = `700 ${Math.round(44 * S)}px Inter, sans-serif`;
  ctx.fillText("FC", w * 0.74, h * 0.62);
  ctx.fillText("CE", w * 0.86, h * 0.62);
  // wifi arcs
  ctx.strokeStyle = silk;
  ctx.lineWidth = 5 * S;
  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.arc(w * 0.2, h * 0.66, r * 12 * S, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.66, 4 * S, 0, Math.PI * 2);
  ctx.fill();
  // bluetooth rune
  ctx.lineWidth = 6 * S;
  ctx.beginPath();
  const bx = w * 0.31, by = h * 0.66, bs = 26 * S;
  ctx.moveTo(bx, by - bs); ctx.lineTo(bx + bs * 0.6, by - bs * 0.4);
  ctx.lineTo(bx - bs * 0.6, by + bs * 0.4); ctx.lineTo(bx, by + bs);
  ctx.lineTo(bx, by - bs);
  ctx.stroke();

  // vent hole near a corner
  ctx.fillStyle = mode === "colour" ? "#14130f" : "#5a5a5a";
  ctx.beginPath();
  ctx.arc(w * 0.9, h * 0.24, 9 * S, 0, Math.PI * 2);
  ctx.fill();
}

function drawAntenna(ctx, w, h) {
  ctx.fillStyle = "#0d0d10";
  ctx.fillRect(0, 0, w, h);
  // meandered inverted-F trace
  ctx.strokeStyle = "#c9a54e";
  ctx.lineWidth = h * 0.07;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  const x0 = w * 0.12, x1 = w * 0.88, top = h * 0.22, bot = h * 0.78;
  let up = true;
  ctx.moveTo(x0, bot);
  const cols = 7;
  for (let i = 0; i <= cols; i++) {
    const x = x0 + ((x1 - x0) * i) / cols;
    ctx.lineTo(x, up ? top : bot);
    up = !up;
    ctx.lineTo(x, up ? top : bot);
  }
  ctx.stroke();
}

// --- board slab with three material slots ----------------------------------
// ExtrudeGeometry hands back two groups: caps and walls. The board needs the
// top face, the bottom face and the routed edge to be three different
// materials — the edge in particular is raw FR4, not solder mask, and that
// cream rim is the single strongest "real PCB" cue available.
function boardSlab() {
  const { L, W, T, corner, holeR } = BOARD;
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

  // two mounting holes, bored right through, on opposite corners
  for (const [hx, hz] of [[-W / 2 + 3.0, L / 2 - 3.0], [W / 2 - 3.0, -L / 2 + 3.0]]) {
    const hole = new THREE.Path();
    hole.absarc(hx, hz, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: T,
    bevelEnabled: true,
    // a routed PCB edge is not perfectly square, but the break is tiny
    bevelSize: 0.05,
    bevelThickness: 0.05,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, T, 0); // rest on y=0 like every other board here

  // Re-sort triangles into [top, bottom, edge] by face normal, and rewrite the
  // cap UVs — ExtrudeGeometry emits them in shape units, not 0..1.
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const tris = pos.count / 3;
  const bins = [[], [], []];
  for (let t = 0; t < tris; t++) {
    const ny = (nor.getY(t * 3) + nor.getY(t * 3 + 1) + nor.getY(t * 3 + 2)) / 3;
    bins[ny > 0.7 ? 0 : ny < -0.7 ? 1 : 2].push(t);
  }
  const order = [...bins[0], ...bins[1], ...bins[2]];
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
      U[k * 6 + v * 2] = (pos.getZ(s) + L / 2) / L;
      U[k * 6 + v * 2 + 1] = (pos.getX(s) + W / 2) / W;
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  out.addGroup(0, bins[0].length * 3, 0);
  out.addGroup(bins[0].length * 3, bins[1].length * 3, 1);
  out.addGroup((bins[0].length + bins[1].length) * 3, bins[2].length * 3, 2);
  return out;
}

// ---------------------------------------------------------------------------
export function buildEsp32(maxAnisotropy = 1) {
  const textures = [];
  const track = (t) => {
    t.anisotropy = maxAnisotropy;
    textures.push(t);
    return t;
  };

  // --- maps ---
  // Every draw routine derives its coordinates from `w / BOARD.L`, so the maps
  // stay in registration at any resolution and each one can be sized for what
  // it actually carries.
  //
  // The brief asked for 2048 on the long edge for all of them. Only the colour
  // map gets it. At 2048 across the board this is a 5-map set costing 69.6MB
  // of texture memory for one 51mm component, which is not shippable — and the
  // other maps do not need it. The colour map has to resolve 3-character pin
  // labels; roughness is a low-frequency finish cue with no text to read; the
  // normal map carries a 0.02mm silkscreen lip and trace ridges that are
  // deliberately near-imperceptible; and the brief itself says the underside
  // is never seen, so it gets the minimum that still shows pad rings.
  // Result: 69.6MB -> 24.4MB, with no visible difference on the top face.
  const RES = { colour: 2048, rough: 1024, normal: 1024, bottom: 512, shield: 1024, shieldRough: 512 };
  const wide = (w) => [w, Math.round((w * BOARD.W) / BOARD.L)];
  const paint = (w, h, fn, mode) => {
    const c = makeCanvas(w, h);
    fn(c.getContext("2d"), w, h, mode);
    return c;
  };

  const topColour = track(colourTexture(paint(...wide(RES.colour), drawBoardTop, "colour")));
  const topRough = track(dataTexture(paint(...wide(RES.rough), drawBoardTop, "rough")));
  const topNormal = track(dataTexture(normalFromHeight(paint(...wide(RES.normal), drawBoardTop, "height"), 1.5)));
  const botColour = track(colourTexture(paint(...wide(RES.bottom), drawBoardBottom, "colour")));
  // The shield is a 20mm part. 1024px across it is 51 px/mm — a HIGHER texel
  // density than the board gets at 2048px, which is what legibility actually
  // depends on. Spending 2048 here would cost 4x the memory for less detail
  // per millimetre than the board already has.
  const shieldSize = (w) => [w, Math.round((w * BOARD.moduleW) / BOARD.shieldL)];
  const shieldColour = track(colourTexture(paint(...shieldSize(RES.shield), drawShield, "colour")));
  const shieldRough = track(dataTexture(paint(...shieldSize(RES.shieldRough), drawShield, "rough")));
  const antennaColour = track(colourTexture(paint(512, 384, drawAntenna)));

  // --- materials: one instance per distinct surface, shared across parts ---
  const M = {
    top: new THREE.MeshStandardMaterial({
      map: topColour, roughnessMap: topRough, normalMap: topNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      color: 0xffffff, metalness: 0, roughness: 1,
    }),
    // No roughness map underneath: the brief says the underside is never seen
    // in this scene, and a second 2048 map for a face nobody looks at was the
    // single largest waste in the set.
    bottom: new THREE.MeshStandardMaterial({
      map: botColour, metalness: 0, roughness: 0.62,
    }),
    edge: new THREE.MeshStandardMaterial({ color: C.fr4, metalness: 0, roughness: 0.85 }),
    shield: new THREE.MeshStandardMaterial({
      map: shieldColour, roughnessMap: shieldRough,
      color: 0xffffff, metalness: 1.0, roughness: 1,
      // 0.40, below the polished gunmetal on the motors at 0.5. This is a
      // satin brushed finish reflecting less, NOT the colour darkened -- the
      // spec is explicit that the gold must stay clearly visible.
      envMapIntensity: 0.4,
    }),
    shieldSide: new THREE.MeshStandardMaterial({ color: C.shield, metalness: 1.0, roughness: 0.42, envMapIntensity: 0.4 }),
    modulePcb: new THREE.MeshStandardMaterial({ color: C.mask, metalness: 0, roughness: 0.62 }),
    antenna: new THREE.MeshStandardMaterial({ map: antennaColour, metalness: 0.5, roughness: 0.4 }),
    castellation: new THREE.MeshStandardMaterial({ color: C.castellation, metalness: 1, roughness: 0.28 }),
    headerPlastic: new THREE.MeshStandardMaterial({ color: C.headerPlastic, metalness: 0, roughness: 0.52 }),
    pin: new THREE.MeshStandardMaterial({ color: C.pin, metalness: 1, roughness: 0.34 }),
    fillet: new THREE.MeshStandardMaterial({ color: C.fillet, metalness: 1, roughness: 0.22 }),
    usb: new THREE.MeshStandardMaterial({ color: C.usb, metalness: 1, roughness: 0.2 }),
    cavity: new THREE.MeshStandardMaterial({ color: C.cavity, metalness: 0, roughness: 0.9 }),
    buttonBase: new THREE.MeshStandardMaterial({ color: C.buttonBase, metalness: 0, roughness: 0.55 }),
    buttonDome: new THREE.MeshStandardMaterial({ color: C.buttonDome, metalness: 1, roughness: 0.3 }),
    tantalum: new THREE.MeshStandardMaterial({ color: C.tantalum, metalness: 0, roughness: 0.38 }),
    icEpoxy: new THREE.MeshStandardMaterial({ color: C.icEpoxy, metalness: 0, roughness: 0.68 }),
    icLead: new THREE.MeshStandardMaterial({ color: C.icLead, metalness: 1, roughness: 0.3 }),
    whiteSmd: new THREE.MeshStandardMaterial({ color: C.whiteSmd, metalness: 0, roughness: 0.6 }),
    plating: new THREE.MeshStandardMaterial({ color: C.plating, metalness: 1, roughness: 0.3 }),
    ledRed: new THREE.MeshStandardMaterial({ color: 0x8e2626, metalness: 0, roughness: 0.35 }),
    ledBlue: new THREE.MeshStandardMaterial({ color: 0x24406e, metalness: 0, roughness: 0.35 }),
  };

  const g = new THREE.Group();
  const { L, W, T } = BOARD;

  // --- slab ---
  const slab = new THREE.Mesh(boardSlab(), [M.top, M.bottom, M.edge]);
  g.add(slab);

  // plated rings around the mounting holes
  for (const [hx, hz] of [[-W / 2 + 3.0, L / 2 - 3.0], [W / 2 - 3.0, -L / 2 + 3.0]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(BOARD.holeR, BOARD.holeR + 0.55, 18), M.plating);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(hx, T + 0.01, hz);
    g.add(ring);
  }

  // --- module: PCB + stamped shield + antenna end ---
  // Raised 0.3mm on its solder pads: the shadow gap underneath is what stops it
  // merging into the board.
  const modZ = L / 2 - BOARD.moduleL / 2 + 2.0; // overhangs the -X (here +Z) edge by 2mm
  const modY = T + 0.3;
  const modPcb = new THREE.Mesh(new THREE.BoxGeometry(BOARD.moduleW, 0.8, BOARD.moduleL), M.modulePcb);
  modPcb.position.set(0, modY + 0.4, modZ);
  g.add(modPcb);

  // antenna trace on the exposed end
  const antL = BOARD.moduleL - BOARD.shieldL;
  const ant = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.moduleW * 0.86, antL * 0.82), M.antenna);
  ant.rotation.x = -Math.PI / 2;
  ant.position.set(0, modY + 0.81, modZ + BOARD.moduleL / 2 - antL / 2);
  g.add(ant);

  // The shield is stamped sheet, not a cuboid: a flat top rolling into the
  // sides over a small radius, sitting on a crimped lip.
  const shieldZ = modZ - antL / 2;
  const can = new RoundedBoxGeometry(BOARD.moduleW - 0.5, BOARD.moduleT - 0.9, BOARD.shieldL, 2, 0.42);
  const shield = new THREE.Mesh(can, [M.shieldSide, M.shieldSide, M.shield, M.shieldSide, M.shieldSide, M.shieldSide]);
  shield.position.set(0, modY + 0.8 + (BOARD.moduleT - 0.9) / 2, shieldZ);
  g.add(shield);
  const crimp = new THREE.Mesh(new THREE.BoxGeometry(BOARD.moduleW - 0.1, 0.34, BOARD.shieldL + 0.1), M.shieldSide);
  crimp.position.set(0, modY + 0.92, shieldZ);
  g.add(crimp);

  // castellated pads along the module's long edges — instanced
  const castGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.85, 6, 1, false, 0, Math.PI);
  const castPerSide = 9;
  const cast = new THREE.InstancedMesh(castGeo, M.castellation, castPerSide * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let ci = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < castPerSide; i++) {
      const z = modZ - BOARD.moduleL / 2 + 2.2 + i * ((BOARD.moduleL - 5) / (castPerSide - 1));
      q.setFromEuler(new THREE.Euler(0, side > 0 ? 0 : Math.PI, 0));
      m4.compose(new THREE.Vector3((side * BOARD.moduleW) / 2, modY + 0.4, z), q, new THREE.Vector3(1, 1, 1));
      cast.setMatrixAt(ci++, m4);
    }
  }
  cast.instanceMatrix.needsUpdate = true;
  g.add(cast);

  // --- pin headers: plastic strip, instanced pins, instanced solder fillets ---
  const span = (BOARD.pinCount - 1) * BOARD.pitch;
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, span + 2.5), M.headerPlastic);
    strip.position.set(side * (W / 2 - 1.6), T + 1.25, 0);
    g.add(strip);
  }
  const pinGeo = new THREE.BoxGeometry(0.64, 13.5, 0.64);
  const pins = new THREE.InstancedMesh(pinGeo, M.pin, BOARD.pinCount * 2);
  // Fillets, not rounded pins. Thirty small bright specular points along both
  // edges read as precision far more clearly than rounded pin edges would, at a
  // fraction of the triangles.
  const filletGeo = new THREE.ConeGeometry(0.62, 0.6, 7);
  const fillets = new THREE.InstancedMesh(filletGeo, M.fillet, BOARD.pinCount * 2);
  let pi = 0;
  const I = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < BOARD.pinCount; i++) {
      const z = span / 2 - i * BOARD.pitch;
      const px = side * (W / 2 - 1.6);
      m4.compose(new THREE.Vector3(px, T + 2.5 - 13.5 / 2, z), I, one);
      pins.setMatrixAt(pi, m4);
      m4.compose(new THREE.Vector3(px, T + 0.25, z), I, one);
      fillets.setMatrixAt(pi, m4);
      pi++;
    }
  }
  pins.instanceMatrix.needsUpdate = true;
  fillets.instanceMatrix.needsUpdate = true;
  g.add(pins, fillets);

  // --- micro-USB: a real cavity, not a painted rectangle ---
  const usbZ = -L / 2 + 2.2;
  {
    const outerW = 7.5, outerH = 2.6, depth = 5.9;
    const shell = new THREE.Shape();
    const ow = outerW / 2, oh = outerH / 2;
    shell.moveTo(-ow, -oh);
    shell.lineTo(ow, -oh);
    shell.lineTo(ow, oh);
    shell.lineTo(-ow, oh);
    shell.lineTo(-ow, -oh);
    const mouth = new THREE.Path();
    const iw = ow - 0.45, ih = oh - 0.45;
    mouth.moveTo(-iw, -ih);
    mouth.lineTo(-iw, ih);
    mouth.lineTo(iw, ih);
    mouth.lineTo(iw, -ih);
    mouth.lineTo(-iw, -ih);
    shell.holes.push(mouth);
    // No rotation. The shape's X is the connector's width and its Y is the
    // connector's height, and ExtrudeGeometry pushes along +Z, which is
    // already the board's long axis — the connector lies flat and its mouth
    // faces off the -Z edge. Rotating it here sent the whole shell straight
    // down through the board.
    const frame = new THREE.ExtrudeGeometry(shell, {
      depth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1,
    });
    const mouthZ = -L / 2 - 1.5; // protrudes 1.5mm past the board edge
    const usb = new THREE.Mesh(frame, M.usb);
    usb.position.set(0, T + outerH / 2, mouthZ);
    g.add(usb);
    // dark interior + the plastic tongue, so the opening reads as a hole
    const back = new THREE.Mesh(new THREE.BoxGeometry(outerW - 0.9, outerH - 0.9, 0.4), M.cavity);
    back.position.set(0, T + outerH / 2, mouthZ + depth - 0.5);
    g.add(back);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(outerW - 2.6, 0.45, depth - 1.6), M.cavity);
    tongue.position.set(0, T + outerH / 2, mouthZ + depth / 2 + 0.4);
    g.add(tongue);
    for (const s of [-1, 1]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 1.6), M.usb);
      tab.position.set(s * (outerW / 2 + 0.25), T + 0.18, mouthZ + depth - 1.2);
      g.add(tab);
    }
  }

  // --- tactile buttons flanking the USB ---
  // 4.5mm base, 3.5mm tall including the dome — the dome is a shallow cap, not
  // a hemisphere sitting on a block.
  for (const s of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.0, 4.5), M.buttonBase);
    base.position.set(s * 8.4, T + 1.0, usbZ + 3.4);
    g.add(base);
    // A shallow cap, not a ball. At 1.55 radius it was nearly as wide as the
    // 4.5mm base and read as a chrome sphere; the real dome is a small bright
    // point, so the roughness comes up slightly too.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.38), M.buttonDome);
    dome.position.set(s * 8.4, T + 1.9, usbZ + 3.4);
    g.add(dome);
  }

  // --- ICs ---
  const cp2102 = new THREE.Mesh(new RoundedBoxGeometry(5.0, 0.9, 5.0, 1, 0.12), M.icEpoxy);
  cp2102.position.set(6.5, T + 0.45, -2.0);
  g.add(cp2102);

  const ams = new THREE.Mesh(new RoundedBoxGeometry(3.5, 1.6, 6.5, 1, 0.12), M.icEpoxy);
  ams.position.set(-6.0, T + 0.8, -14.0);
  g.add(ams);
  // SOT-223: three leads one side, one wide tab the other
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.9), M.icLead);
    leg.position.set(-6.0 - 2.0, T + 0.16, -14.0 + (i - 1) * 2.3);
    g.add(leg);
  }
  const tab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 3.4), M.icLead);
  tab.position.set(-6.0 + 2.2, T + 0.16, -14.0);
  g.add(tab);

  // --- tantalum capacitor: the one saturated warm point on the board ---
  const tant = new THREE.Mesh(new RoundedBoxGeometry(2.8, 1.9, 3.5, 1, 0.28), M.tantalum);
  tant.position.set(-9.0, T + 0.95, 3.5);
  g.add(tant);

  // --- white SMD part ---
  const white = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 3.2), M.whiteSmd);
  white.position.set(8.0, T + 0.45, -11.0);
  g.add(white);

  // --- LEDs, unlit ---
  for (const [x, z, mat] of [[10.5, -6.5, M.ledRed], [10.5, -3.5, M.ledBlue]]) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.0), mat);
    led.position.set(x, T + 0.35, z);
    g.add(led);
  }

  // --- scattered 0402-class parts: instanced boxes, ~12 tris each ---
  {
    const n = 22;
    const geo = new THREE.BoxGeometry(1.0, 0.45, 1.6);
    const smd = new THREE.InstancedMesh(geo, M.icEpoxy, n);
    let s = 90210;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < n; i++) {
      const z = -22 + rnd() * 32;
      const x = -10 + rnd() * 20;
      q.setFromEuler(new THREE.Euler(0, rnd() > 0.5 ? Math.PI / 2 : 0, 0));
      m4.compose(new THREE.Vector3(x, T + 0.22, z), q, one);
      smd.setMatrixAt(i, m4);
    }
    smd.instanceMatrix.needsUpdate = true;
    g.add(smd);
  }

  let triangles = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    triangles += tris * (o.isInstancedMesh ? o.count : 1);
  });

  return { group: g, textures, triangles, materials: M };
}
