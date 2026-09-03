import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildEsp32 } from "./esp32.js";
import { buildMotorAssets, buildMotor, twistedPair, resolveFinish, FINISHES } from "./motor.js";
import { buildJumperSet } from "./jumper.js";
import { buildVeroboard } from "./veroboard.js";
import { buildResistors } from "./resistor.js";
import { buildDiodes } from "./diode.js";

// Measured switch, not a preference — see the note in src/diode.js.
export const DIODE_TRANSMISSION = false;

// Real edges catch a highlight; perfectly sharp ones read as CG. Radius is kept
// small (a fabrication-scale edge break) and clamped so it can't collapse a
// thin part. Sub-millimetre repeated parts (header pins, MOSFET legs) stay as
// plain boxes — rounding edges that never resolve on screen costs a lot of
// triangles for nothing.
function roundedBox(w, h, d, radius = 0.25) {
  const r = Math.min(radius, Math.min(w, h, d) * 0.2);
  return new RoundedBoxGeometry(w, h, d, 3, r);
}

// ---------------------------------------------------------------------------
// Units: 1 Three.js unit = 1mm. Drone reads at true ~100mm scale.
// Frame + motors are the fixed anchor (per spec, they never explode).
// Everything else is returned in `parts` with an `origin` (resting local
// position) and an `explode` delta added to it as scroll progress advances.
// `dynamicWires` are rebuilt every frame in main.js since their endpoints move.
// ---------------------------------------------------------------------------

// COOL palette — canvas only. Nothing warm renders inside the 3D scene except
// the real wire colours, which are small enough to read as accurate detail and
// give the eye one warm anchor on an otherwise cold object.
const COLOR = {
  frame: 0x0b0e14,
  accentGlow: 0x3d7dff,
  gunmetal: 0x8f99a8,
  shaft: 0x6e7783,
  propBlack: 0x0a0c10,
  pcbBlack: 0x0f141c,
  shield: 0x9aa3ad,
  usb: 0x9aa3ad,
  button: 0x11151c,
  brass: 0xa8925e,
  pcbBlue: 0x14315e,
  chip: 0x090b0f,
  amber: 0xb07a3c,
  copper: 0x8a6a4a,
  mosfetBody: 0x101318,
  mosfetTab: 0x9aa3ad,
  leg: 0x8d95a0,
  foil: 0x4a505a,
  jst: 0x9aa3ad,
  zipTie: 0x0b0d11,
  // GLOBAL WIRE PALETTE. Every wire on the drone uses these four and only
  // these four — no black, green, brown or purple. Moulded plastic (connector
  // housings, heat-shrink, zip ties) is exempt: this covers insulation only.
  //
  // These are the most saturated things on the drone, deliberately. On real
  // hardware wire colour is the one place vivid colour appears, and it gives
  // the eye an anchor on an otherwise near-monochrome object. Do not
  // desaturate them to fit the blue-black palette.
  wireRed: 0xd93b30,
  wireBlue: 0x2f6bd4,
  wireOrange: 0xe08a2e,
  wireWhite: 0xe8e6e2,
};

// ---- small texture helper: draws a top-face detail (silkscreen/label/grid) ----
function canvasTexture(draw, w = 256, h = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mpuTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#14315e";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("GY-521", w * 0.42, h * 0.28);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    const ax = w * 0.2, ay = h * 0.68;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 22, ay);
    ctx.moveTo(ax + 22, ay);
    ctx.lineTo(ax + 16, ay - 5);
    ctx.moveTo(ax + 22, ay);
    ctx.lineTo(ax + 16, ay + 5);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay - 22);
    ctx.lineTo(ax - 5, ay - 16);
    ctx.moveTo(ax, ay - 22);
    ctx.lineTo(ax + 5, ay - 16);
    ctx.stroke();
  }, 600, 450);
}

// Low-amplitude surface variation. Breaks up the uniform "one plastic in
// different colours" look far more cheaply than added geometry would.
function noiseRoughnessTexture() {
  const tex = canvasTexture((ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 150 + Math.random() * 60;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, 128, 128);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function batteryLabelTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#8d95a0";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.76);
    ctx.fillStyle = "#dfe6ef";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("1S LiPo", w * 0.18, h * 0.42);
    ctx.font = "13px monospace";
    ctx.fillStyle = "rgba(223,230,239,0.75)";
    ctx.fillText("3.7V  400mAh", w * 0.18, h * 0.62);
    ctx.strokeStyle = "#3d7dff";
    ctx.lineWidth = 4;
    ctx.strokeRect(w * 0.08, h * 0.12, w * 0.84, h * 0.76);
  }, 768, 576);
}

