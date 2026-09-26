import * as THREE from 'three';

// The blue suit, worn: a smooth, faceless fashion mannequin wearing the shopper's own blue
// long-sleeve stretch top and blue leggings (photo reference: seed/images.json "blue" category).
// Frame: metres, y-up, facing +z, origin = centre between the feet on the ground.
// Landmarks other parts rely on: shoulders 0.42 m wide at y 1.45, chest surface z 0.13 at
// y 1.3, waist y 1.0, back of neck about (0, 1.5, -0.1), feet 0.11 m either side, knee y 0.5.
//
// Every body part is a swept elliptical section (a lathe generalised to an ellipse, or a
// tapered tube along a Catmull-Rom path with rotation-minimising frames), so joins are
// smooth rounded forms rather than stacked primitives. Boots (boots.ts) reuse the leg path.

// ---------- shared sweep helper ----------

export interface Section {
  rx: number; // half-width along the side axis
  rz: number; // half-depth along the forward (transported) axis
  off?: number; // shift of the section centre along the forward axis
}

export interface SweepOpts {
  t0?: number;
  t1?: number;
  lenSegs: number;
  radSegs: number;
  section: (p: THREE.Vector3, u: number) => Section;
  n0: THREE.Vector3; // initial forward axis; transported along the path
  capStart?: number; // rounded cap length in metres (0 = open end)
  capEnd?: number;
  displace?: (p: THREE.Vector3, theta: number, u: number) => number; // radial offset (m)
  clampY?: number; // flatten anything below this height (soles)
  splitU?: number[]; // geometry-group boundaries along u (material index increments)
}

export interface Sweep {
  geometry: THREE.BufferGeometry;
  /** A point on the swept surface (used for seam lines). */
  surface: (u: number, theta: number, lift?: number) => THREE.Vector3;
}

function frameAt(curve: THREE.Curve<THREE.Vector3>, us: number[], n0: THREE.Vector3) {
  const P: THREE.Vector3[] = [];
  const N: THREE.Vector3[] = [];
  const B: THREE.Vector3[] = [];
  let n = n0.clone();
  for (const u of us) {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    n = n.sub(t.clone().multiplyScalar(n.dot(t))).normalize();
    P.push(p);
    N.push(n.clone());
    B.push(new THREE.Vector3().crossVectors(t, n).normalize());
  }
  return { P, N, B };
}

export function sweep(curve: THREE.Curve<THREE.Vector3>, o: SweepOpts): Sweep {
  const t0 = o.t0 ?? 0;
  const t1 = o.t1 ?? 1;
  const L = curve.getLength() * (t1 - t0);
  const capS = o.capStart ?? 0;
  const capE = o.capEnd ?? 0;
  const dense = capS > 0 || capE > 0 ? 0.55 : 0;
  const us: number[] = [];
  for (let i = 0; i <= o.lenSegs; i++) {
    const x = i / o.lenSegs;
    const e = x - (dense * Math.sin(2 * Math.PI * x)) / (2 * Math.PI); // bunch rings at caps
    us.push(t0 + (t1 - t0) * e);
  }
  const { P, N, B } = frameAt(curve, us, o.n0);

  const capK = (u: number) => {
    const s = (u - t0) / (t1 - t0) * L;
    const e = L - s;
    let k = 1;
    if (capS > 0 && s < capS) k *= Math.sqrt(Math.max(0, 1 - (1 - s / capS) ** 2));
    if (capE > 0 && e < capE) k *= Math.sqrt(Math.max(0, 1 - (1 - e / capE) ** 2));
    return Math.max(k, 0.015);
  };

  const pointAt = (p: THREE.Vector3, n: THREE.Vector3, b: THREE.Vector3, u: number, th: number, lift = 0) => {
    const s = o.section(p, u);
    const k = capK(u);
    const d = (o.displace ? o.displace(p, th, u) : 0) + lift;
    const rz = s.rz * k + d;
    const rx = s.rx * k + d;
    const v = p.clone()
      .addScaledVector(n, (s.off ?? 0) + rz * Math.cos(th))
      .addScaledVector(b, rx * Math.sin(th));
    if (o.clampY !== undefined && v.y < o.clampY) v.y = o.clampY;
    return v;
  };

  const R = o.radSegs;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < us.length; i++) {
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * Math.PI * 2;
      const v = pointAt(P[i], N[i], B[i], us[i], th);
      pos.push(v.x, v.y, v.z);
      uv.push(j / R, (us[i] - t0) / (t1 - t0));
    }
  }
  const idx: number[] = [];
  // winding check on a middle quad so faces point outward
  const mid = Math.floor(o.lenSegs / 2);
  const a = new THREE.Vector3().fromArray(pos, (mid * (R + 1)) * 3);
  const b = new THREE.Vector3().fromArray(pos, ((mid + 1) * (R + 1)) * 3);
  const c = new THREE.Vector3().fromArray(pos, (mid * (R + 1) + 1) * 3);
  const fn = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  const flip = fn.dot(a.clone().sub(P[mid])) < 0;
  const geo = new THREE.BufferGeometry();
  const splits = (o.splitU ?? []).slice().sort((x, y) => x - y);
  let group = 0;
  let groupStart = 0;
  for (let i = 0; i < o.lenSegs; i++) {
    while (group < splits.length && us[i] >= splits[group]) {
      geo.addGroup(groupStart, idx.length - groupStart, group);
      groupStart = idx.length;
      group++;
    }
    for (let j = 0; j < R; j++) {
      const p0 = i * (R + 1) + j;
      const p1 = (i + 1) * (R + 1) + j;
      if (flip) idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
      else idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
    }
  }
  if (splits.length) geo.addGroup(groupStart, idx.length - groupStart, group);
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  // weld the seam column's normals so the sweep reads as one smooth surface
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < us.length; i++) {
    const f = i * (R + 1);
    const l = f + R;
    tmp.set(nrm.getX(f) + nrm.getX(l), nrm.getY(f) + nrm.getY(l), nrm.getZ(f) + nrm.getZ(l)).normalize();
    nrm.setXYZ(f, tmp.x, tmp.y, tmp.z);
    nrm.setXYZ(l, tmp.x, tmp.y, tmp.z);
  }

  const surface = (u: number, th: number, lift = 0) => {
    // re-transport from the start so the frame matches the sweep's
    const all = frameAt(curve, [...us.filter((x) => x < u), u], o.n0);
    const k = all.P.length - 1;
    return pointAt(all.P[k], all.N[k], all.B[k], u, th, lift);
  };
  return { geometry: geo, surface };
}

