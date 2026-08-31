import * as THREE from "three";

const ACCENT = 0xc25640;
const DEEP_RED = 0x91170c;
const CREAM = 0xfae1c3;
const TAUPE = 0x847869;
const DARK = 0x2b2b2b;

/**
 * Placeholder primitive-shape drone model.
 * Swap for a Blender-exported .glb once the real model is ready —
 * keep the same part names/stage numbers so the explode logic still lines up.
 */
export function createDrone() {
  const group = new THREE.Group();
  const parts = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.5, metalness: 0.3 });
  const armMat = new THREE.MeshStandardMaterial({ color: DEEP_RED, roughness: 0.6, metalness: 0.2 });
  const motorMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4, metalness: 0.5 });
  const boardMat = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5, metalness: 0.1 });
  const batteryMat = new THREE.MeshStandardMaterial({ color: TAUPE, roughness: 0.6, metalness: 0.1 });

  // Center plate (frame core) — stays put, stage 0
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), bodyMat);
  core.position.set(0, 0, 0);
  group.add(core);
  parts.push({ mesh: core, origin: core.position.clone(), explode: new THREE.Vector3(0, 0, 0), stage: 0 });

  // Four arms — stage 1 (frame)
  const armLength = 1.6;
  const armAngles = [45, 135, 225, 315];
  const arms = [];
  armAngles.forEach((deg) => {
    const rad = THREE.MathUtils.degToRad(deg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.08, 0.14), armMat);
    const dir = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad));
    const origin = dir.clone().multiplyScalar(armLength / 2);
    arm.position.copy(origin);
    arm.rotation.y = -rad;
    group.add(arm);
    const explode = dir.clone().multiplyScalar(1.1);
    parts.push({ mesh: arm, origin: origin.clone(), explode, stage: 1 });
    arms.push({ dir, origin });
  });

  // Four motors — stage 2, sit at arm tips
  arms.forEach(({ dir, origin }) => {
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 16), motorMat);
    const tip = dir.clone().multiplyScalar(armLength);
    motor.position.copy(tip).add(new THREE.Vector3(0, 0.15, 0));
    group.add(motor);
    const explode = dir.clone().multiplyScalar(1.4).add(new THREE.Vector3(0, 0.9, 0));
    parts.push({ mesh: motor, origin: motor.position.clone(), explode, stage: 2 });

    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.05), motorMat);
    prop.position.copy(motor.position).add(new THREE.Vector3(0, 0.18, 0));
    group.add(prop);
    parts.push({ mesh: prop, origin: prop.position.clone(), explode: explode.clone().add(new THREE.Vector3(0, 0.2, 0)), stage: 2 });
  });

  // IMU (MPU6050) — stage 3, small chip near core
  const imu = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.22), boardMat);
  imu.position.set(0.15, 0.12, -0.15);
  group.add(imu);
  parts.push({ mesh: imu, origin: imu.position.clone(), explode: new THREE.Vector3(0.4, 1.3, -0.4), stage: 3 });

  // ESP32 flight controller board — stage 4
  const esp32 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.35), boardMat);
  esp32.position.set(-0.05, 0.1, 0.05);
  group.add(esp32);
  parts.push({ mesh: esp32, origin: esp32.position.clone(), explode: new THREE.Vector3(-0.9, 1.8, 0.6), stage: 4 });

  // Battery — stage 5, sits under the core
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), batteryMat);
  battery.position.set(0, -0.15, 0);
  group.add(battery);
  parts.push({ mesh: battery, origin: battery.position.clone(), explode: new THREE.Vector3(0, -1.5, 0), stage: 5 });

  return { group, parts, stageCount: 6 };
}
