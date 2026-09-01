import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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
  frame: 0x131820,
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
  veroboard: 0x2a2c30,
  copper: 0x8a6a4a,
  mosfetBody: 0x101318,
  mosfetTab: 0x9aa3ad,
  leg: 0x8d95a0,
  resistorBody: 0x585c62,
  foil: 0x4a505a,
  jst: 0x9aa3ad,
  zipTie: 0x0b0d11,
  wireRed: 0xcc2b2b,
  wireBlack: 0x161616,
  wireYellow: 0xdcb92e,
  wireBlue: 0x2255aa,
  wireWhite: 0xd8dde4,
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

function esp32Texture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#0f141c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 15; i++) {
      const y = (h / 15) * i + 6;
      ctx.fillText(String(i), 6, y);
      ctx.fillText(String(i), w - 16, y);
    }
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("ESP32", w / 2 - 34, h - 14);
  }, 128, 320);
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
  }, 200, 150);
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

function perfboardTopTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#2a2c30";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(8,10,14,0.75)";
    const step = 12;
    for (let x = step / 2; x < w; x += step) {
      for (let y = step / 2; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, 256, 220);
}

function perfboardBottomTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#1b1d21";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(138,106,74,0.85)";
    ctx.lineWidth = 3;
    for (let y = 8; y < h; y += 14) {
      ctx.beginPath();
      ctx.moveTo(4, y + ((y / 14) % 2) * 5);
      ctx.lineTo(w - 4, y);
      ctx.stroke();
    }
  }, 256, 220);
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
  }, 256, 192);
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

function pinRow(count, spacing, length, mat) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.5, length, 0.5);
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const pin = new THREE.Mesh(geo, mat);
    pin.position.set(start + i * spacing, -length / 2, 0);
    group.add(pin);
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

function wireMesh(from, to, color, radius = 0.5, sag = 3, seed = 0) {
  const mesh = new THREE.Mesh(buildTubeGeometry(from, to, radius, sag, seed), wireMaterial(color));
  return mesh;
}

