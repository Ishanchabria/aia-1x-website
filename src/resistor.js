import * as THREE from "three";

// ---------------------------------------------------------------------------
// Quarter-watt through-hole resistors on the Vero board.
//
// Two things carry this part. The body is a bulged capsule, not a cylinder —
// it swells at the middle and tapers to rounded shoulders where the leads
// leave, and a straight tube with painted rings reads as a toy no matter how
// good the bands are. And the gold tolerance band is genuinely metallic while
// the three value bands are flat paint, which is a contrast you can see across
// a room on the real part.
//
// The bands are not decoration: they encode the value, and anyone who reads
// them will notice nonsense. Both codes below are correct and differ only in
// the third band, which is exactly how the real parts differ.
// ---------------------------------------------------------------------------

const R = {
  len: 6.3,
  midR: 1.15, // 2.3mm across the middle
  endR: 0.8, // 1.6mm at the shoulder
  leadR: 0.275, // 0.55mm lead
  radial: 16,
  height: 16,
};

// brown-black-RED-gold  = 1 x 10^2 = 1k
// brown-black-ORANGE-gold = 1 x 10^3 = 10k
const BAND = {
  brown: "#6b3f22",
  black: "#141414",
  red: "#c02a1e",
  orange: "#d9701f",
  gold: "#b08a3c",
  body: "#d9cba8",
};

export const VALUES = {
  "1k": [BAND.brown, BAND.black, BAND.red],
  "10k": [BAND.brown, BAND.black, BAND.orange],
};

// Band positions in mm from the value-band end. The gold sits after a 1.4mm gap
// rather than the 0.5mm between the value bands — that asymmetry is how you
// know which end to read the code from, so it has to be visibly wider.
const LAYOUT = { first: 0.85, w: 0.6, gap: 0.5, goldGap: 1.4 };

function bandRows() {
  const rows = [];
  let at = LAYOUT.first;
  for (let i = 0; i < 3; i++) {
    rows.push([at, at + LAYOUT.w]);
    at += LAYOUT.w + LAYOUT.gap;
  }
  at += LAYOUT.goldGap - LAYOUT.gap;
  rows.push([at, at + LAYOUT.w]); // gold
  return rows;
}

// --- textures --------------------------------------------------------------
// Lathe UVs run u around the circumference and v along the profile, so a band
// is a horizontal row here. 64 wide is plenty: nothing varies around the body.
const TEX_W = 64;
const TEX_H = 512;

function paintBands(colours, mode) {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext("2d");

  if (mode === "colour") {
    ctx.fillStyle = BAND.body;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
  } else {
    // packed: green = roughness, blue = metalness. The body and the value bands
    // are dielectric; only the gold ring is metal. Making the whole body
    // metallic to get the gold would destroy the beige.
    const g = Math.round(0.52 * 255);
    ctx.fillStyle = `rgb(0,${g},0)`;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
  }

  const rows = bandRows();
  const all = [...colours, BAND.gold];
  rows.forEach(([a, b], i) => {
    const y0 = (a / R.len) * TEX_H;
    const y1 = (b / R.len) * TEX_H;
    const isGold = i === 3;
    if (mode === "colour") {
      ctx.fillStyle = all[i];
    } else {
      const rough = Math.round((isGold ? 0.32 : 0.49) * 255);
      ctx.fillStyle = `rgb(0,${rough},${isGold ? 255 : 0})`;
    }
    // A degree or two off perpendicular on a couple of bands. Painted rings are
    // applied by machine but not to optical precision, and dead-parallel rings
    // are one of the small things that reads as CG.
    const skew = i === 1 ? 2.5 : i === 2 ? -1.8 : 0;
    ctx.beginPath();
    ctx.moveTo(0, y0 - skew);
    ctx.lineTo(TEX_W, y0 + skew);
    ctx.lineTo(TEX_W, y1 + skew);
    ctx.lineTo(0, y1 - skew);
    ctx.closePath();
    ctx.fill();
  });

  // Slight softness on the edges — real band edges are not razor sharp.
  const out = document.createElement("canvas");
  out.width = TEX_W;
  out.height = TEX_H;
  const octx = out.getContext("2d");
  octx.filter = "blur(1.4px)";
  octx.drawImage(c, 0, 0);
  return out;
}

// --- body ------------------------------------------------------------------
// The profile is the whole part. It leaves the lead radius, flares through a
// rounded shoulder, swells across the middle and mirrors back.
function bodyGeometry() {
  const pts = [];
  for (let i = 0; i <= R.height; i++) {
    const t = i / R.height;
    // barrel swell: shoulder radius at the ends of the body, full radius at the
    // middle, eased so the crown is broad rather than pointed
    const swell = R.endR + (R.midR - R.endR) * Math.pow(Math.sin(Math.PI * t), 0.7);
    // and a fast rounded flare out of the lead over the first/last 8%
    const shoulder = Math.min(1, t / 0.08, (1 - t) / 0.08);
    const r = R.leadR + (swell - R.leadR) * Math.pow(shoulder, 0.5);
    pts.push(new THREE.Vector2(Math.max(r, R.leadR), t * R.len));
  }
  const geo = new THREE.LatheGeometry(pts, R.radial);
  geo.translate(0, -R.len / 2, 0);
  geo.rotateZ(-Math.PI / 2); // lie along X
  return geo;
}

