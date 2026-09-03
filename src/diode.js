import * as THREE from "three";

// ---------------------------------------------------------------------------
// 1N4148 flyback diodes, DO-35 glass envelope.
//
// These are the only glass-bodied parts on the drone, and the transparency is
// the part: an opaque amber cylinder with a painted black band reads as a
// plastic bead. What makes it glass is seeing the silicon die and the internal
// leads suspended inside it, and the amber deepening where the light path
// through the body is longer.
//
// Two material paths live here — see glassMaterial(). Which one is used is a
// measured decision, not a preference; the notes there carry the numbers.
// ---------------------------------------------------------------------------

const D = {
  len: 3.6,
  bodyR: 0.9, // 1.8mm diameter
  leadR: 0.25, // 0.5mm — visibly thinner than the resistors' 0.55
  bandW: 0.5,
  bandFrom: 0.6, // from the cathode end
  radial: 20,
  dieL: 1.2,
  dieW: 0.5,
  dieH: 0.3,
};

// --- glass envelope --------------------------------------------------------
// Rounded, sealed ends with a pinch where each lead enters — not a flat-cut
// cylinder. The silhouette is most of the read on a part this small.
function envelopeGeometry() {
  const pts = [];
  // 4, not 5: on a 0.62mm dome the extra ring is imperceptible and the
  // envelope is 480 of the 600-triangle budget on its own.
  const domeSegs = 4;
  // leading pinch + dome
  for (let i = 0; i <= domeSegs; i++) {
    const t = i / domeSegs;
    const a = (t * Math.PI) / 2;
    pts.push(new THREE.Vector2(D.leadR + (D.bodyR - D.leadR) * Math.sin(a), (1 - Math.cos(a)) * 0.62));
  }
  // barrel
  pts.push(new THREE.Vector2(D.bodyR, D.len - 0.62));
  // trailing dome + pinch
  for (let i = domeSegs; i >= 0; i--) {
    const t = i / domeSegs;
    const a = (t * Math.PI) / 2;
    pts.push(new THREE.Vector2(D.leadR + (D.bodyR - D.leadR) * Math.sin(a), D.len - (1 - Math.cos(a)) * 0.62));
  }
  const geo = new THREE.LatheGeometry(pts, D.radial);
  geo.translate(0, -D.len / 2, 0);
  geo.rotateZ(-Math.PI / 2); // lie along X
  return geo;
}

// --- the bit that actually sells it ----------------------------------------
// The die and the internal leads, seen through the glass. The leads must run
// INTO the envelope and stop at the die — stopping them at the glass surface
// is what makes a transmissive body look hollow and wrong.
function internals(mats) {
  const g = new THREE.Group();

  const die = new THREE.Mesh(new THREE.BoxGeometry(D.dieL, D.dieH, D.dieW), mats.die);
  g.add(die);

  // one plain rod, one narrowed with a slight kink — the reference shows
  // internal structure that is not two matching straight rods
  const rodA = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.05, 5), mats.internalLead);
  rodA.rotation.z = Math.PI / 2;
  rodA.position.x = -(D.dieL / 2 + 0.5);
  g.add(rodA);

  const rodB = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.05, 5), mats.internalLead);
  rodB.rotation.z = Math.PI / 2;
  rodB.rotation.y = 0.22; // the kink
  rodB.position.set(D.dieL / 2 + 0.5, 0.06, 0);
  g.add(rodB);

  return g;
}

function leadGeometry(dir, straight, drop) {
  const x0 = (D.len / 2) * dir;
  const pts = [
    new THREE.Vector3(x0 - 0.2 * dir, 0, 0),
    new THREE.Vector3(x0 + straight * 0.6 * dir, 0.02, 0),
    new THREE.Vector3(x0 + straight * dir, -0.1, 0),
    new THREE.Vector3(x0 + (straight + 0.45) * dir, -0.62, 0),
    new THREE.Vector3(x0 + (straight + 0.66) * dir, -drop * 0.45, 0),
    new THREE.Vector3(x0 + (straight + 0.72) * dir, -drop, 0),
  ];
  // 4 radial on a 0.5mm wire: the cross-section is a fraction of a pixel
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, D.leadR, 4, false);
}

