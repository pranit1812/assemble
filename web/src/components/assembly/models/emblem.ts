// Chest emblem: felt S-shield, rebuilt from a photo of the classic red/yellow shield
// (Unsplash, Jon Tyson). The photo was de-rotated and de-sheared into a unit grid
// (shield width = 1) and the yellow "negative space" pieces were traced from that grid.
// Layers, back to front: dark-red backing (thin outer border) -> yellow felt field ->
// red felt "S" piece (the S merged with the inner border, yellow shows through its holes).
// Frame: metres, origin = centre of the back surface, facing +z.
import * as THREE from 'three';

const W = 0.22; // shield width (m); height comes out at 0.77 W ~ 0.17 m

// Shield outline in unit coords (x right, y up), traced from the rectified photo.
const SHIELD: [number, number][] = [
  [-0.335, 0.385], [0.335, 0.385], [0.5, 0.189], [0, -0.385], [-0.5, 0.189],
];

// Yellow pieces that show through the red S layer. 's' = sharp corner, otherwise smooth.
type P = [number, number, 's'?];
const HOLES: P[][] = [
  // 1. upper-left sliver between the chamfer and the S's top curl
  [[-0.291, 0.322, 's'], [-0.246, 0.322, 's'], [-0.299, 0.283], [-0.340, 0.232], [-0.364, 0.178], [-0.376, 0.120, 's'], [-0.433, 0.190, 's']],
  // 2. big upper bowl, with the red hook biting in from the top right
  [
    [-0.090, 0.300], [0.157, 0.300, 's'], [0.157, 0.195, 's'], [0.306, 0.195, 's'], [0.306, 0.292, 's'],
    [0.328, 0.292, 's'], [0.448, 0.175, 's'], [0.433, 0.157], [0.299, 0.132], [0.149, 0.122], [0, 0.120],
    [-0.119, 0.128], [-0.164, 0.143], [-0.187, 0.187], [-0.179, 0.232], [-0.149, 0.274], [-0.119, 0.295],
  ],
  // 3. tiny notch under the hook's top-left
  [[0.162, 0.320, 's'], [0.192, 0.320, 's'], [0.180, 0.288, 's']],
  // 4. lower bowl, wrapped around the S's ball terminal
  [
    [-0.276, -0.010, 's'], [-0.149, -0.018], [0, -0.022], [0.104, -0.019], [0.137, -0.030], [0.149, -0.060],
    [0.145, -0.105], [0.131, -0.142], [0.104, -0.157], [0.0, -0.160, 's'], [-0.003, -0.127], [-0.018, -0.100],
    [-0.052, -0.084], [-0.097, -0.082], [-0.142, -0.093], [-0.176, -0.106], [-0.200, -0.098, 's'],
  ],
  // 5. bottom point triangle
  [[-0.097, -0.220, 's'], [0.0, -0.224], [0.104, -0.232, 's'], [0.0, -0.338, 's']],
];

/** Closed Catmull-Rom through the points; 's' points keep a hard corner. */
function smoothLoop(pts: P[], seg = 5): THREE.Vector2[] {
  const n = pts.length;
  const out: THREE.Vector2[] = [];
  const v = (i: number) => new THREE.Vector2(pts[(i + n) % n][0], pts[(i + n) % n][1]);
  for (let i = 0; i < n; i++) {
    const p1 = v(i), p2 = v(i + 1);
    const sharp1 = pts[i][2] === 's', sharp2 = pts[(i + 1) % n][2] === 's';
    if (sharp1 && sharp2) { out.push(p1); continue; }
    const m1 = sharp1 ? p2.clone().sub(p1).multiplyScalar(0.5) : v(i + 1).sub(v(i - 1)).multiplyScalar(0.5);
    const m2 = sharp2 ? p2.clone().sub(p1).multiplyScalar(0.5) : v(i + 2).sub(v(i)).multiplyScalar(0.5);
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push(new THREE.Vector2(
        h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
        h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
      ));
    }
  }
  return out;
}