/** 1D Catmull-Rom through keyed rows [x, v1, v2, ...]; returns the interpolated values. */
export function keyed(keys: number[][], x: number): number[] {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0].slice(1);
  if (x >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const t = (x - k1[0]) / (k2[0] - k1[0]);
  const out: number[] = [];
  for (let c = 1; c < k1.length; c++) {
    const p0 = k0[c], p1 = k1[c], p2 = k2[c], p3 = k3[c];
    out.push(
      0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t),
    );
  }
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- body landmarks (right side, x > 0; mirrored for the left) ----------

/** Leg path: hip joint -> thigh -> knee -> calf -> ankle -> instep -> toe. */
export const LEG_KNOTS: [number, number, number][] = [
  [0.084, 0.96, 0.0],
  [0.097, 0.76, 0.012],
  [0.105, 0.5, 0.014],
  [0.108, 0.3, -0.008],
  [0.11, 0.16, -0.016],
  [0.11, 0.095, -0.018],
  [0.11, 0.058, 0.01],
  [0.112, 0.045, 0.075],
  [0.114, 0.04, 0.14],
  [0.116, 0.038, 0.185],
];

// leg section by height: y, rx (side), rz (front-back), off (forward shift)
const LEG_Y: number[][] = [
  [0.1, 0.034, 0.037, 0.0],
  [0.16, 0.035, 0.038, 0.0],
  [0.26, 0.046, 0.05, -0.006],
  [0.35, 0.053, 0.059, -0.011],
  [0.44, 0.05, 0.053, -0.003],
  [0.5, 0.05, 0.052, 0.006],
  [0.58, 0.058, 0.06, 0.004],
  [0.7, 0.071, 0.074, 0.004],
  [0.82, 0.082, 0.082, 0.0],
  [0.9, 0.084, 0.084, 0.0],
  [0.96, 0.062, 0.066, 0.0], // tapers inside the pelvis so no rim shows at the hip
];
// foot section by forward distance: z, rx (width), rz (height), off
const FOOT_Z: number[][] = [
  [-0.01, 0.036, 0.042, 0.0],
  [0.04, 0.041, 0.036, -0.004],
  [0.1, 0.045, 0.028, -0.005],
  [0.16, 0.043, 0.02, -0.004],
  [0.2, 0.04, 0.017, -0.004],
];

/** Section of the bare leg + foot at a path point (shared with the boots). */
export function legSection(p: THREE.Vector3): Section {
  const [lx, lz, lo] = keyed(LEG_Y, p.y);
  const [fx, fz, fo] = keyed(FOOT_Z, p.z);
  const w = smooth(-0.015, 0.05, p.z) * (1 - smooth(0.075, 0.13, p.y));
  return { rx: lx + (fx - lx) * w, rz: lz + (fz - lz) * w, off: lo + (fo - lo) * w };
}