// ---------------------------------------------------------------------------
// Propeller blade, lofted from stacked airfoil sections.
//
// The twist is the point of this: geometric pitch runs ~30 deg at the root down
// to ~12 deg at the tip (the tip travels faster, so it needs less pitch). That
// continuously changing surface angle is what a specular highlight travels
// along. A single fixed pitch — which is what this was before — gives a flat
// plate with nothing for the highlight to sweep across, and no amount of
// material tuning recovers it.
// ---------------------------------------------------------------------------
const BLADE_SECTIONS = 16;
const BLADE_PROFILE_PTS = 14;

// Asymmetric section: flat-ish underside, curved upper surface, thin trailing
// edge. Returns points around the profile in chord-normalised space.
function airfoilProfile(thicknessRatio, camber) {
  const pts = [];
  // upper surface, leading edge -> trailing edge
  for (let i = 0; i < BLADE_PROFILE_PTS; i++) {
    const x = i / (BLADE_PROFILE_PTS - 1);
    const thick = thicknessRatio * (1.4 * Math.sqrt(Math.max(x, 0)) - 0.6 * x - 0.2 * x * x);
    const mid = camber * Math.sin(Math.PI * Math.pow(x, 0.85));
    pts.push([x, mid + thick]);
  }
  // lower surface, trailing edge -> leading edge (flatter)
  for (let i = BLADE_PROFILE_PTS - 1; i >= 0; i--) {
    const x = i / (BLADE_PROFILE_PTS - 1);
    const thick = thicknessRatio * (1.4 * Math.sqrt(Math.max(x, 0)) - 0.6 * x - 0.2 * x * x);
    const mid = camber * Math.sin(Math.PI * Math.pow(x, 0.85));
    pts.push([x, mid - thick * 0.35]);
  }
  return pts;
}

// `mirror` flips the blade for the counter-rotating pair. Mirroring a twisted
// surface also reverses winding, so the section order is flipped to compensate
// or the normals invert and the blade renders inside-out.
function buildBladeGeometry(span, mirror) {
  const ring = BLADE_PROFILE_PTS * 2;
  const verts = [];

  for (let s = 0; s < BLADE_SECTIONS; s++) {
    const t = s / (BLADE_SECTIONS - 1);

    // chord: narrow root, widest around half span, rounding off at the tip
    const chord = 4 + 5 * Math.sin(Math.PI * Math.min(t * 1.05, 1)) * (1 - 0.35 * t * t);
    // thickness 12% of chord at root thinning to 6% at tip
    const thickRatio = 0.12 - 0.06 * t;
    const camber = 0.055 * (1 - 0.5 * t);
    // 30deg root -> 12deg tip
    const pitch = THREE.MathUtils.degToRad(30 - 18 * t) * (mirror ? -1 : 1);
    const y = t * span;

    const profile = airfoilProfile(thickRatio, camber);
    for (const [px, py] of profile) {
      // centre the chord, then rotate by the section's pitch
      const cx = (px - 0.4) * chord;
      const cy = py * chord;
      const x = cx * Math.cos(pitch) - cy * Math.sin(pitch);
      const z = cx * Math.sin(pitch) + cy * Math.cos(pitch);
      verts.push(mirror ? -x : x, y, z);
    }
  }

  const position = new Float32Array(verts);
  const indices = [];
  for (let s = 0; s < BLADE_SECTIONS - 1; s++) {
    for (let i = 0; i < ring; i++) {
      const a = s * ring + i;
      const b = s * ring + ((i + 1) % ring);
      const c = (s + 1) * ring + i;
      const d = (s + 1) * ring + ((i + 1) % ring);
      if (mirror) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // blade runs along local +X like the old one did, so callers are unchanged
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

// ---- geometry helpers ----
function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
  return shape;
}

// Extrudes a rounded rect and orients it so local Y=0..depth is UP —
// i.e. the mesh's local origin is its resting (bottom) face. Lets every
// board just be positioned at "the surface it rests on."
function roundedPlate(w, h, depth, radius, bevel = 0.2) {
  const shape = roundedRectShape(w, h, radius);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: Math.min(bevel, depth / 3),
    bevelThickness: Math.min(bevel, depth / 3),
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function pinRow(count, spacing, length, mat, solderMat) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.5, length, 0.5);
  // one shared cone reused as a solder fillet where each pin meets its pad
  const filletGeo = solderMat ? new THREE.ConeGeometry(0.52, 0.55, 8) : null;
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const pin = new THREE.Mesh(geo, mat);
    pin.position.set(start + i * spacing, -length / 2, 0);
    group.add(pin);
    if (filletGeo) {
      const s = new THREE.Mesh(filletGeo, solderMat);
      s.position.set(start + i * spacing, 0.15, 0);
      group.add(s);
    }
  }
  return group;
}

