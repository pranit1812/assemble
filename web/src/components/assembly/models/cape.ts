import * as THREE from 'three';

// Photo-derived procedural cape (img2threejs, compressed pipeline).
// Reference: seed/images.json "red-cape" (Pexels 13257637, back view of a red satin cape).
// Read from the photo: narrow gathered collar that wraps the neck and covers the shoulders,
// a strong trapezoid/bell flare (hem ~2x shoulder width), 3-4 broad radial folds that are
// flat over the shoulder blades and deepen toward a nearly straight hem with pointed corners,
// saturated scarlet satin with bright specular streaks on the fold ridges.
//
// Frame: metres, y-up, wearer faces +z. Group origin = attachment point at the back of the
// neck (assembly puts it at about (0, 1.5, -0.1)); the cape hangs 1.0 m down the back (-z).

const COLS = 64; // around the body
const ROWS = 80; // down the length
const LEN = 1.0;

/** Deterministic hash so the drape is identical on every build. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const PH1 = hash(3) * Math.PI * 2;
const PH2 = hash(11) * Math.PI * 2;

/** Cross-section of the drape at row v (0 = collar, 1 = hem). Elliptical arc around the body. */
function profile(v: number) {
  const settle = 1 - Math.exp(-v / 0.03); // collar -> shoulders transition
  const a = 0.095 + 0.14 * settle + 0.21 * v; // half width (flares to ~0.445 at the hem)
  const b = 0.1 + 0.045 * settle + 0.105 * Math.pow(v, 1.2); // depth behind the body centre
  const c = 0.1 - 0.03 * v * v; // body centre sits ~0.1 m in front of the attach point
  const span = THREE.MathUtils.degToRad(80 + 45 * Math.exp(-((v / 0.18) ** 2))); // wrap angle
  const x = v / 0.12;
  const drop = 0.035 + 0.08 * x * Math.exp(1 - x) - 0.06 * v * v; // side sag over the shoulders
  return { a, b, c, span, drop };
}

/** Broad radial folds (few, deepening toward the hem) plus small gathers at the collar. */
function fold(u: number, v: number): number {
  const amp = 0.055 * Math.pow(THREE.MathUtils.smoothstep(v, 0.04, 1), 1.15);
  const f =
    Math.sin(Math.PI * 2 * 3.5 * u + PH1 + 0.7 * v) +
    0.45 * Math.sin(Math.PI * 2 * 6.2 * u + PH2 - 0.5 * v);
  const gather = 0.012 * Math.exp(-v / 0.05) * Math.sin(Math.PI * 2 * 11 * u);
  return amp * f + gather;
}

function capePoint(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const p = profile(v);
  const s = u * 2 - 1;
  const phi = s * p.span;
  const d = fold(u, v);
  const sx = Math.sin(phi);
  const cz = Math.cos(phi);
  const x = (p.a + d) * sx;
  const z = p.c - (p.b + d) * cz;
  let y = -LEN * v - p.drop * s * s;
  y += 0.25 * fold(u, 1) * Math.pow(v, 6); // hem scallops where folds reach it
  return out.set(x, y, z);
}

function capeSurface(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= ROWS; j++) {
    const v = Math.pow(j / ROWS, 1.15); // denser rows at the collar where curvature is high
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS;
      capePoint(u, v, p);
      pos.push(p.x, p.y, p.z);
      uv.push(u, 1 - v);
    }
  }
  const row = COLS + 1;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Rolled edge along the open boundary (left side, hem, right side) so the cloth has a lip. */
function hemRoll(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 24;
  for (let k = 0; k <= n; k++) pts.push(capePoint(0, Math.pow(0.04 + (0.96 * k) / n, 1.15), new THREE.Vector3()));
  for (let k = 1; k <= 48; k++) pts.push(capePoint(k / 48, 1, new THREE.Vector3()));
  for (let k = n - 1; k >= 0; k--) pts.push(capePoint(1, Math.pow(0.04 + (0.96 * k) / n, 1.15), new THREE.Vector3()));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, 220, 0.004, 4, false);
}

function collarBand(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 32; k++) pts.push(capePoint(k / 32, 0, new THREE.Vector3()).add(new THREE.Vector3(0, -0.006, 0)));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.011, 8, false);
}

/** Drawstring tie: cord across the throat, a small knot, two bow loops and two tails. */
function tie(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cape-tie';
  const left = capePoint(0, 0, new THREE.Vector3());
  const right = capePoint(1, 0, new THREE.Vector3());
  const knot = new THREE.Vector3(0, -0.05, 0.215);
  const cordCurve = new THREE.CatmullRomCurve3([
    left,
    new THREE.Vector3(left.x * 0.55, -0.035, 0.2),
    knot,
    new THREE.Vector3(right.x * 0.55, -0.035, 0.2),
    right,
  ]);
  const cord = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 40, 0.0035, 5, false), mat);
  cord.name = 'cape-tie-cord';
  const k = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), mat);
  k.name = 'cape-tie-knot';
  k.position.copy(knot);
  k.scale.set(1.2, 0.9, 0.8);
  g.add(cord, k);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0032, 5, 20), mat);
    loop.name = `cape-tie-loop-${side < 0 ? 'l' : 'r'}`;
    loop.position.set(knot.x + side * 0.02, knot.y + 0.004, knot.z + 0.003);
    loop.scale.set(1.3, 0.75, 1);
    loop.rotation.set(0.25, side * 0.35, side * 0.25);
    const tail = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          knot.clone(),
          new THREE.Vector3(side * 0.012, knot.y - 0.04, knot.z + 0.006),
          new THREE.Vector3(side * 0.02, knot.y - 0.085, knot.z + 0.002),
        ]),
        12,
        0.003,
        5,
        false,
      ),
      mat,
    );
    tail.name = `cape-tie-tail-${side < 0 ? 'l' : 'r'}`;
    g.add(loop, tail);
  }
  return g;
}

export function buildCape(): THREE.Group | null {
  const root = new THREE.Group();
  root.name = 'cape';

  // Satin: saturated scarlet base, rough-ish body with a clearcoat lobe for the bright
  // specular streaks the photo shows along fold ridges, sheen for the cloth rim glow.
  const satin = new THREE.MeshPhysicalMaterial({
    name: 'cape-red-satin',
    color: '#c3111a',
    roughness: 0.45,
    metalness: 0,
    sheen: 0.8,
    sheenColor: new THREE.Color('#ff6a5c'),
    sheenRoughness: 0.3,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    side: THREE.DoubleSide,
  });

  const panel = new THREE.Mesh(capeSurface(), satin);
  panel.name = 'cape-panel';
  const hem = new THREE.Mesh(hemRoll(), satin);
  hem.name = 'cape-hem-roll';
  hem.userData.explodeWithParent = true;
  const collar = new THREE.Mesh(collarBand(), satin);
  collar.name = 'cape-collar';
  const ties = tie(satin);

  root.add(panel, hem, collar, ties);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.userData.sculptRuntime = {
    sockets: { neck: [0, 0, 0] },
    parts: ['cape-panel', 'cape-collar', 'cape-tie'],
  };
  return root;
}
