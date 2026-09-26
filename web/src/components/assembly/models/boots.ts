import * as THREE from 'three';
import { legCurve, legSection, sweep, uAtHeight } from './suit';

// Red boot covers (the plan's secondhand pick, used once): knee-high PU-vinyl shoe covers
// (photo reference: seed/images.json "red-boot-covers" + "red-vinyl" close-up).
// They are swept along the SAME leg path as the mannequin in suit.ts, with the leg's own
// section plus an ease allowance, so they fit the calves and feet exactly.
// Frame: metres, y-up, toes toward +z, origin = centre between the feet on the ground.

const RED = '#c0161f';
const TOP = 0.475; // top of the shaft, just under the knee (knee ~0.5)

export function buildBoots(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'boots';
  const vinyl = new THREE.MeshPhysicalMaterial({
    color: RED,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
    sheen: 0,
  });
  vinyl.name = 'boot-vinyl';
  const cuffMat = vinyl.clone();
  cuffMat.name = 'boot-cuff';
  cuffMat.roughness = 0.4;
  const sole = new THREE.MeshStandardMaterial({ color: '#7a0f14', roughness: 0.7 });
  sole.name = 'boot-sole';

  // deterministic crease pattern (soft horizontal slouch rings + one vertical fold)
  const creases = (side: number) => {
    const rings = [
      { y: 0.14, a: 0.0035, w: 0.012, ph: 0.4 },
      { y: 0.2, a: 0.004, w: 0.014, ph: 1.9 },
      { y: 0.27, a: 0.0028, w: 0.012, ph: 3.1 },
      { y: 0.36, a: 0.0018, w: 0.016, ph: 5.0 },
    ];
    return (p: THREE.Vector3, th: number) => {
      if (p.y < 0.1) return 0;
      let d = 0;
      for (const r of rings) {
        // each ring wanders in height around the leg so it reads as a slouch, not a groove
        const yy = r.y + 0.012 * Math.sin(th * 2 + r.ph * side);
        d += r.a * Math.exp(-(((p.y - yy) / r.w) ** 2)) * (0.6 + 0.4 * Math.cos(th - r.ph));
      }
      // a long shallow fold down the outside of the shaft
      const out = side > 0 ? -Math.PI / 2 : -Math.PI / 2;
      const dth = Math.atan2(Math.sin(th - out - 0.5), Math.cos(th - out - 0.5));
      d += 0.0022 * Math.exp(-((dth / 0.18) ** 2)) * Math.max(0, Math.min(1, (0.42 - p.y) / 0.2));
      return d;
    };
  };

  for (const side of [1, -1] as const) {
    const g = new THREE.Group();
    g.name = side > 0 ? 'boot-r' : 'boot-l';
    const curve = legCurve(side, 0.016);
    const uTop = uAtHeight(curve, TOP);
    const crease = creases(side);
    const EASE = 0.009;
    const shaft = sweep(curve, {
      t0: uTop,
      t1: 1,
      lenSegs: 64,
      radSegs: 28,
      n0: new THREE.Vector3(0, 0, 1),
      section: (p) => {
        const s = legSection(p);
        const foot = p.y < 0.1 ? 0.004 : 0; // a little looser over the foot
        return { rx: s.rx + EASE + foot, rz: s.rz + EASE + foot, off: s.off };
      },
      capEnd: 0.045,
      displace: (p, th) => crease(p, th),
      clampY: 0.0,
    });
    const m = new THREE.Mesh(shaft.geometry, vinyl);
    m.name = side > 0 ? 'boot-shell-r' : 'boot-shell-l';
    g.add(m);

    // folded top edge: a rolled lip plus a short turned-down band
    const p = curve.getPointAt(uTop);
    const s = legSection(p);
    const lip = new THREE.TorusGeometry(1, 0.1, 8, 36);
    lip.rotateX(Math.PI / 2);
    const lr = { x: s.rx + EASE + 0.004, z: s.rz + EASE + 0.004 };
    lip.scale(lr.x, 0.07, lr.z);
    lip.translate(p.x, p.y, p.z + (s.off ?? 0));
    const lipMesh = new THREE.Mesh(lip, cuffMat);
    lipMesh.name = side > 0 ? 'boot-cuff-lip-r' : 'boot-cuff-lip-l';
    g.add(lipMesh);

    const uBand = uAtHeight(curve, TOP - 0.035);
    const band = sweep(curve, {
      t0: uTop,
      t1: uBand,
      lenSegs: 6,
      radSegs: 28,
      n0: new THREE.Vector3(0, 0, 1),
      section: (q) => {
        const t = legSection(q);
        const k = (TOP - q.y) / 0.035; // band flares slightly toward its lower edge
        return { rx: t.rx + EASE + 0.006 + 0.002 * k, rz: t.rz + EASE + 0.006 + 0.002 * k, off: t.off };
      },
    });
    const bandMesh = new THREE.Mesh(band.geometry, cuffMat);
    bandMesh.name = side > 0 ? 'boot-cuff-r' : 'boot-cuff-l';
    g.add(bandMesh);

    // thin darker sole line where the cover meets the floor
    const toe = curve.getPointAt(0.999);
    const soleGeo = new THREE.CylinderGeometry(1, 1, 0.006, 28);
    soleGeo.scale(0.05, 1, (toe.z + 0.075) / 2);
    soleGeo.translate(p.x + side * 0.003, 0.003, (toe.z - 0.075) / 2 + 0.004);
    const soleMesh = new THREE.Mesh(soleGeo, sole);
    soleMesh.name = side > 0 ? 'boot-sole-r' : 'boot-sole-l';
    g.add(soleMesh);

    g.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.castShadow = true;
        mm.receiveShadow = true;
      }
    });
    root.add(g);
  }
  return root;
}