function buildTubeGeometry(from, to, radius, sagAmount, sagSeed = 0) {
  const mid = from.clone().lerp(to, 0.5);
  mid.y -= sagAmount;
  mid.x += Math.sin(sagSeed) * sagAmount * 0.3;
  mid.z += Math.cos(sagSeed) * sagAmount * 0.3;
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  return new THREE.TubeGeometry(curve, 16, radius, 6, false);
}

// Silicone insulation: soft sheen, keeps its real colour. These are the only
// warm notes allowed inside the canvas.
function wireMaterial(color) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.55, clearcoat: 0.4 });
}

let _shrinkMat;
function shrinkMaterial() {
  if (!_shrinkMat) {
    _shrinkMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.72, metalness: 0 });
  }
  return _shrinkMat;
}

function wireMesh(from, to, color, radius = 0.5, sag = 3, seed = 0) {
  // real silicone lead hangs slack; a taut line reads as a rod
  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildTubeGeometry(from, to, radius, sag * 1.7, seed), wireMaterial(color)));
  // heat-shrink sleeve at the soldered end
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.8, radius * 1.8, 1.6, 10),
    shrinkMaterial()
  );
  sleeve.position.copy(from);
  // Object3D.lookAt resolves in world space, but `to` is in the parent's local
  // space — so the old lookAt(to) was aiming at the wrong point. Orient from
  // the segment direction instead: same result, and independent of where this
  // mesh ends up parented.
  const axis = to.clone().sub(from).normalize();
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  group.add(sleeve);
  return group;
}

function makeDynamicWire(color, radius = 0.5) {
  const mat = wireMaterial(color);
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -2, 0)]), 16, radius, 6, false);
  return new THREE.Mesh(geo, mat);
}

function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    n += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  return n;
}

