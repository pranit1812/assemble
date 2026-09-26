import * as THREE from 'three';

// Photo-derived procedural cape (img2threejs, compressed pipeline).
// Frame: metres, y-up, wearer faces +z. Group origin = attachment point at the back of the
// neck; the cape hangs down the back (-z) about 1.0 m to knee height and flares at the hem.

const COLS = 44; // across the width
const ROWS = 84; // down the length

/** Deterministic hash noise so every build drapes identically. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function capeSurface(): THREE.BufferGeometry {
  const LEN = 1.0;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // fold phases (seeded) so folds are irregular, not a perfect sine
  const phase = [0, 1, 2, 3].map((i) => hash(i + 7) * Math.PI * 2);

  for (let j = 0; j <= ROWS; j++) {
    const v = j / ROWS; // 0 top .. 1 hem
    const halfW = THREE.MathUtils.lerp(0.19, 0.38, Math.pow(v, 0.85));
    // how strongly the edges wrap forward around the body (strong at the shoulders)
    const wrap = THREE.MathUtils.lerp(1.6, 0.35, Math.min(1, v * 2.2));
    const back = 0.03 + 0.1 * v + 0.05 * v * v; // clearance behind the back, billow at hem
    const foldAmp = 0.004 + 0.045 * Math.pow(v, 1.3);
    for (let i = 0; i <= COLS; i++) {
      const u = i / COLS;
      const s = u * 2 - 1; // -1 .. 1
      const x = s * halfW;
      let z = -back + wrap * x * x;
      // folds: many small gathers at the neck, fewer deeper folds at the hem
      const f1 = Math.sin(u * Math.PI * 2 * 4.5 + phase[0]);
      const f2 = Math.sin(u * Math.PI * 2 * 2.5 + phase[1]) * 0.6;
      const f3 = Math.sin(u * Math.PI * 2 * 9 + phase[2]) * (1 - v) * 0.5;
      z += foldAmp * (f1 + f2) + 0.006 * f3 * (1 - v);
      // shoulder drop at the top edge, gentle hem curve (edges slightly higher)
      let y = -LEN * v;
      y -= 0.07 * s * s * (1 - v) * (1 - v);
      y += 0.03 * s * s * v * v;
      pos.push(x, y, z);
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
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCape(): THREE.Group | null {
  const root = new THREE.Group();
  root.name = 'cape';

  const satin = new THREE.MeshPhysicalMaterial({
    name: 'cape-red-satin',
    color: '#b5121b',
    roughness: 0.45,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color('#ff5a4f'),
    sheenRoughness: 0.35,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(capeSurface(), satin);
  body.name = 'cape-panel';
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  return root;
}