function makeDynamicWire(color, radius = 0.5, sag = 4) {
  const mat = wireMaterial(color);
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -2, 0)]), 16, radius, 6, false);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
export function createDrone(maxAnisotropy = 1) {
  const group = new THREE.Group();
  const parts = [];
  const dynamicWires = [];
  const allTextures = [];
  let seed = 0;
  const track = (tex) => (allTextures.push(tex), (tex.anisotropy = maxAnisotropy), tex);

  const microNoise = track(noiseRoughnessTexture());

  const mats = {
    // anodised / soft-touch dark blue-charcoal — near-black in shadow, cool blue
    // in the highlight. Clearcoat is what makes it read as a finished surface.
    frame: new THREE.MeshPhysicalMaterial({
      color: COLOR.frame,
      metalness: 0.15,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
      roughnessMap: microNoise,
    }),
    accentTrim: new THREE.MeshStandardMaterial({
      color: 0x0a1020,
      emissive: COLOR.accentGlow,
      emissiveIntensity: 1.4,
      roughness: 0.4,
      metalness: 0,
    }),
    gunmetal: new THREE.MeshStandardMaterial({
      color: COLOR.gunmetal,
      metalness: 1,
      roughness: 0.3,
      envMapIntensity: 1.15,
    }),
    shaft: new THREE.MeshStandardMaterial({ color: COLOR.shaft, metalness: 1, roughness: 0.4 }),
    // glossy near-black: the highlight sweeping the blade twist is what sells it
    propBlack: new THREE.MeshPhysicalMaterial({
      color: COLOR.propBlack,
      metalness: 0,
      roughness: 0.52,
      clearcoat: 0.35,
      clearcoatRoughness: 0.38,
      envMapIntensity: 0.3,
    }),
    pcbBlack: new THREE.MeshStandardMaterial({ color: COLOR.pcbBlack, metalness: 0, roughness: 0.7, roughnessMap: microNoise }),
    shield: new THREE.MeshStandardMaterial({ color: COLOR.shield, metalness: 0.95, roughness: 0.42, envMapIntensity: 0.6 }),
    usb: new THREE.MeshStandardMaterial({ color: COLOR.usb, metalness: 0.95, roughness: 0.32, envMapIntensity: 0.5 }),
    button: new THREE.MeshStandardMaterial({ color: COLOR.button, metalness: 0, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: COLOR.brass, metalness: 1, roughness: 0.3 }),
    pcbBlue: new THREE.MeshStandardMaterial({ color: COLOR.pcbBlue, metalness: 0, roughness: 0.48, roughnessMap: microNoise }),
    chip: new THREE.MeshStandardMaterial({ color: COLOR.chip, metalness: 0, roughness: 0.62 }),
    amberGlass: new THREE.MeshPhysicalMaterial({ color: COLOR.amber, roughness: 0.18, metalness: 0, transmission: 0.5, ior: 1.5, thickness: 1.2 }),
    veroboard: new THREE.MeshStandardMaterial({ color: COLOR.veroboard, metalness: 0, roughness: 0.78, roughnessMap: microNoise }),
    copper: new THREE.MeshStandardMaterial({ color: COLOR.copper, metalness: 0.9, roughness: 0.45 }),
    mosfetBody: new THREE.MeshStandardMaterial({ color: COLOR.mosfetBody, metalness: 0, roughness: 0.6 }),
    mosfetTab: new THREE.MeshStandardMaterial({ color: COLOR.mosfetTab, metalness: 0.95, roughness: 0.42, envMapIntensity: 0.6 }),
    leg: new THREE.MeshStandardMaterial({ color: COLOR.leg, metalness: 0.9, roughness: 0.38 }),
    resistorBody: new THREE.MeshStandardMaterial({ color: COLOR.resistorBody, metalness: 0, roughness: 0.62 }),
    foil: new THREE.MeshStandardMaterial({ color: COLOR.foil, metalness: 0.7, roughness: 0.45 }),
    jst: new THREE.MeshStandardMaterial({ color: COLOR.jst, metalness: 0.2, roughness: 0.55 }),
    zipTie: new THREE.MeshStandardMaterial({ color: COLOR.zipTie, metalness: 0, roughness: 0.65 }),
  };

  const espTopMat = new THREE.MeshStandardMaterial({ map: track(esp32Texture()), roughness: 0.65 });
  const mpuTopMat = new THREE.MeshStandardMaterial({ map: track(mpuTexture()), roughness: 0.45 });
  const perfTopMat = new THREE.MeshStandardMaterial({ map: track(perfboardTopTexture()), roughness: 0.55 });
  const perfBottomMat = new THREE.MeshStandardMaterial({ map: track(perfboardBottomTexture()), roughness: 0.4, metalness: 0.3 });
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

  group.add(frameGroup);

  // ============================= MOTORS (anchor) =============================
  const motorWireExits = [];
  motorTips.forEach(({ tip, dir }, i) => {
    const motor = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, 20, 32), mats.gunmetal);
    body.position.y = 10;
    motor.add(body);

    // chamfered rims — a flat disc cap edge is one of the loudest CG tells
    [0.35, 19.65].forEach((y) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(4.08, 0.35, 8, 32), mats.gunmetal);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y;
      motor.add(rim);
    });

    // faint lengthwise seam line down the can
    const seam = new THREE.Mesh(
      roundedBox(0.35, 19, 0.35, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8b8e90, roughness: 0.45, metalness: 0.85 })
    );
    seam.position.set(4.2, 10, 0);
    motor.add(seam);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 8), mats.shaft);
    shaft.position.y = 22.5;
    motor.add(shaft);

    for (let v = 0; v < 3; v++) {
      const a = (v / 3) * Math.PI * 2;
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 6), mats.mosfetBody);
      vent.position.set(Math.cos(a) * 2, 20.1, Math.sin(a) * 2);
      motor.add(vent);
    }

    const isRedBlue = i % 2 === 0;
    const wireColors = isRedBlue ? [COLOR.wireRed, COLOR.wireBlue] : [COLOR.wireBlack, COLOR.wireWhite];
    const exitPoints = [];
    wireColors.forEach((color, w) => {
      const from = new THREE.Vector3(tip.x, tip.y - 8, tip.z).add(new THREE.Vector3(-dir.x * 1.5 * (w ? 1 : -1), 0, -dir.z * 1.5 * (w ? 1 : -1)));
      const to = new THREE.Vector3(dir.x * (plateRadial + 4), 0.5, dir.z * (plateRadial + 4));
      motor.add(wireMesh(from, to, color, 0.45, 2.5, seed++));
      exitPoints.push(to.clone());
    });
    motorWireExits.push({ point: exitPoints[0], colors: wireColors });

    motor.position.set(tip.x, 0, tip.z);
    group.add(motor);

    // ---- Propeller (explodes) ----
    const propGroup = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 16), mats.propBlack);
    hub.position.y = 2;
    propGroup.add(hub);

    // CW/CCW pairing: FL(135) + RR(315) share one rotation, FR(45) + RL(225) share the other
    const deg = motorTips[i].deg;
    const spinSign = deg === 135 || deg === 315 ? 1 : -1;

    [0, Math.PI].forEach((rot) => {
      // Outline must stay monotonic along the span — an earlier version doubled
      // back on itself at the tip, which self-intersected, broke triangulation
      // and left that region with garbage normals (it shaded bright even with
      // every light off).
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(0, -2.5);
      bladeShape.quadraticCurveTo(16, -4.6, 29.5, -1.7);
      bladeShape.quadraticCurveTo(32.5, 0, 29.5, 1.7);
      bladeShape.quadraticCurveTo(16, 4.6, 0, 2.5);
      bladeShape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2, curveSegments: 10 });
      bladeGeo.translate(3, 0, 0);
      bladeGeo.computeVertexNormals();
      const blade = new THREE.Mesh(bladeGeo, mats.propBlack);
      blade.rotation.x = spinSign * 0.28; // pitch
      const bladePivot = new THREE.Group();
      bladePivot.rotation.y = rot;
      bladePivot.add(blade);
      propGroup.add(bladePivot);
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
  const mpuPins = pinRow(8, 1.7, 4, mats.brass);
  mpuPins.position.set(-2, 1, -7.5);
  mpuGroup.add(mpuPins);

  const mpuOrigin = new THREE.Vector3(-6, 2, -6);
  mpuGroup.position.copy(mpuOrigin);
  group.add(mpuGroup);
  parts.push({ mesh: mpuGroup, origin: mpuOrigin.clone(), explode: new THREE.Vector3(0, 18, 0), stage: 4 });

  // ============================= POWER BOARD =============================
  const pbGroup = new THREE.Group();
  const pbBoard = new THREE.Mesh(roundedPlate(30, 25, 1.5, 1.5), mats.veroboard);
  pbGroup.add(pbBoard);
  // drilled-hole grid on top, copper strip traces underneath
  const pbTop = new THREE.Mesh(new THREE.PlaneGeometry(29, 24), perfTopMat);
  pbTop.rotation.x = -Math.PI / 2;
  pbTop.position.y = 1.52;
  pbGroup.add(pbTop);
  const pbBottom = new THREE.Mesh(new THREE.PlaneGeometry(29, 24), perfBottomMat);
  pbBottom.rotation.x = Math.PI / 2;
  pbBottom.position.y = -0.02;
  pbGroup.add(pbBottom);

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

  for (let d = 0; d < 4; d++) {
    const diode = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 10), mats.amberGlass);
    glass.rotation.z = Math.PI / 2;
    diode.add(glass);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.5, 10), mats.mosfetBody);
    band.rotation.z = Math.PI / 2;
    band.position.x = 1.3;
    diode.add(band);
    diode.position.set(-9 + d * 6, 1.5, 2);
    pbGroup.add(diode);
  }

  const resistorColors = [0x7a4a1e, 0x0d0d0d, 0xc9a03a];
  for (let r = 0; r < 5; r++) {
    const res = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 10), mats.resistorBody);
    body.rotation.z = Math.PI / 2;
    res.add(body);
    resistorColors.forEach((c, ci) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.5, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
      band.rotation.z = Math.PI / 2;
      band.position.x = -1.5 + ci * 1.2;
      res.add(band);
    });
    res.position.set(-10 + r * 5, 1.5, 7);
    pbGroup.add(res);
  }

  [0, 1, 2].forEach((w) => {
    const from = new THREE.Vector3(-9 + w * 6, 3.5, -6);
    const to = new THREE.Vector3(-9 + (w + 1) * 6, 3.5, 2);
    pbGroup.add(wireMesh(from, to, w % 2 ? COLOR.wireBlack : COLOR.wireRed, 0.35, 1, seed++));
  });

  const pbOrigin = new THREE.Vector3(3, 2, 4);
  pbGroup.position.copy(pbOrigin);
  group.add(pbGroup);
  parts.push({ mesh: pbGroup, origin: pbOrigin.clone(), explode: new THREE.Vector3(0, 15, 0), stage: 3 });

  // ============================= ESP32 =============================
  const espGroup = new THREE.Group();
  const espBoard = new THREE.Mesh(roundedPlate(28.5, 51.5, 1.6, 2), mats.pcbBlack);
  espGroup.add(espBoard);
  const espTop = new THREE.Mesh(new THREE.PlaneGeometry(26, 48), espTopMat);
  espTop.rotation.x = -Math.PI / 2;
  espTop.position.y = 1.62;
  espGroup.add(espTop);

  const shield = new THREE.Mesh(roundedBox(18, 3, 25, 0.3), mats.shield);
  shield.position.set(0, 1.6 + 1.5, 10);
  espGroup.add(shield);

  const usb = new THREE.Mesh(roundedBox(8, 5, 5, 0.3), mats.usb);
  usb.position.set(0, 1.6 + 2.5, -25 - 1);
  espGroup.add(usb);

  [-6, 6].forEach((x) => {
    const btn = new THREE.Mesh(roundedBox(4, 2, 4, 0.18), mats.button);
    btn.position.set(x, 1.6 + 1, -18);
    espGroup.add(btn);
  });

  [[-5, -22], [7, -20], [10, -16]].forEach(([x, z], i) => {
    const smd = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, 10), i === 2 ? mats.amberGlass : mats.shaft);
    smd.position.set(x, 1.6 + 1, z);
    espGroup.add(smd);
  });
  [[-9, -12, 0xcc2b2b], [-9, -8, 0x2255aa]].forEach(([x, z, c]) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.3 }));
    led.position.set(x, 1.6 + 0.8, z);
    espGroup.add(led);
  });

  [-13, 13].forEach((x) => {
    const pins = pinRow(15, 3.2, 6, mats.brass);
    pins.rotation.y = Math.PI / 2;
    pins.position.set(x, 0, 0);
    espGroup.add(pins);
  });

  const espOrigin = new THREE.Vector3(3, 2 + 1.5, 4);
  espGroup.position.copy(espOrigin);
  group.add(espGroup);
  parts.push({ mesh: espGroup, origin: espOrigin.clone(), explode: new THREE.Vector3(0, 45, 0), stage: 5 });

  // ============================= BATTERY =============================
  const battGroup = new THREE.Group();
  const battBody = new THREE.Mesh(roundedPlate(40, 30, 5, 3), mats.foil);
  battGroup.add(battBody);
  const battTop = new THREE.Mesh(new THREE.PlaneGeometry(37, 27), battLabelMat);
  battTop.rotation.x = -Math.PI / 2;
  battTop.position.y = 5.05;
  battGroup.add(battTop);
  const plug = new THREE.Mesh(roundedBox(7, 5, 4, 0.25), mats.jst);
  plug.position.set(0, 2.5, -18);
  battGroup.add(plug);
  [-1, 1].forEach((x) => {
    battGroup.add(wireMesh(new THREE.Vector3(x, 2.5, -15), new THREE.Vector3(x, 2.5, -20), x < 0 ? COLOR.wireRed : COLOR.wireBlack, 0.4, 0.5, seed++));
  });

  const battOrigin = new THREE.Vector3(0, -5, 0);
  battGroup.position.copy(battOrigin);
  group.add(battGroup);
  parts.push({ mesh: battGroup, origin: battOrigin.clone(), explode: new THREE.Vector3(0, -35, 0), stage: 2 });

  // ===================== dynamic wiring (rebuilt each frame) =====================
  const jumperSpecs = [
    { color: COLOR.wireRed, offset: -3 },
    { color: COLOR.wireBlack, offset: -1 },
    { color: COLOR.wireYellow, offset: 1 },
    { color: COLOR.wireBlue, offset: 3 },
  ];
  jumperSpecs.forEach(({ color, offset }) => {
    const mesh = makeDynamicWire(color, 0.4, 5);
    group.add(mesh);
    dynamicWires.push({
      mesh,
      getFrom: () => mpuGroup.position.clone().add(new THREE.Vector3(offset, 1, -7.5)),
      getTo: () => espGroup.position.clone().add(new THREE.Vector3(-13, 0, -20 + offset * 2)),
    });
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

  return { group, parts, dynamicWires, stageCount: 7 };
}

export function updateDynamicWires(dynamicWires) {
  dynamicWires.forEach(({ mesh, getFrom, getTo }) => {
    mesh.geometry.dispose();
    mesh.geometry = buildTubeGeometry(getFrom(), getTo(), mesh.geometry.parameters?.radius ?? 0.4, 4);
  });
}