export function legCurve(side: 1 | -1, extraToe = 0): THREE.CatmullRomCurve3 {
  const pts = LEG_KNOTS.map(([x, y, z]) => new THREE.Vector3(x * side, y, z));
  if (extraToe > 0) {
    const last = pts[pts.length - 1];
    pts.push(new THREE.Vector3(last.x + 0.001 * side, last.y - 0.001, last.z + extraToe));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/** Arc parameter on the vertical part of a leg path where the path crosses height y. */
export function uAtHeight(curve: THREE.Curve<THREE.Vector3>, y: number): number {
  let lo = 0;
  let hi = 0.8;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (curve.getPointAt(m).y > y) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

const ARM_KNOTS: [number, number, number][] = [
  [0.16, 1.44, -0.01],
  [0.198, 1.375, -0.012],
  [0.215, 1.26, -0.02],
  [0.235, 1.12, -0.03],
  [0.252, 1.0, -0.012],
  [0.27, 0.885, 0.008],
  [0.281, 0.82, 0.018],
  [0.287, 0.72, 0.022],
];
// arm section by height: y, rx (side), rz (front-back), off
const ARM_Y: number[][] = [
  [0.72, 0.014, 0.03, 0.004],
  [0.78, 0.017, 0.043, 0.004],
  [0.84, 0.019, 0.041, 0.0],
  [0.88, 0.022, 0.026, 0.0],
  [0.95, 0.029, 0.033, 0.0],
  [1.05, 0.037, 0.038, 0.0],
  [1.13, 0.035, 0.037, 0.0],
  [1.24, 0.041, 0.043, 0.0],
  [1.34, 0.049, 0.052, 0.0],
  [1.42, 0.052, 0.055, 0.0],
];

// torso (elliptical lathe): y, half-width, half-depth, forward shift
const TORSO_Y: number[][] = [
  [0.845, 0.075, 0.058, -0.01],
  [0.875, 0.128, 0.088, -0.008],
  [0.915, 0.154, 0.1, -0.006],
  [0.95, 0.156, 0.099, -0.004],
  [1.0, 0.143, 0.094, 0.0],
  [1.07, 0.14, 0.098, 0.004],
  [1.17, 0.152, 0.108, 0.01],
  [1.27, 0.166, 0.118, 0.012],
  [1.33, 0.174, 0.117, 0.008],
  [1.39, 0.18, 0.109, 0.0],
  [1.43, 0.178, 0.099, -0.005],
  [1.46, 0.155, 0.086, -0.009],
  [1.485, 0.1, 0.068, -0.01],
  [1.505, 0.064, 0.058, -0.01],
  [1.515, 0.057, 0.054, -0.01],
];
const T0 = 0.845;
const TLEN = 1.515 - T0;

const HEAD_Y: number[][] = [
  [1.575, 0.042, 0.05, 0.02],
  [1.6, 0.056, 0.068, 0.014],
  [1.64, 0.068, 0.088, 0.006],
  [1.69, 0.075, 0.099, -0.002],
  [1.74, 0.073, 0.096, -0.008],
  [1.8, 0.05, 0.06, -0.012],
];

// ---------- materials ----------

// royal blue sampled from the leggings photo (lit ~#3a62d0, shade ~#2446a8); the top is a hair
// lighter, as the bodysuit reference shows a separate knit with a softer satin sheen
const SUIT_BLUE = '#2c55c4';
const TOP_BLUE = '#3460cb';
const SKIN = '#e8dccb';

function knitTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  // fine jersey rib: soft vertical wales with deterministic jitter
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < 64; x++) {
    const w = 0.5 + 0.5 * Math.sin((x / 64) * Math.PI * 2 * 8);
    for (let y = 0; y < 64; y++) {
      const v = Math.round(110 + 90 * w + (rnd() - 0.5) * 30);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 30);
  return t;
}

function fabric(color: string, bump: THREE.Texture | null) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
    bumpMap: bump ?? undefined,
    bumpScale: 0.35,
  });
}

// ---------- build ----------

