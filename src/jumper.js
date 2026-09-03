import * as THREE from "three";

// ---------------------------------------------------------------------------
// Female-to-female DuPont jumpers, MPU6050 -> ESP32.
//
// Visually these are a different animal from the motor leads: thicker, glossier,
// flat in section, and terminating in matte black moulded housings. The
// gloss/matte contrast between wire and housing is doing as much work as any
// single piece of geometry here.
// ---------------------------------------------------------------------------

// The only four colours any wire on this drone may use. Wire insulation only —
// moulded plastic (these housings, heat-shrink, zip ties) stays black.
export const WIRE = {
  red: 0xd93b30,
  blue: 0x2f6bd4,
  orange: 0xe08a2e,
  white: 0xe8e6e2,
};

const H = {
  w: 2.6, // across the latch axis, once the two plates are added
  d: 2.6, // the other cross-axis
  len: 14.0,
  bore: 1.8, // the cavity the header pin enters
  frontLen: 4.0, // how deep that cavity runs
  plate: 0.2, // latch plate thickness = the depth of the recessed window
  windowLen: 2.4,
  windowFrom: 4.6, // roughly a third back from the mating end
};

// --- shared geometry -------------------------------------------------------
// One set, instanced across all eight connectors.
function housingParts() {
  // Mating end: a real open frame, so the cavity has genuine depth and the
  // contact is seen down a hole rather than painted on a face.
  const outer = new THREE.Shape();
  const hw = H.w / 2, hd = H.d / 2;
  outer.moveTo(-hw, -hd);
  outer.lineTo(hw, -hd);
  outer.lineTo(hw, hd);
  outer.lineTo(-hw, hd);
  outer.lineTo(-hw, -hd);
  const bore = new THREE.Path();
  const b = H.bore / 2;
  bore.moveTo(-b, -b);
  bore.lineTo(-b, b);
  bore.lineTo(b, b);
  bore.lineTo(b, -b);
  bore.lineTo(-b, -b);
  outer.holes.push(bore);
  // No bevel. The moulded lead-in at the mouth is 0.12mm on a 2.6mm part —
  // sub-pixel at every scale this renders at — and bevelling it doubled the
  // frame from 32 to 64 triangles, which across eight housings was 256 of a
  // 1,200 budget spent on something invisible.
  const front = new THREE.ExtrudeGeometry(outer, {
    depth: H.frontLen,
    bevelEnabled: false,
  });

  // Rear body, 0.2mm shy on the latch axis so the two plates below can sit
  // proud of it and leave a genuine recessed window between them.
  const body = new THREE.BoxGeometry(H.w, H.d - H.plate, H.len - H.frontLen);
  body.translate(0, -H.plate / 2, H.frontLen + (H.len - H.frontLen) / 2);

  // The latch window. Modelled as the gap between two plates rather than a
  // pocket cut into a solid box: a boolean pocket needs the surrounding face
  // to carry a hole, which costs several times the triangles. This reads the
  // same — a rectangle 0.2mm below its surroundings with its own shadow edge —
  // for 24 triangles instead of ~100.
  const beforeLen = H.windowFrom - H.frontLen;
  const afterLen = H.len - H.windowFrom - H.windowLen;
  const plateA = new THREE.BoxGeometry(H.w, H.plate, beforeLen);
  plateA.translate(0, (H.d - H.plate) / 2, H.frontLen + beforeLen / 2);
  const plateB = new THREE.BoxGeometry(H.w, H.plate, afterLen);
  plateB.translate(0, (H.d - H.plate) / 2, H.windowFrom + H.windowLen + afterLen / 2);

  // A bright fleck of metal down a dark hole reads strongly and costs nothing.
  const contact = new THREE.PlaneGeometry(1.1, 1.1);
  contact.translate(0, 0, H.frontLen - 0.3);

  return { front, body, plateA, plateB, contact };
}

// The bore interior is part of the front extrusion and therefore carries the
// housing material. A separate 0x050506 cavity material would differ from
// 0x0e0e11 by 9/255 -- invisible -- and cost another mesh per housing.
export function jumperMaterials() {
  return {
    // Dead matte moulded nylon. No clearcoat — the contrast against the glossy
    // insulation is the point.
    housing: new THREE.MeshStandardMaterial({ color: 0x0e0e11, metalness: 0, roughness: 0.58 }),
    contact: new THREE.MeshStandardMaterial({ color: 0xc6cace, metalness: 1, roughness: 0.28 }),
  };
}

// --- ribbon ----------------------------------------------------------------
// Not a TubeGeometry. Jumper stock is a flattened oval, and the flat face
// catches a broad highlight a round wire never does — plus the section has to
// twist gradually along the length, which a tube cannot do.
const RIB_RADIAL = 8;

