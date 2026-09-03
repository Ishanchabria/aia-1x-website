import * as THREE from "three";

// ---------------------------------------------------------------------------
// 8520 coreless motors, rebuilt from reference photography.
//
// These are the brightest, shiniest objects on the drone and are on screen at
// every scroll position, so they carry more of the realism than anything else.
//
// Local frame: the can runs along +Y, wire end at y=0, output end at y=20, and
// the shaft continues past that. The drone places each motor at an arm tip.
// ---------------------------------------------------------------------------

// The colour decision, left open on purpose. Flip this and look; in dev you can
// also append ?finish=warm|neutral|cool to the URL rather than rebuilding.
//
//   warm     photo-accurate champagne brass. Truthful to the real part, but
//            four large warm objects change the whole drone.
//   neutral  warm-leaning steel. Reads as real plating, still sits inside the
//            cool palette, and pairs with the ESP32's gold without competing.
//   cool     the original blue-grey. Matches the frame, is not what the part
//            actually looks like.
export const MOTOR_FINISH = "neutral";

export const FINISHES = {
  warm: { color: 0xc4b294, label: "champagne brass (photo-accurate)" },
  neutral: { color: 0xb0aca4, label: "warm-leaning steel (default)" },
  cool: { color: 0x8f99a8, label: "blue-grey gunmetal (original)" },
};

export function resolveFinish() {
  try {
    const q = new URLSearchParams(location.search).get("finish");
    if (q && FINISHES[q]) return q;
  } catch {
    /* no location (SSR, worker) — fall through to the constant */
  }
  return FINISHES[MOTOR_FINISH] ? MOTOR_FINISH : "neutral";
}

const R = 4.25; // can radius, 8.5mm diameter
const LEN = 20; // can length
const SEG = 48; // radial segments. Deliberate: below this the specular streak
//                 facets visibly, and on a mirror cylinder that is glaring.

const lathe = (pts, segments = SEG) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segments
  );

// --- roughness map for the can wall ----------------------------------------
// Carries two things at once. A single stronger axial line is the seam: the can
// is rolled sheet, so the join runs LENGTHWISE, parallel to the shaft, not
// around the circumference. The rest is faint axial brushing, which stretches
// the specular highlight down the cylinder — the same thing the photos show —
// for the price of a texture rather than an anisotropic BRDF.
//
// Lathe UVs put u around the circumference and v along the profile, so a
// vertical line in this texture is an axial line on the can.
function canRoughnessTexture() {
  const w = 1024;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  // Base 0.16 encoded absolutely: the material multiplies by roughness, which
  // is left at ~1 so per-motor variation can scale this whole map.
  const base = Math.round(0.16 * 255);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, w, h);

  let s = 20250903;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 420; i++) {
    const v = Math.round((0.16 + (rnd() - 0.5) * 0.1) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rnd() * w, 0, 0.6 + rnd() * 1.8, h);
  }

  // the seam itself, at u=0 so a per-motor rotation of the can moves it
  const seam = Math.round(0.55 * 255);
  ctx.fillStyle = `rgb(${seam},${seam},${seam})`;
  ctx.fillRect(0, 0, 2.5, h);
  ctx.fillRect(w - 1.5, 0, 1.5, h);
  const halo = Math.round(0.3 * 255);
  ctx.fillStyle = `rgb(${halo},${halo},${halo})`;
  ctx.fillRect(2.5, 0, 2, h);
  ctx.fillRect(w - 4, 0, 2.5, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared assets. Geometry is built once and reused by all four motors; only the
// materials are per-motor, so each can carry its own roughness jitter.
export function buildMotorAssets(finishKey, maxAnisotropy = 1) {
  const finish = FINISHES[finishKey] ?? FINISHES.neutral;
  const rough = canRoughnessTexture();
  rough.anisotropy = maxAnisotropy;

  const geo = {
    // the straight mirror wall
    wall: lathe([
      [R, 1.3],
      [R, 18.7],
    ]),
    // rolled rim at the wire end: the wall turns out into a bead and back.
    // These beads are what separate "a stamped can" from "a metal tube" — each
    // one catches a bright ring of specular, eight across the drone.
    rimLow: lathe([
      [R, 0.1],
      [R + 0.3, 0.45],
      [R + 0.25, 0.95],
      [R, 1.3],
    ]),
    rimHigh: lathe([
      [R, 18.7],
      [R + 0.25, 19.05],
      [R + 0.3, 19.55],
      [R, 19.9],
    ]),
    // wire-end cap, inset 0.4mm inside the rim so a shadow ring sits round it
    capLow: lathe([
      [0, 0.5],
      [3.5, 0.5],
      [3.95, 0.25],
      [R, 0.1],
    ]),
    // output face, recessed, with the raised boss the shaft comes out of
    capHigh: lathe([
      [R, 19.9],
      [3.6, 19.6],
      [1.25, 19.6],
      [1.25, 20.2],
      [0, 20.2],
    ]),
    // shaft as a lathe rather than cylinder+torus: the circlip groove and the
    // chamfered tip come free, and it costs fewer triangles than the pair did
    shaft: lathe(
      [
        [0, 20.2],
        [0.5, 20.25],
        [0.5, 21.0],
        [0.4, 21.28],
        [0.5, 21.55],
        [0.5, 25.7],
        [0.34, 26.0],
        [0, 26.05],
      ],
      14
    ),
    grommet: new THREE.CylinderGeometry(0.75, 1.0, 0.9, 12),
  };

  const metal = (roughnessScale, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color: finish.color,
      metalness: 1,
      // The map holds absolute roughness; this scales it, which is how each
      // motor gets its own +/-0.02.
      roughness: roughnessScale,
      // Highest on the drone by design — the cans must out-reflect everything.
      envMapIntensity: 1.25,
      ...extra,
    });

  return {
    geo,
    rough,
    finish,
    finishKey,
    // per-motor material set
    makeMaterials(jitter) {
      const wall = metal(1 + jitter, { roughnessMap: rough });
      // the bead is scuffed by the forming process, so slightly duller
      const rim = metal(0.22 + jitter * 0.02);
      // satin caps against a mirror wall is one of the strongest material cues
      const cap = metal(0.34 + jitter * 0.02);
      return { wall, rim, cap };
    },
    // Bare polished steel, not plated: stays cool whatever the can finish is.
    shaftMat: new THREE.MeshStandardMaterial({
      color: 0xd8dce0,
      metalness: 1,
      roughness: 0.14,
      envMapIntensity: 1.1,
    }),
    grommetMat: new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0, roughness: 0.7 }),
    setColor(hex) {
      // used by the finish comparison harness
      [...this._cans].forEach((m) => m.color.setHex(hex));
    },
    _cans: new Set(),
  };
}

