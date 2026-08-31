import * as THREE from "three";

const ACCENT = 0xc25640;
const DEEP_RED = 0x91170c;
const CREAM = 0xfae1c3;
const TAUPE = 0x847869;
const CARBON = 0x1c1c1c;
const CARBON_LIGHT = 0x2b2b2b;
const PCB_BLACK = 0x141414;
const PCB_BLUE = 0x1a3a6b;
const SILVER = 0xcfd3d6;
const GOLD = 0xb08d3e;
const CHIP_BLACK = 0x0c0c0c;
const RUBBER_RED = 0xb23a2a;
const RUBBER_BLACK = 0x1a1a1a;

// A short row of pin-header pins along local X, centered at the mesh origin.
function pinHeaderRow(count, spacing, pinMat) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6);
  const start = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const pin = new THREE.Mesh(geo, pinMat);
    pin.position.set(start + i * spacing, 0.025, 0);
    group.add(pin);
  }
  return group;
}

// A curved wire from `from` toward `to`, sagging along the way — for motor leads.
function wire(from, to, color) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, -0.05, (Math.random() - 0.5) * 0.15));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const geo = new THREE.TubeGeometry(curve, 12, 0.006, 5, false);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  return new THREE.Mesh(geo, mat);
}

/**
 * Procedural drone model shaped to resemble the real sourced parts (ESP32
 * DevKit, MPU6050/GY-521, 8520 motors, Q100 frame) — no photo textures, just
 * geometry built to their real proportions and details. Swap for a real
 * Blender-exported .glb later; keep part names/stage numbers aligned with
 * the explode logic in main.js.
 */