// ---------------------------------------------------------------------------
// MEASURED, not chosen by preference.
//
// three renders ONE extra full opaque pass per frame when any transmissive
// material is present — not one per object, so four diodes cost the same as
// one would. Measured on this scene, same frame, only this flag changed:
//
//              draw calls   triangles   ms/frame
//   off             604        98,477      10.86
//   on              889       145,231      15.14
//   delta          +285       +46,754     +39.4%
//
// That is a whole extra pass over the scene to add refraction to four parts
// 3.6mm long, which at the framing this drone is actually viewed at occupy a
// handful of pixels each. The brief's own rule is to use the fallback
// everywhere if the measured cost is significant; 39% of frame time is
// significant.
//
// The internals stay modelled either way — at opacity 0.75 the die and the
// internal rods still read through the body, which is most of the effect for
// none of the cost.
//
// Set `transmissive` true to switch back — everything else is identical.
export function glassMaterial(transmissive) {
  if (transmissive) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xd4823a,
      transmission: 0.85,
      thickness: 1.0,
      ior: 1.52,
      roughness: 0.08,
      metalness: 0,
      // The amber is absorption along the light path, not a surface tint —
      // this pair is the difference between tinted glass and orange plastic.
      attenuationColor: new THREE.Color(0xa8541c),
      attenuationDistance: 1.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
      transparent: true,
      envMapIntensity: 1.1,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0xc4762f,
    transmission: 0,
    opacity: 0.75,
    transparent: true,
    roughness: 0.1,
    metalness: 0,
    ior: 1.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.1,
  });
}

export function buildDiodes(placements, { baseY = 0, boardT = 1.5, transmissive = false } = {}) {
  const mats = {
    glass: glassMaterial(transmissive),
    die: new THREE.MeshStandardMaterial({ color: 0x1a1614, metalness: 0.6, roughness: 0.42 }),
    // brighter than the external leads: sealed inside the envelope, unoxidised
    internalLead: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 1, roughness: 0.22 }),
    band: new THREE.MeshStandardMaterial({ color: 0x0f0f10, metalness: 0, roughness: 0.55 }),
    lead: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.32 }),
  };

  const envGeo = envelopeGeometry();
  // A thin opaque ring just outside the glass rather than a texture: an opaque
  // band painted into the map of a transmissive material behaves unpredictably.
  const bandGeo = new THREE.CylinderGeometry(D.bodyR + 0.012, D.bodyR + 0.012, D.bandW, D.radial, 1, true);
  bandGeo.rotateZ(Math.PI / 2);

  const group = new THREE.Group();
  const y = baseY + D.bodyR + 0.4;
  const drop = D.bodyR + 0.4 + boardT + 0.6;

  placements.forEach((p, idx) => {
    let s = 8419 * (idx + 1);
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const one = new THREE.Group();
    const glass = new THREE.Mesh(envGeo, mats.glass);
    one.add(glass);

    const inner = internals(mats);
    one.add(inner);

    const band = new THREE.Mesh(bandGeo, mats.band);
    // The band marks polarity, so unlike the resistors these are NOT randomly
    // flipped: every cathode faces the same way relative to the circuit. Only
    // the roll about the axis varies.
    band.position.x = D.len / 2 - D.bandFrom - D.bandW / 2;
    one.add(band);

    [-1, 1].forEach((dir) => {
      const straight = 1.2 + rnd() * 0.7;
      one.add(new THREE.Mesh(leadGeometry(dir, straight, drop), mats.lead));
    });

    one.position.set(p.x + (rnd() - 0.5) * 0.3, y, p.z + (rnd() - 0.5) * 0.3);
    one.rotation.set(rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06, 0, "YXZ");
    group.add(one);
  });

  let triangles = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });

  return { group, triangles, perDiode: triangles / placements.length, materials: mats };
}