export function buildSuit(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'suit';
  const bump = knitTexture();
  const top = fabric(TOP_BLUE, bump);
  top.name = 'suit-top';
  const leggings = fabric(SUIT_BLUE, bump);
  leggings.name = 'suit-leggings';
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62, metalness: 0 });
  skin.name = 'mannequin';
  const seamMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SUIT_BLUE).multiplyScalar(0.62),
    roughness: 0.85,
  });

  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const ridge = (x: number, at: number, w: number, h: number) =>
    h * Math.exp(-(((x - at) / w) ** 2));

  // torso: elliptical lathe; leggings below the top's hem at y 0.93
  const HEM = 0.93;
  const torsoLine = new THREE.LineCurve3(new THREE.Vector3(0, T0, 0), new THREE.Vector3(0, T0 + TLEN, 0));
  const torso = sweep(torsoLine, {
    lenSegs: 60,
    radSegs: 48,
    n0: new THREE.Vector3(0, 0, 1),
    section: (p) => {
      const [rx, rz, off] = keyed(TORSO_Y, p.y);
      return { rx, rz, off };
    },
    capStart: 0.03,
    displace: (p) => ridge(p.y, HEM + 0.008, 0.006, 0.0035) - ridge(p.y, 0.985, 0.004, 0.0012),
    splitU: [(HEM - T0) / TLEN],
  });
  add('suit-torso', torso.geometry, [leggings, top]);

  // collar: ribbed crew neck band
  const collar = new THREE.TorusGeometry(1, 0.13, 8, 48);
  collar.rotateX(Math.PI / 2);
  collar.scale(0.058, 0.055, 0.054);
  collar.translate(0, 1.508, -0.01);
  add('suit-collar', collar, top);

  // legs: leggings to the ankle hem, bare mannequin foot below
  for (const side of [1, -1] as const) {
    const curve = legCurve(side);
    const uAnkle = uAtHeight(curve, 0.105);
    const leg = sweep(curve, {
      lenSegs: 70,
      radSegs: 28,
      n0: new THREE.Vector3(0, 0, 1),
      section: (p) => legSection(p),
      capEnd: 0.035,
      displace: (_p, _th, u) => ridge(u, uAnkle - 0.012, 0.006, 0.0025),
      splitU: [uAnkle],
    });
    add(side > 0 ? 'suit-leg-r' : 'suit-leg-l', leg.geometry, [leggings, skin]);

    // outer side seam of the leggings
    const seamPts: THREE.Vector3[] = [];
    const uHip = 0.02;
    const th = (-side * Math.PI) / 2; // outer side of each leg
    for (let k = 0; k <= 24; k++) {
      const u = uHip + ((uAnkle - 0.02 - uHip) * k) / 24;
      seamPts.push(leg.surface(u, th, 0.0008));
    }
    const seam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts), 48, 0.0016, 4, false);
    const sm = add(side > 0 ? 'suit-seam-leg-r' : 'suit-seam-leg-l', seam, seamMat);
    sm.castShadow = false;
  }

  // arms: sleeves to the wrist cuff, mannequin hands below
  for (const side of [1, -1] as const) {
    const curve = new THREE.CatmullRomCurve3(
      ARM_KNOTS.map(([x, y, z]) => new THREE.Vector3(x * side, y, z)),
      false,
      'centripetal',
    );
    const uWrist = uAtHeight(curve, 0.885);
    const arm = sweep(curve, {
      lenSegs: 56,
      radSegs: 24,
      n0: new THREE.Vector3(0, 0, 1),
      section: (p) => {
        const [rx, rz, off] = keyed(ARM_Y, p.y);
        return { rx, rz, off };
      },
      capStart: 0.05,
      capEnd: 0.03,
      displace: (_p, _th, u) => (u < uWrist ? ridge(u, uWrist - 0.03, 0.02, 0.0025) : 0),
      splitU: [uWrist],
    });
    add(side > 0 ? 'suit-arm-r' : 'suit-arm-l', arm.geometry, [top, skin]);
  }

  // torso side seams of the top
  for (const side of [1, -1] as const) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 20; k++) {
      const u = (HEM + 0.015 - T0) / TLEN + ((1.37 - HEM - 0.015) / TLEN) * (k / 20);
      pts.push(torso.surface(u, (side * Math.PI) / 2, 0.0008));
    }
    const seam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0016, 4, false);
    const sm = add(side > 0 ? 'suit-seam-side-r' : 'suit-seam-side-l', seam, seamMat);
    sm.castShadow = false;
  }

  // neck and faceless head
  const neckLine = new THREE.LineCurve3(new THREE.Vector3(0, 1.44, -0.012), new THREE.Vector3(0, 1.63, -0.008));
  const neck = sweep(neckLine, {
    lenSegs: 10,
    radSegs: 24,
    n0: new THREE.Vector3(0, 0, 1),
    section: (p) => ({ rx: 0.047 - (p.y - 1.44) * 0.02, rz: 0.048 - (p.y - 1.44) * 0.02 }),
  });
  add('suit-neck', neck.geometry, skin);

  const headLine = new THREE.LineCurve3(new THREE.Vector3(0, 1.575, 0), new THREE.Vector3(0, 1.8, 0));
  const head = sweep(headLine, {
    lenSegs: 28,
    radSegs: 32,
    n0: new THREE.Vector3(0, 0, 1),
    section: (p) => {
      const [rx, rz, off] = keyed(HEAD_Y, p.y);
      return { rx, rz, off };
    },
    capStart: 0.03,
    capEnd: 0.05,
  });
  add('suit-head', head.geometry, skin);

  return root;
}