export function createDrone() {
  const group = new THREE.Group();
  const parts = [];

  const carbonMat = new THREE.MeshStandardMaterial({ color: CARBON, roughness: 0.35, metalness: 0.1 });
  const carbonLightMat = new THREE.MeshStandardMaterial({ color: CARBON_LIGHT, roughness: 0.4, metalness: 0.15 });
  const grommetRedMat = new THREE.MeshStandardMaterial({ color: RUBBER_RED, roughness: 0.8 });
  const grommetBlackMat = new THREE.MeshStandardMaterial({ color: RUBBER_BLACK, roughness: 0.8 });
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.8 });

  const motorBodyMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.8 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.2, metalness: 0.9 });
  const propBlackMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const propWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.5 });

  const pcbBlackMat = new THREE.MeshStandardMaterial({ color: PCB_BLACK, roughness: 0.6 });
  const pcbBlueMat = new THREE.MeshStandardMaterial({ color: PCB_BLUE, roughness: 0.55 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.3, metalness: 0.6 });
  const chipMat = new THREE.MeshStandardMaterial({ color: CHIP_BLACK, roughness: 0.4 });
  const pinMat = new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.25, metalness: 0.8 });
  const usbMat = new THREE.MeshStandardMaterial({ color: SILVER, roughness: 0.3, metalness: 0.7 });
  const buttonMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5 });

  const batteryMat = new THREE.MeshStandardMaterial({ color: TAUPE, roughness: 0.5, metalness: 0.1 });
  const batteryWireMat = new THREE.MeshStandardMaterial({ color: 0xc23030, roughness: 0.6 });

  // ---- Center plate (frame core) — stays put, stage 0 ----
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), carbonMat);
  core.position.set(0, 0, 0);
  group.add(core);
  parts.push({ mesh: core, origin: core.position.clone(), explode: new THREE.Vector3(0, 0, 0), stage: 0 });

  // 4 corner standoffs + screws on the core, purely decorative (stay with core)
  [
    [0.35, 0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [-0.35, -0.35],
  ].forEach(([x, z]) => {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), screwMat);
    screw.position.set(x, 0.06, z);
    core.add(screw);
  });

  // ---- Four arms — stage 1 (frame), tapered like the real carbon plate ----
  const armLength = 1.6;
  const armAngles = [45, 135, 225, 315];
  const arms = [];
  armAngles.forEach((deg) => {
    const rad = THREE.MathUtils.degToRad(deg);
    const armGroup = new THREE.Group();

    const shape = new THREE.Shape();
    shape.moveTo(0, 0.09);
    shape.lineTo(armLength, 0.05);
    shape.lineTo(armLength, -0.05);
    shape.lineTo(0, -0.09);
    shape.closePath();
    const armGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
    armGeo.rotateX(Math.PI / 2);
    const armMesh = new THREE.Mesh(armGeo, carbonLightMat);
    armGroup.add(armMesh);

    // rubber grommet at the arm root, alternating red/black like the frame kit
    const grommet = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 16), deg === 45 || deg === 225 ? grommetRedMat : grommetBlackMat);
    grommet.rotation.x = Math.PI / 2;
    grommet.position.set(0.12, 0, 0);
    armGroup.add(grommet);

    const dir = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad));
    const origin = new THREE.Vector3(0, 0, 0);
    armGroup.position.copy(origin);
    armGroup.rotation.y = -rad;
    group.add(armGroup);

    const explode = dir.clone().multiplyScalar(1.1);
    parts.push({ mesh: armGroup, origin: origin.clone(), explode, stage: 1 });
    arms.push({ dir, rad });
  });

  // ---- Four motors — stage 2, sit at arm tips ----
  arms.forEach(({ dir }) => {
    const motorGroup = new THREE.Group();
    const tip = dir.clone().multiplyScalar(armLength);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.3, 20), motorBodyMat);
    body.position.set(0, 0.15, 0);
    motorGroup.add(body);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 10), shaftMat);
    shaft.position.set(0, 0.37, 0);
    motorGroup.add(shaft);

    // 4 trailing wires like the bundle in the photo
    [0xc23030, 0x1a1a1a, 0xd6d6d6, 0x2255aa].forEach((color, i) => {
      const from = new THREE.Vector3(0, 0.03, 0);
      const to = new THREE.Vector3(-dir.x * 0.5 + (i - 1.5) * 0.03, -0.15, -dir.z * 0.5 + (i - 1.5) * 0.03);
      motorGroup.add(wire(from, to, color));
    });

    motorGroup.position.copy(tip);
    group.add(motorGroup);

    const explode = dir.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 0.9, 0));
    parts.push({ mesh: motorGroup, origin: tip.clone(), explode, stage: 2 });

    // propeller — two angled blades + hub
    const propGroup = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), shaftMat);
    propGroup.add(hub);
    [0, Math.PI].forEach((rot, i) => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.09), i === 0 ? propBlackMat : propWhiteMat);
      blade.position.set(0.27, 0, 0);
      blade.rotation.z = 0.15;
      const bladeGroup = new THREE.Group();
      bladeGroup.rotation.y = rot;
      bladeGroup.add(blade);
      propGroup.add(bladeGroup);
    });
    propGroup.position.copy(tip).add(new THREE.Vector3(0, 0.44, 0));
    group.add(propGroup);
    parts.push({
      mesh: propGroup,
      origin: propGroup.position.clone(),
      explode: explode.clone().add(new THREE.Vector3(0, 0.25, 0)),
      stage: 2,
    });
  });

  // ---- IMU (MPU6050 / GY-521) — stage 3, small blue breakout near core ----
  const imuGroup = new THREE.Group();
  const imuBoard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.32), pcbBlueMat);
  imuGroup.add(imuBoard);
  const imuChip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), chipMat);
  imuChip.position.set(0, 0.02, 0);
  imuGroup.add(imuChip);
  // two large mounting holes top/bottom like the real board
  [0.13, -0.13].forEach((z) => {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.022, 16), pcbBlackMat);
    hole.position.set(0.08, 0.001, z);
    imuGroup.add(hole);
  });
  const imuPins = pinHeaderRow(8, 0.028, pinMat);
  imuPins.position.set(-0.09, 0, 0);
  imuPins.rotation.y = Math.PI / 2;
  imuGroup.add(imuPins);
  imuGroup.position.set(0.15, 0.11, -0.15);
  group.add(imuGroup);
  parts.push({ mesh: imuGroup, origin: imuGroup.position.clone(), explode: new THREE.Vector3(0.4, 1.3, -0.4), stage: 3 });

  // ---- ESP32 DevKit V1 — stage 4 ----
  const espGroup = new THREE.Group();
  const espBoard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.62), pcbBlackMat);
  espGroup.add(espBoard);
  const espShield = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.28), shieldMat);
  espShield.position.set(0, 0.025, 0.1);
  espGroup.add(espShield);
  const usb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.06), usbMat);
  usb.position.set(0, 0.02, -0.32);
  espGroup.add(usb);
  [0.09, -0.09].forEach((x) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.015, 8), buttonMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(x, 0.02, -0.24);
    espGroup.add(btn);
  });
  [1, -1].forEach((side) => {
    const pins = pinHeaderRow(15, 0.038, pinMat);
    pins.position.set(side * 0.15, 0.012, 0);
    espGroup.add(pins);
  });
  espGroup.position.set(-0.05, 0.09, 0.05);
  group.add(espGroup);
  parts.push({ mesh: espGroup, origin: espGroup.position.clone(), explode: new THREE.Vector3(-0.9, 1.8, 0.6), stage: 4 });

  // ---- Battery — stage 5, 1S LiPo pouch under the core ----
  const battGroup = new THREE.Group();
  const battBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.32), batteryMat);
  battGroup.add(battBody);
  const battPlug = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), pcbBlackMat);
  battPlug.position.set(0, 0, -0.18);
  battGroup.add(battPlug);
  [-0.02, 0.02].forEach((x) => battGroup.add(wire(new THREE.Vector3(x, 0.03, -0.16), new THREE.Vector3(x, 0.03, -0.2), x < 0 ? 0xc23030 : 0x1a1a1a)));
  battGroup.position.set(0, -0.14, 0);
  group.add(battGroup);
  parts.push({ mesh: battGroup, origin: battGroup.position.clone(), explode: new THREE.Vector3(0, -1.5, 0), stage: 5 });

  return { group, parts, stageCount: 6 };
}