// --- leads -----------------------------------------------------------------
// Bent, not straight, and bent with a radius. A sharp 90 degree corner is not
// something a hand and a pair of pliers produces.
function leadGeometry(dir, straight, drop) {
  const x0 = (R.len / 2) * dir;
  const pts = [
    new THREE.Vector3(x0 - 0.3 * dir, 0, 0),
    new THREE.Vector3(x0 + straight * 0.55 * dir, 0.02, 0),
    new THREE.Vector3(x0 + straight * dir, -0.12, 0),
    new THREE.Vector3(x0 + (straight + 0.5) * dir, -0.75, 0),
    new THREE.Vector3(x0 + (straight + 0.72) * dir, -drop * 0.45, 0),
    new THREE.Vector3(x0 + (straight + 0.78) * dir, -drop, 0),
  ];
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, R.leadR, 5, false);
}

// ---------------------------------------------------------------------------
// baseY is the height of the surface these sit ON, and boardT how thick it is,
// because the module has no business guessing either. Assuming a board top at
// y=0 is what put the first version inside the Vero board.
export function buildResistors(placements, maxAnisotropy = 1, baseY = 0, boardT = 1.5) {
  const textures = [];
  const track = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = maxAnisotropy;
    textures.push(t);
    return t;
  };

  // Two colour maps total, one per value, shared across every resistor of that
  // value. The packed roughness/metalness map is the same for both.
  const orm = track(paintBands(VALUES["1k"], "orm"), false);
  const mats = {};
  for (const key of Object.keys(VALUES)) {
    mats[key] = new THREE.MeshStandardMaterial({
      map: track(paintBands(VALUES[key], "colour"), true),
      roughnessMap: orm,
      metalnessMap: orm,
      metalness: 1,
      roughness: 1,
    });
  }
  const leadMat = new THREE.MeshStandardMaterial({
    color: 0xc8ccd0,
    metalness: 1,
    roughness: 0.3,
  });

  const group = new THREE.Group();
  const bodyGeo = bodyGeometry();

  // one InstancedMesh per value; the per-resistar roll, tilt and offset all
  // live in the instance matrix
  const byValue = {};
  placements.forEach((p) => (byValue[p.value] = (byValue[p.value] || 0) + 1));
  const inst = {};
  for (const [key, n] of Object.entries(byValue)) {
    inst[key] = { mesh: new THREE.InstancedMesh(bodyGeo, mats[key], n), i: 0 };
    group.add(inst[key].mesh);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();

  placements.forEach((p, idx) => {
    let s = 6151 * (idx + 1);
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    // Roll about the long axis so the bands face different ways; half the parts
    // inserted end-for-end so the code reads "backwards" from any one angle,
    // which is what hand assembly actually produces.
    const roll = rnd() * Math.PI * 2;
    const flip = rnd() > 0.5 ? Math.PI : 0;
    // never perfectly square or perfectly on grid
    const yaw = (rnd() - 0.5) * 0.07;
    const jitterX = (rnd() - 0.5) * 0.4;
    const jitterZ = (rnd() - 0.5) * 0.4;
    // body sits proud of the board, so there is a shadow gap underneath
    const y = baseY + R.midR + 0.5;

    e.set(roll, yaw + flip, 0, "YXZ");
    q.setFromEuler(e);
    v.set(p.x + jitterX, y, p.z + jitterZ);
    m4.compose(v, q, one);
    const slot = inst[p.value];
    slot.mesh.setMatrixAt(slot.i++, m4);

    // Leads are their own meshes because the bend distance varies per part —
    // hand bending is not repeatable, and identical bends across five resistors
    // is the same tell as identical anything else.
    // far enough to pass through the board and end in a solder blob beneath it
    const drop = R.midR + 0.5 + boardT + 0.6;
    [-1, 1].forEach((dir) => {
      const straight = 1.5 + rnd() * 0.9;
      const lead = new THREE.Mesh(leadGeometry(dir, straight, drop), leadMat);
      lead.position.copy(v);
      lead.quaternion.setFromEuler(e.set(0, yaw + flip, 0, "YXZ"));
      group.add(lead);
    });
  });

  Object.values(inst).forEach((s) => {
    s.mesh.instanceMatrix.needsUpdate = true;
    // An InstancedMesh derives its bounds from the BASE geometry, not from the
    // instance matrices, so a mesh whose instances sit ±10mm from its own
    // origin gets frustum-culled the moment the camera looks at the instances
    // rather than at the origin. Symptom: the parts simply are not there from
    // most angles, while still projecting to sensible screen positions.
    s.mesh.computeBoundingBox();
    s.mesh.computeBoundingSphere();
  });

  let triangles = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    triangles +=
      ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });

  return { group, textures, triangles, perResistor: triangles / placements.length };
}