// ---------------------------------------------------------------------------
export function createDrone(maxAnisotropy = 1) {
  const group = new THREE.Group();
  const parts = [];
  const dynamicWires = [];
  const allTextures = [];
  let seed = 0;
  let espTriangles = 0;
  let motorTriangles = 0;
  let jumperTriangles = 0;
  let veroTriangles = 0;
  let veroBoardTriangles = 0;
  let veroHoles = 0;
  let resistorTriangles = 0;
  let diodeTriangles = 0;
  const motorFinish = resolveFinish();
  const motorAssets = buildMotorAssets(motorFinish, maxAnisotropy);
  allTextures.push(motorAssets.rough);
  const track = (tex) => (allTextures.push(tex), (tex.anisotropy = maxAnisotropy), tex);

  const microNoise = track(noiseRoughnessTexture());

  const mats = {
    // anodised / soft-touch dark blue-charcoal — near-black in shadow, cool blue
    // in the highlight. Clearcoat is what makes it read as a finished surface.
    frame: new THREE.MeshPhysicalMaterial({
      color: COLOR.frame,
      metalness: 0.15,
      roughness: 0.46,
      clearcoat: 0.5,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.28,
      roughnessMap: microNoise,
    }),
    accentTrim: new THREE.MeshStandardMaterial({
      color: 0x0a1020,
      emissive: COLOR.accentGlow,
      emissiveIntensity: 2.2,
      roughness: 0.4,
      metalness: 0,
    }),
    gunmetal: new THREE.MeshStandardMaterial({
      color: COLOR.gunmetal,
      metalness: 1,
      // At roughness 0.30 / env 1.15 the can mirrored the HDRI softbox down to
      // a clipped point, which bloom then turned into a small lamp at the motor
      // top. Spreading the reflection keeps the motors the brightest metal in
      // the scene without saturating: 65 clipped pixels -> 0, peak 253.6 -> 249.9.
      roughness: 0.42,
      envMapIntensity: 0.85,
    }),
    shaft: new THREE.MeshStandardMaterial({ color: COLOR.shaft, metalness: 1, roughness: 0.58, envMapIntensity: 0.5 }),
    // glossy near-black: the highlight sweeping the blade twist is what sells it
    propBlack: new THREE.MeshPhysicalMaterial({
      // moulded plastic that catches a highlight, not polished lacquer. The
      // sweep along the blade twist has to survive this — if it goes matte,
      // the twist stops reading.
      color: COLOR.propBlack,
      metalness: 0,
      roughness: 0.3,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.45,
    }),
    pcbBlack: new THREE.MeshStandardMaterial({ color: COLOR.pcbBlack, metalness: 0, roughness: 0.7, roughnessMap: microNoise }),
    shield: new THREE.MeshStandardMaterial({ color: COLOR.shield, metalness: 0.95, roughness: 0.52, envMapIntensity: 0.32 }),
    usb: new THREE.MeshStandardMaterial({ color: COLOR.usb, metalness: 0.95, roughness: 0.32, envMapIntensity: 0.5 }),
    button: new THREE.MeshStandardMaterial({ color: COLOR.button, metalness: 0, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: COLOR.brass, metalness: 1, roughness: 0.3 }),
    pcbBlue: new THREE.MeshStandardMaterial({ color: COLOR.pcbBlue, metalness: 0, roughness: 0.48, roughnessMap: microNoise }),
    chip: new THREE.MeshStandardMaterial({ color: COLOR.chip, metalness: 0, roughness: 0.62 }),
    // Glassy WITHOUT transmission, and that is the whole point. Real
    // transmission makes three.js render the entire opaque scene a second
    // time into a transmission buffer every frame: measured at 280 extra draw
    // calls, 32% of the total, to slightly deepen the amber on four 4mm
    // cylinders that are half-buried in the airframe. Clearcoat over a
    // translucent body is the same read for one draw call.
    amberGlass: new THREE.MeshPhysicalMaterial({
      color: COLOR.amber,
      roughness: 0.16,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.82,
    }),
    copper: new THREE.MeshStandardMaterial({ color: COLOR.copper, metalness: 0.9, roughness: 0.45 }),
    mosfetBody: new THREE.MeshStandardMaterial({ color: COLOR.mosfetBody, metalness: 0, roughness: 0.6 }),
    mosfetTab: new THREE.MeshStandardMaterial({ color: COLOR.mosfetTab, metalness: 0.95, roughness: 0.42, envMapIntensity: 0.6 }),
    leg: new THREE.MeshStandardMaterial({ color: COLOR.leg, metalness: 0.9, roughness: 0.38 }),
    foil: new THREE.MeshStandardMaterial({ color: COLOR.foil, metalness: 0.7, roughness: 0.45 }),
    jst: new THREE.MeshStandardMaterial({ color: COLOR.jst, metalness: 0.2, roughness: 0.55 }),
    zipTie: new THREE.MeshStandardMaterial({ color: COLOR.zipTie, metalness: 0, roughness: 0.65 }),
    solder: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.38 }),
    shrink: new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0, roughness: 0.7 }),
  };

  const mpuTopMat = new THREE.MeshStandardMaterial({ map: track(mpuTexture()), roughness: 0.45 });
  const battLabelMat = new THREE.MeshStandardMaterial({ map: track(batteryLabelTexture()), roughness: 0.4, metalness: 0.3 });

  // ============================= FRAME (anchor) =============================
  const frameGroup = new THREE.Group();
  const plateRadial = 15; // half-width of the center plate footprint
  const plate = new THREE.Mesh(roundedPlate(30, 30, 2, 3), mats.frame);
  frameGroup.add(plate);

  const armLength = 35;
  const armAngles = [45, 135, 225, 315]; // FR, FL, RL, RR (nose = +Z)
  const armRoot = plateRadial;
  const motorTips = [];

  armAngles.forEach((deg) => {
    const rad = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad));

    const shape = new THREE.Shape();
    shape.moveTo(0, 4);
    shape.lineTo(armLength, 5);
    shape.lineTo(armLength, -5);
    shape.lineTo(0, -4);
    shape.closePath();
    const armGeo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 2 });
    armGeo.rotateX(Math.PI / 2);
    // slight upward sweep toward the tip
    const pos = armGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = THREE.MathUtils.clamp(x / armLength, 0, 1);
      pos.setY(i, pos.getY(i) + t * t * 3);
    }
    pos.needsUpdate = true;
    armGeo.computeVertexNormals();

    const armMesh = new THREE.Mesh(armGeo, mats.frame);
    const armPivot = new THREE.Group();
    armPivot.add(armMesh);

    // single inset accent channel per arm — restrained, not a light show
    const channel = new THREE.Mesh(roundedBox(armLength - 6, 0.45, 0.8, 0.12), mats.accentTrim);
    channel.position.set(armLength / 2, 2.1, 0);
    const chPos = channel.geometry.attributes.position;
    for (let i = 0; i < chPos.count; i++) {
      const t = THREE.MathUtils.clamp((chPos.getX(i) + (armLength - 6) / 2 + 3) / armLength, 0, 1);
      chPos.setY(i, chPos.getY(i) + t * t * 3);
    }
    chPos.needsUpdate = true;
    channel.geometry.computeVertexNormals();
    armPivot.add(channel);
    armPivot.position.set(dir.x * armRoot, 1, dir.z * armRoot);
    armPivot.rotation.y = -rad;
    frameGroup.add(armPivot);

    const tipRadial = armRoot + armLength;
    const tip = new THREE.Vector3(dir.x * tipRadial, 1 + 9, dir.z * tipRadial);
    motorTips.push({ tip, dir, deg });

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 12, 20, 1, true), mats.frame);
    tube.position.set(tip.x, 6, tip.z);
    frameGroup.add(tube);

    // screw boss at the motor mount
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 1.6, 12), mats.frame);
    boss.position.set(tip.x * 0.88, 1.4, tip.z * 0.88);
    frameGroup.add(boss);
    const bossHole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 10), mats.chip);
    bossHole.position.copy(boss.position);
    frameGroup.add(bossHole);
    // fillet where the arm meets the centre plate - moulded parts never have
    // sharp internal corners
    const fillet = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, 1.8, 14), mats.frame);
    fillet.position.set(dir.x * (armRoot - 1), 1, dir.z * (armRoot - 1));
    frameGroup.add(fillet);

    const nub = new THREE.Mesh(new THREE.ConeGeometry(2, 3, 10), mats.frame);
    nub.position.set(tip.x, -0.5, tip.z);
    nub.rotation.x = Math.PI;
    frameGroup.add(nub);
  });

  [0, 1, 2, 3].forEach((i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const zip = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.35, 6, 12), mats.zipTie);
    zip.rotation.x = Math.PI / 2;
    zip.position.set(Math.cos(a) * plateRadial * 1.6, 1, Math.sin(a) * plateRadial * 1.6);
    frameGroup.add(zip);
  });

  [[10.5, 10.5], [10.5, -10.5], [-10.5, 10.5], [-10.5, -10.5]].forEach(([x, z]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.2, 12), mats.frame);
    b.position.set(x, 2, z);
    frameGroup.add(b);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 8), mats.chip);
    h.position.set(x, 2.1, z);
    frameGroup.add(h);
  });

  group.add(frameGroup);

  // ============================= MOTORS (anchor) =============================
  const motorWireExits = [];
  motorTips.forEach(({ tip, dir }, i) => {
    // Rebuilt from reference photography — see src/motor.js. No vent holes:
    // the earlier order specified three in the end cap, and the photos show
    // smooth unbroken caps.
    const built = buildMotor(motorAssets, i);
    const motor = built.group;
    motorTriangles += countTriangles(motor);

    // Red/blue and black/white are how the two rotation directions are told
    // apart on the real hardware, so they alternate around the quad rather
    // than being decorative.
    const isRedBlue = i % 2 === 0;
    // Black is gone from the palette; orange reads far better than black did
    // against the blue-black frame while still marking the second pair.
    const wireColors = isRedBlue ? [COLOR.wireRed, COLOR.wireBlue] : [COLOR.wireOrange, COLOR.wireWhite];
    // One twisted pair per motor, leaving the wire-end cap and sagging in to
    // the plate. Built in drone-space so it parents to `group` — adding it to
    // `motor` would offset it by the motor position a second time.
    const from = new THREE.Vector3(tip.x, 0.2, tip.z);
    const to = new THREE.Vector3(dir.x * (plateRadial + 4), 0.5, dir.z * (plateRadial + 4));
    const pair = twistedPair(from, to, wireColors[0], wireColors[1], seed++);
    group.add(pair);
    motorTriangles += countTriangles(pair);
    motorWireExits.push({ point: to.clone(), colors: wireColors });

    motor.position.set(tip.x, 0, tip.z);
    group.add(motor);

    // ---- Propeller (explodes) ----
    const propGroup = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 32), mats.propBlack);
    hub.position.y = 2;
    propGroup.add(hub);
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 16, 1, true), mats.chip);
    bore.position.y = 2;
    propGroup.add(bore);
    const boreChamfer = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 20), mats.shaft);
    boreChamfer.rotation.x = Math.PI / 2;
    boreChamfer.position.y = 4;
    propGroup.add(boreChamfer);

    // CW/CCW pairing: FL(135) + RR(315) share one rotation, FR(45) + RL(225) share the other
    const deg = motorTips[i].deg;
    const spinSign = deg === 135 || deg === 315 ? 1 : -1;

    [0, Math.PI].forEach((rot) => {
      // Outline must stay monotonic along the span — an earlier version doubled
      // back on itself at the tip, which self-intersected, broke triangulation
      // and left that region with garbage normals (it shaded bright even with
      // every light off).
      const bladeGeo = buildBladeGeometry(32.5, spinSign < 0);
      bladeGeo.translate(3, 0, 0);
      const blade = new THREE.Mesh(bladeGeo, mats.propBlack);
      // pitch now lives in the geometry's twist, not a flat rotation
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = rot;
      bladePivot.add(blade);
      propGroup.add(bladePivot);

      // No motion-blur ghosts: the props are now scroll-nudged rather than
      // spun, and at that speed ghosting reads as smearing rather than motion.
    });

    propGroup.position.set(tip.x, 27, tip.z);
    group.add(propGroup);
    parts.push({
      mesh: propGroup,
      origin: propGroup.position.clone(),
      explode: new THREE.Vector3(0, 90, 0),
      spin: spinSign * Math.PI * 6,
      stage: 6,
    });
  });

  // ============================= MPU6050 =============================
  const mpuGroup = new THREE.Group();
  const mpuBoard = new THREE.Mesh(roundedPlate(20, 15, 1, 1.2), mats.pcbBlue);
  mpuGroup.add(mpuBoard);
  const mpuTop = new THREE.Mesh(new THREE.PlaneGeometry(19, 14), mpuTopMat);
  mpuTop.rotation.x = -Math.PI / 2;
  mpuTop.position.y = 1.02;
  mpuGroup.add(mpuTop);
  const mpuChip = new THREE.Mesh(roundedBox(4, 1, 4, 0.1), mats.chip);
  mpuChip.position.set(0, 1.5, 0);
  mpuGroup.add(mpuChip);
  [-6, 6].forEach((z) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 16), mats.brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(7, 1.05, z);
    mpuGroup.add(ring);
  });
  const mpuCap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 10), mats.amberGlass);
  mpuCap.position.set(-6, 2, 5);
  mpuGroup.add(mpuCap);
  const mpuPins = pinRow(8, 1.7, 4, mats.brass, mats.solder);
  mpuPins.position.set(-2, 1, -7.5);
  mpuGroup.add(mpuPins);

  const mpuOrigin = new THREE.Vector3(-6, 2, -6);
  mpuGroup.position.copy(mpuOrigin);
  group.add(mpuGroup);
  parts.push({ mesh: mpuGroup, origin: mpuOrigin.clone(), explode: new THREE.Vector3(0, 18, 0), stage: 4 });

  // ============================= POWER BOARD =============================
  const pbGroup = new THREE.Group();
  // Warm amber paper phenolic with ~99 real bored holes, hand-cut edges and
  // soldered underside — see src/veroboard.js.
  const vero = buildVeroboard(maxAnisotropy);
  vero.textures.forEach((t) => allTextures.push(t));
  veroTriangles = vero.triangles;
  veroBoardTriangles = vero.boardTriangles;
  veroHoles = vero.holeCount;
  pbGroup.add(vero.group);

  for (let m = 0; m < 4; m++) {
    const mosfet = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(4.5, 4.2, 1.6, 0.2), mats.mosfetBody);
    body.position.y = 2.1;
    mosfet.add(body);
    const tab = new THREE.Mesh(roundedBox(4.2, 2, 0.4, 0.08), mats.mosfetTab);
    tab.position.set(0, 4.3, -1);
    mosfet.add(tab);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), mats.mosfetBody);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, 4.3, -1);
    mosfet.add(hole);
    [-1.4, 0, 1.4].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), mats.leg);
      leg.position.set(x, 0.9, 0.8);
      leg.rotation.x = 0.35;
      mosfet.add(leg);
    });
    mosfet.position.set(-9 + m * 6, 1.5, -6);
    pbGroup.add(mosfet);
  }

  // Glass-bodied, with the die and internal leads visible inside — see
  // src/diode.js. Cathode bands all face the same way because they mark
  // polarity; only the roll about the axis varies.
  const diodeSet = buildDiodes(
    [
      { x: -9, z: 1.5 },
      { x: -3, z: 1.5 },
      { x: 3, z: 1.5 },
      { x: 9, z: 1.5 },
    ],
    { baseY: 1.5, boardT: 1.5, transmissive: DIODE_TRANSMISSION }
  );
  diodeTriangles = diodeSet.triangles;
  pbGroup.add(diodeSet.group);

  // Two values, because the bands encode the value and five identical parts
  // would read as wrong to anyone who can decode them. See src/resistor.js.
  // Two staggered rows at 9mm centres. The old row put five 6.3mm bodies on
  // 5mm spacing, so they intersected each other and read as one long tube;
  // staggering also looks hand-placed rather than machine-laid.
  const resistorSet = buildResistors(
    [
      { x: -9, z: 6.5, value: "10k" },
      { x: 0, z: 6.5, value: "1k" },
      { x: 9, z: 6.5, value: "10k" },
      { x: -4.5, z: 10.4, value: "1k" },
      { x: 4.5, z: 10.4, value: "10k" },
    ],
    maxAnisotropy,
    1.5, // the Vero board top surface
    1.5  // and its thickness, so the leads pass through it
  );
  resistorSet.textures.forEach((t) => allTextures.push(t));
  resistorTriangles = resistorSet.triangles;
  pbGroup.add(resistorSet.group);

  [0, 1, 2].forEach((w) => {
    const from = new THREE.Vector3(-9 + w * 6, 3.5, -6);
    const to = new THREE.Vector3(-9 + (w + 1) * 6, 3.5, 2);
    pbGroup.add(wireMesh(from, to, w % 2 ? COLOR.wireBlue : COLOR.wireRed, 0.35, 1, seed++));
  });

  const pbOrigin = new THREE.Vector3(3, 2, 4);
  pbGroup.position.copy(pbOrigin);
  group.add(pbGroup);
  parts.push({ mesh: pbGroup, origin: pbOrigin.clone(), explode: new THREE.Vector3(0, 15, 0), stage: 3 });

  // ============================= ESP32 =============================
  // Rebuilt from reference photography; lives in its own module because it
  // carries its own texture set and material palette. See src/esp32.js.
  const esp = buildEsp32(maxAnisotropy);
  esp.textures.forEach((t) => allTextures.push(t));
  espTriangles = esp.triangles;
  const espGroup = esp.group;

  const espOrigin = new THREE.Vector3(3, 2 + 1.5, 4);
  espGroup.position.copy(espOrigin);
  group.add(espGroup);
  parts.push({ mesh: espGroup, origin: espOrigin.clone(), explode: new THREE.Vector3(0, 45, 0), stage: 5 });

  // ============================= BATTERY =============================
  const battGroup = new THREE.Group();
  const battBody = new THREE.Mesh(roundedPlate(40, 30, 5, 3), mats.foil);
  {
    // soft pillowing plus slight asymmetry - a perfect cuboid reads as plastic
    const bp = battBody.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const d = Math.min(1, Math.hypot(x / 20, z / 15));
      const puff = Math.cos(d * Math.PI * 0.5) * 0.85;
      bp.setY(i, y + (y > 2.5 ? puff : -puff * 0.45) + Math.sin(x * 0.4) * 0.06);
    }
    bp.needsUpdate = true;
    battBody.geometry.computeVertexNormals();
  }
  battGroup.add(battBody);
  const battTop = new THREE.Mesh(new THREE.PlaneGeometry(37, 27), battLabelMat);
  battTop.rotation.x = -Math.PI / 2;
  battTop.position.y = 5.05;
  battGroup.add(battTop);
  const plug = new THREE.Mesh(roundedBox(7, 5, 4, 0.25), mats.jst);
  plug.position.set(0, 2.5, -18);
  battGroup.add(plug);
  [-1, 1].forEach((x) => {
    battGroup.add(wireMesh(new THREE.Vector3(x, 2.5, -15), new THREE.Vector3(x, 2.5, -20), x < 0 ? COLOR.wireRed : COLOR.wireWhite, 0.4, 0.5, seed++));
  });

  const battOrigin = new THREE.Vector3(0, -5, 0);
  battGroup.position.copy(battOrigin);
  group.add(battGroup);
  parts.push({ mesh: battGroup, origin: battOrigin.clone(), explode: new THREE.Vector3(0, -35, 0), stage: 2 });

  // ===================== dynamic wiring (rebuilt each frame) =====================
  // Four F2F jumpers, MPU6050 -> ESP32, one colour per connection. Ground is
  // normally black; black is out of the palette, so white stands in for it.
  //   VCC -> 3V3  red     GND -> GND  white
  //   SCL -> D22  orange  SDA -> D21  blue
  // Endpoints come from the ACTUAL pin each wire lands on, not from a shared
  // anchor with four offsets. That is what was wrong before: the four ran as
  // near-parallel arcs 2.8mm apart and read as one band. VCC/GND sit at one end
  // of the ESP header and D21/D22 near the other, ~33mm away, so routing to the
  // real pins makes the four fan out and cross on their own.
  //
  // MPU6050 header, left to right: INT AD0 XCL XDA SDA SCL GND VCC — 8 pins at
  // 1.7mm, centred on the row at local (-2, 1, -7.5).
  const mpuPin = (i) => new THREE.Vector3(-2 + (-5.95 + i * 1.7), 1.5, -7.5);
  // ESP32 header B (+X side) carries D23 D22 TX0 RX0 D21 D19 D18 D5 TX2 RX2 D4
  // D2 D15 GND 3V3, running +Z to -Z at 2.54mm from the module end.
  const espPin = (i) => new THREE.Vector3(12.65, 4.1, 17.78 - i * 2.54);
  const jumperSpecs = [
    // Sag depths assigned so no two ADJACENT pins on the MPU drape alike, and a
    // different lateral bow each so they separate in plan as well as elevation.
    { name: "wire_vcc_red", color: COLOR.wireRed, from: mpuPin(7), to: espPin(14), sag: 1.4, lateral: 1.5, twist: 0.35 },
    { name: "wire_gnd_white", color: COLOR.wireWhite, from: mpuPin(6), to: espPin(13), sag: 4.8, lateral: 0.1, twist: 0.6 },
    { name: "wire_scl_orange", color: COLOR.wireOrange, from: mpuPin(5), to: espPin(1), sag: 3.0, lateral: -1.9, twist: 0.5 },
    { name: "wire_sda_blue", color: COLOR.wireBlue, from: mpuPin(4), to: espPin(4), sag: 6.4, lateral: 1.1, twist: 0.75 },
  ];
  const jumperSet = buildJumperSet(jumperSpecs);
  jumperSet.jumpers.forEach((j, k) => {
    const { from, to } = jumperSpecs[k];
    group.add(j.group);
    // Each wire tracks its own two pins as the boards separate, so they stretch
    // and straighten independently rather than as a unit.
    const getFrom = () => mpuGroup.position.clone().add(from);
    const getTo = () => espGroup.position.clone().add(to);
    // Prime it once here rather than waiting for the first frame: the ribbon
    // geometry does not exist until an update runs, so without this the wires
    // are empty on the first rendered frame.
    j.update(getFrom(), getTo());
    jumperTriangles += countTriangles(j.group);
    dynamicWires.push({ update: j.update, getFrom, getTo });
  });

  motorWireExits.forEach(({ point, colors }, i) => {
    const mesh = makeDynamicWire(colors[0], 0.45, 6);
    group.add(mesh);
    dynamicWires.push({
      mesh,
      getFrom: () => point.clone(),
      getTo: () => pbGroup.position.clone().add(new THREE.Vector3(-9 + i * 6, 3.5, -6)),
    });
  });

  return { group, parts, dynamicWires, textures: allTextures, stageCount: 7, espTriangles, motorTriangles, jumperTriangles, veroTriangles, veroBoardTriangles, veroHoles, resistorTriangles, diodeTriangles, motorFinish, motorAssets, FINISHES };
}

export function updateDynamicWires(dynamicWires) {
  dynamicWires.forEach(({ mesh, update, getFrom, getTo }) => {
    // Jumpers own their own rebuild: they carry connector housings that have to
    // be re-seated, and their sag has to fall away as the boards separate.
    if (update) {
      update(getFrom(), getTo());
      return;
    }
    mesh.geometry.dispose();
    mesh.geometry = buildTubeGeometry(getFrom(), getTo(), mesh.geometry.parameters?.radius ?? 0.4, 4);
  });
}