export function buildMotor(assets, index) {
  // deterministic per-motor variation — four identical objects read as
  // duplicated geometry, four slightly different ones read as four real parts
  let s = 7919 * (index + 1);
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const jitter = (rnd() - 0.5) * 0.25; // +/-0.02 on a 0.16 base
  const seamAngle = rnd() * Math.PI * 2;

  const { wall, rim, cap } = assets.makeMaterials(jitter);
  [wall, rim, cap].forEach((m) => assets._cans.add(m));

  const g = new THREE.Group();
  const can = new THREE.Group();
  can.add(new THREE.Mesh(assets.geo.wall, wall));
  can.add(new THREE.Mesh(assets.geo.rimLow, rim));
  can.add(new THREE.Mesh(assets.geo.rimHigh, rim));
  can.add(new THREE.Mesh(assets.geo.capLow, cap));
  can.add(new THREE.Mesh(assets.geo.capHigh, cap));
  // rotating the can moves the seam AND the end-cap orientation together
  can.rotation.y = seamAngle;
  g.add(can);

  g.add(new THREE.Mesh(assets.geo.shaft, assets.shaftMat));

  const grommet = new THREE.Mesh(assets.geo.grommet, assets.grommetMat);
  grommet.position.set(0, 0.15, 0);
  g.add(grommet);

  return { group: g, seamAngle };
}

// ---------------------------------------------------------------------------
// Twisted pair. Two strands wound helically around a sagging spine — real motor
// leads are twisted, limp and hair-fine, and a taut straight wire is one of the
// loudest CG tells there is.
export function twistedPair(from, to, colorA, colorB, seed, radius = 0.25) {
  const dist = from.distanceTo(to);
  const mid = from.clone().lerp(to, 0.5);
  mid.y -= dist * 0.3 + 1.5; // slack, not a catenary approximation
  mid.x += Math.sin(seed) * dist * 0.08;
  mid.z += Math.cos(seed * 1.7) * dist * 0.08;

  const spine = new THREE.CatmullRomCurve3([from, mid, to]);
  const len = spine.getLength();
  const N = 26;
  const sep = 0.34; // strand centres, so the pair reads ~1mm wide overall
  const period = 4; // mm per full twist

  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  const strands = [[], []];

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    spine.getPointAt(u, p);
    spine.getTangentAt(u, t).normalize();
    n.crossVectors(t, up);
    if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
    n.normalize();
    b.crossVectors(t, n).normalize();
    // taper the twist out at the ends so the strands meet where they enter the
    // grommet instead of splaying
    const taper = Math.min(1, Math.sin(Math.PI * u) * 1.6);
    const phase = ((u * len) / period) * Math.PI * 2 + seed;
    for (let k = 0; k < 2; k++) {
      const a = phase + k * Math.PI;
      strands[k].push(
        p
          .clone()
          .addScaledVector(n, Math.cos(a) * sep * taper)
          .addScaledVector(b, Math.sin(a) * sep * taper)
      );
    }
  }

  const group = new THREE.Group();
  [colorA, colorB].forEach((color, k) => {
    const curve = new THREE.CatmullRomCurve3(strands[k]);
    // 6 radial segments: at 0.5mm across, nobody will ever see the section
    const geo = new THREE.TubeGeometry(curve, 24, radius, 6, false);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    group.add(new THREE.Mesh(geo, mat));
  });
  return group;
}