/** Inset a convex polygon (CCW) by d, then round its corners with radius r. Unit coords. */
function shieldPath(inset: number, r: number, target: THREE.Shape | THREE.Path) {
  // CCW order for the offset maths
  const poly = SHIELD.map(([x, y]) => new THREE.Vector2(x, y)).reverse();
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = b.clone().sub(a).normalize();
    const nrm = new THREE.Vector2(-dir.y, dir.x); // inward for CCW
    return { p: a.clone().addScaledVector(nrm, inset), dir };
  });
  const corners = lines.map((L, i) => {
    const M = lines[(i - 1 + n) % n];
    // intersect M (prev edge) with L (this edge)
    const den = M.dir.x * L.dir.y - M.dir.y * L.dir.x;
    const t = ((L.p.x - M.p.x) * L.dir.y - (L.p.y - M.p.y) * L.dir.x) / den;
    return M.p.clone().addScaledVector(M.dir, t);
  });
  corners.forEach((c, i) => {
    const prev = corners[(i - 1 + n) % n], next = corners[(i + 1) % n];
    const a = c.clone().add(prev.clone().sub(c).normalize().multiplyScalar(r));
    const b = c.clone().add(next.clone().sub(c).normalize().multiplyScalar(r));
    if (i === 0) target.moveTo(a.x * W, a.y * W); else target.lineTo(a.x * W, a.y * W);
    target.quadraticCurveTo(c.x * W, c.y * W, b.x * W, b.y * W);
  });
  target.closePath();
}

// Deterministic felt fibre texture shared by all layers (greyscale, tinted by material colour).
let feltTex: THREE.CanvasTexture | null = null;
function feltTexture() {
  if (feltTex) return feltTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#f6f6f6';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI, l = 2 + rnd() * 7;
    const v = Math.round(205 + rnd() * 50);
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.4})`;
    g.lineWidth = 0.6 + rnd() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  feltTex = new THREE.CanvasTexture(c);
  feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping;
  feltTex.repeat.set(22, 22); // extrude UVs are in metres: one tile ~4.5 cm
  feltTex.colorSpace = THREE.SRGBColorSpace;
  feltTex.anisotropy = 4;
  return feltTex;
}

function felt(color: string, sheen: string) {
  const t = feltTexture();
  return new THREE.MeshPhysicalMaterial({
    color, map: t, bumpMap: t, bumpScale: 0.6, roughness: 0.96, metalness: 0,
    sheen: 0.9, sheenRoughness: 0.75, sheenColor: new THREE.Color(sheen),
  });
}

function slab(shape: THREE.Shape, depth: number, bevel: number, segs: number, curveSegs = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: segs, curveSegments: curveSegs,
  });
  g.translate(0, 0, bevel); // back face of the bevelled slab at local z = 0
  g.computeVertexNormals();
  return g;
}

export function buildEmblem(): THREE.Group | null {
  const group = new THREE.Group();
  group.name = 'emblem';

  const T_BACK = 0.0014, T_FIELD = 0.0012, T_S = 0.0018; // felt thicknesses (m)
  const B = 0.0004; // soft felt edge bevel

  // 1. backing / thin outer border: full shield, darker red
  const backShape = new THREE.Shape();
  shieldPath(0, 0.018, backShape);
  const back = new THREE.Mesh(slab(backShape, T_BACK - 2 * B, B, 2), felt('#9a0f16', '#ff8a80'));
  back.name = 'emblem-backing';

  // 2. yellow field
  const fieldShape = new THREE.Shape();
  shieldPath(0.012, 0.014, fieldShape);
  const field = new THREE.Mesh(slab(fieldShape, T_FIELD - 2 * B, B, 2), felt('#ffd23f', '#fff6c8'));
  field.name = 'emblem-field';
  field.position.z = T_BACK;

  // 3. red S piece: same outline as the field, with the yellow pieces cut out
  const sShape = new THREE.Shape();
  shieldPath(0.012, 0.014, sShape);
  for (const h of HOLES) {
    const pts = smoothLoop(h).map((p) => p.multiplyScalar(W));
    sShape.holes.push(new THREE.Path(pts));
  }
  const s = new THREE.Mesh(slab(sShape, T_S - 2 * B, B, 1), felt('#e0161c', '#ffa090'));
  s.name = 'emblem-s';
  s.position.z = T_BACK + T_FIELD;

  for (const m of [back, field, s]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  group.userData.parts = ['emblem-backing', 'emblem-field', 'emblem-s'];
  return group;
}