function buildRibbon(curve, segments, twistTurns) {
  const rx = 0.8; // 1.6mm wide
  const ry = 0.5; // 1.0mm tall
  const pos = [];
  const nrm = [];
  const idx = [];

  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t).normalize();
    n.crossVectors(t, up);
    if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
    n.normalize();
    b.crossVectors(t, n).normalize();
    const twist = u * twistTurns * Math.PI * 2;
    for (let j = 0; j < RIB_RADIAL; j++) {
      const a = (j / RIB_RADIAL) * Math.PI * 2 + twist;
      const ca = Math.cos(a) * rx;
      const sa = Math.sin(a) * ry;
      v.copy(p).addScaledVector(n, ca).addScaledVector(b, sa);
      pos.push(v.x, v.y, v.z);
      // ellipse normal, not the circle's — otherwise the broad face lights wrong
      nv.set(0, 0, 0).addScaledVector(n, Math.cos(a) / rx).addScaledVector(b, Math.sin(a) / ry).normalize();
      nrm.push(nv.x, nv.y, nv.z);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < RIB_RADIAL; j++) {
      const a = i * RIB_RADIAL + j;
      const bb = i * RIB_RADIAL + ((j + 1) % RIB_RADIAL);
      const c = a + RIB_RADIAL;
      const dd = bb + RIB_RADIAL;
      idx.push(a, c, bb, bb, c, dd);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// ---------------------------------------------------------------------------
export function buildJumper({ color, index, mats, geo, segments = 10 }) {
  const group = new THREE.Group();

  const insulation = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    // Glossy, almost wet-looking PVC. These four colours are the most saturated
    // things on the drone and are meant to stay that way.
    roughness: 0.3,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
  });

  const ends = [0, 1].map(() => {
    const h = new THREE.Group();
    h.add(new THREE.Mesh(geo.front, mats.housing));
    h.add(new THREE.Mesh(geo.body, mats.housing));
    h.add(new THREE.Mesh(geo.plateA, mats.housing));
    h.add(new THREE.Mesh(geo.plateB, mats.housing));
    const c = new THREE.Mesh(geo.contact, mats.contact);
    h.add(c);
    group.add(h);
    return h;
  });

  // On real hardware these are pushed on whichever way is convenient, so the
  // latch windows face different directions. Deterministic per connector.
  let s = 3571 * (index + 1);
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const roll = [rnd(), rnd()].map((r) => Math.floor(r * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.25);
  const sagBias = 0.7 + rnd() * 0.9; // each wire drapes differently
  const twistTurns = 0.4 + rnd() * 0.5;
  const lateral = (rnd() - 0.5) * 2;

  const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), insulation);
  group.add(ribbon);

  const dirA = new THREE.Vector3();
  const startA = new THREE.Vector3();
  const startB = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const roller = new THREE.Quaternion();

  // A connector pushes DOWN onto a header, so it stands off the board with its
  // mouth at the pin and its body pointing up — it does not lie along the wire
  // run. Getting this wrong is not cosmetic: the housings are 14mm long and the
  // boards sit 9mm apart at rest, so aiming them at each other made them
  // overlap and inverted the ribbon between them.
  const UP = new THREE.Vector3(0, 1, 0);
  function place(h, at, tilt, rollAngle) {
    dirA.copy(UP).addScaledVector(tilt, 0.22).normalize();
    q.setFromUnitVectors(zAxis, dirA);
    roller.setFromAxisAngle(zAxis, rollAngle);
    h.quaternion.copy(q).multiply(roller);
    h.position.copy(at);
    return dirA.clone();
  }

  function update(from, to) {
    // a slight lean toward the far end, the way a plugged connector actually sits
    const lean = new THREE.Vector3().subVectors(to, from).setY(0).normalize();
    const axisA = place(ends[0], from, lean, roll[0]);
    const axisB = place(ends[1], to, lean.clone().negate(), roll[1]);

    // the ribbon leaves each housing's REAR, overlapping 1mm so the insulation
    // visibly enters rather than intersecting the end face
    startA.copy(from).addScaledVector(axisA, H.len - 1);
    startB.copy(to).addScaledVector(axisB, H.len - 1);

    const span = startA.distanceTo(startB);
    // A stretched wire straightens: sag falls away as the boards separate, so
    // the bow is a function of slack rather than a constant.
    const slack = Math.max(0, 1 - span / 34);
    mid.copy(startA).lerp(startB, 0.5);
    mid.y -= (1.2 + span * 0.16) * sagBias * (0.25 + slack);
    mid.x += lateral * slack;

    const curve = new THREE.CatmullRomCurve3([startA, mid, startB]);
    ribbon.geometry.dispose();
    ribbon.geometry = buildRibbon(curve, segments, twistTurns * (0.4 + slack));
  }

  return { group, update };
}

export function buildJumperSet(specs) {
  const mats = jumperMaterials();
  const geo = housingParts();
  const jumpers = specs.map((spec, index) => buildJumper({ ...spec, index, mats, geo }));
  return { jumpers, mats, geo };
}
