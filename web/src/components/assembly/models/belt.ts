// Yellow belt: satin ribbon band + card buckle, rebuilt from two photos (Pexels satin ribbon
// rolls, Shkraba Anthony; Unsplash gold buckle, Ruan Richard Rodrigues). The ribbon carries
// the satin read (bright anisotropic streak along its length, fine weave); the buckle carries
// the buckle read (rounded-rectangle frame with a rounded rim, centre bar, prong lying across
// the opening). DIY version: the frame is gold-foiled card, so it is only half metallic.
// Frame: metres, origin = waist centre, band level at y = 0, buckle at the front (+z).
import * as THREE from 'three';

const RX = 0.152; // half-width  (left-right): mannequin waist 0.143 + ~1 cm clearance
const RZ = 0.104; // half-depth (front-back): mannequin waist 0.094 + ~1 cm clearance (~0.81 m round)
const H = 0.05; // ribbon height
const T = 0.0012; // ribbon thickness
const SEG = 144;

function weaveTexture() {
  const w = 64, h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, w, h);
  // fine weft lines running along the ribbon (u axis) + a little yarn noise
  for (let y = 0; y < h; y += 2) {
    const v = Math.round(222 + rnd() * 33);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 90; i++) {
    const v = Math.round(225 + rnd() * 30);
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 14, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tiny studio equirect (soft top light, warm horizon, two softboxes) so the satin and the
 *  gold foil have something to reflect even in a scene without an environment map. */
function studioEnv() {
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.45, '#f1e6d2');
  sky.addColorStop(0.55, '#9c8f7c');
  sky.addColorStop(1, '#3c362f');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(20, 14, 18, 14);
  g.fillRect(84, 18, 14, 10);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Closed elliptical ribbon: outer face, inner face, top and bottom edges. */
function bandGeometry() {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  // arc length for u so the weave doesn't stretch at the sides
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2 + Math.PI / 2; // start at the front (+z)
    pts.push(new THREE.Vector2(Math.cos(a) * RX, Math.sin(a) * RZ));
  }
  const len = [0];
  for (let i = 1; i <= SEG; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const ring = (off: number, ny: number, y: number, v: number, flip: boolean) => {
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const p = pts[i];
      const n = new THREE.Vector2(p.x / (RX * RX), p.y / (RZ * RZ)).normalize();
      pos.push(p.x + n.x * off, y, p.y + n.y * off);
      if (ny !== 0) nor.push(0, ny, 0);
      else nor.push(n.x * (flip ? -1 : 1), 0, n.y * (flip ? -1 : 1));
      uv.push(len[i] / 0.03, v);
    }
    return base;
  };
  const strip = (a: number, b: number, flip: boolean) => {
    for (let i = 0; i < SEG; i++) {
      const a0 = a + i, a1 = a + i + 1, b0 = b + i, b1 = b + i + 1;
      if (flip) idx.push(a0, a1, b0, b0, a1, b1);
      else idx.push(a0, b0, a1, b0, b1, a1);
    }
  };
  const h = H / 2, o = T / 2;
  // x/z of the ellipse maps to x/z here; winding chosen so faces point outward
  const oBot = ring(o, 0, -h, 0, false), oTop = ring(o, 0, h, 1, false);
  strip(oBot, oTop, false);
  const iBot = ring(-o, 0, -h, 0, true), iTop = ring(-o, 0, h, 1, true);
  strip(iBot, iTop, true);
  const tIn = ring(-o, 1, h, 1, false), tOut = ring(o, 1, h, 1, false);
  strip(tIn, tOut, true);
  const bIn = ring(-o, -1, -h, 0, false), bOut = ring(o, -1, -h, 0, false);
  strip(bIn, bOut, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function roundRect(s: THREE.Shape | THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
}

export function buildBelt(): THREE.Group | null {
  const group = new THREE.Group();
  group.name = 'belt';

  const env = studioEnv();
  const weave = weaveTexture();
  weave.repeat.set(1, 1);
  const satin = new THREE.MeshPhysicalMaterial({
    color: '#ffbf14', map: weave, bumpMap: weave, bumpScale: 0.12,
    roughness: 0.3, metalness: 0, envMap: env, envMapIntensity: 0.55,
    sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color('#fff1b8'),
    anisotropy: 0.7, anisotropyRotation: 0, clearcoat: 0.15, clearcoatRoughness: 0.4,
  });
  const band = new THREE.Mesh(bandGeometry(), satin);
  band.name = 'belt-band';
  group.add(band);

  // Buckle: gold card frame with a rounded rim, centre bar and prong.
  const gold = new THREE.MeshPhysicalMaterial({
    color: '#f3c24e', metalness: 0.85, roughness: 0.26, envMap: env, envMapIntensity: 1.1, clearcoat: 0.6, clearcoatRoughness: 0.2,
  });
  const OW = 0.078, OH = 0.068, RIM = 0.008, D = 0.0008, BV = 0.0026;
  const frameShape = new THREE.Shape();
  const BS = 0.003; // bevel grows the outline, so pre-shrink the frame and pre-grow the hole
  roundRect(frameShape, OW - 2 * BS, OH - 2 * BS, 0.014 - BS);
  const hole = new THREE.Path();
  roundRect(hole, OW - 2 * RIM + 2 * BS, OH - 2 * RIM + 2 * BS, 0.011 + BS);
  frameShape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: D, bevelEnabled: true, bevelThickness: BV, bevelSize: BS,
    bevelSegments: 4, curveSegments: 8,
  });
  frameGeo.translate(0, 0, BV);
  const zFront = RZ + T; // outer ribbon surface at the front
  const frame = new THREE.Mesh(frameGeo, gold);
  frame.name = 'belt-buckle-frame';
  frame.position.z = zFront + 0.0006;
  group.add(frame);

  const barGeo = new THREE.CylinderGeometry(0.0028, 0.0028, OH - 2 * RIM + 0.004, 12);
  const bar = new THREE.Mesh(barGeo, gold);
  bar.name = 'belt-buckle-bar';
  bar.position.set(0.006, 0, zFront + 0.0032);
  group.add(bar);

  // prong: hinged on the centre bar, resting on the left rim
  const prongLen = OW / 2 - 0.006 + 0.002;
  const prongGeo = new THREE.CapsuleGeometry(0.0021, prongLen, 4, 10);
  prongGeo.rotateZ(Math.PI / 2);
  const prong = new THREE.Mesh(prongGeo, gold);
  prong.name = 'belt-buckle-prong';
  prong.position.set(0.006 - prongLen / 2 - 0.001, 0, zFront + 0.0056);
  prong.rotation.y = -0.04;
  group.add(prong);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  group.userData.parts = ['belt-band', 'belt-buckle-frame', 'belt-buckle-bar', 'belt-buckle-prong'];
  return group;
}
