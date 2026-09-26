// Exploded 3D assembly view. Plain three.js inside one effect; React only owns the step state.
// Parts are simple primitives (shared/genui.ts AssemblyPart). Never throws: any WebGL failure
// falls back to a plain step list.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AssemblyPart, BlockOf } from '@shared/genui';
import { MODELS } from './models';

type Step = BlockOf<'AssemblyView'>['steps'][number];

const DUR = 900; // ms per part move
const STAGGER = 70; // ms between parts arriving in the same step
const GHOST = 0.18; // opacity of parts not yet assembled
const SHELL = 0.4; // opacity of container parts once assembled (so you can see inside)
const STEP_GAP = 1500; // ms between steps while playing

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const len = (v: unknown, min = 0.001) => Math.max(min, Math.abs(num(v, min)));

/** Sorted unique step numbers, taken from both the step list and the parts. */
function stepNumbers(steps: Step[], parts: AssemblyPart[]) {
  const s = new Set<number>();
  steps.forEach((x) => s.add(x.n));
  parts.forEach((p) => s.add(p.step));
  return [...s].sort((a, b) => a - b);
}

function makeGeometry(p: AssemblyPart): THREE.BufferGeometry {
  const [a, b, c] = p.size;
  switch (p.shape) {
    case 'box': {
      const w = len(a), h = len(b), d = len(c);
      const r = Math.min(w, h, d) * 0.22;
      return r > 0.004 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
    }
    case 'cylinder':
      return new THREE.CylinderGeometry(len(a, 0), len(c, 0), len(b), 48, 1); // three: (rTop, rBottom, h)
    case 'sphere':
      return new THREE.SphereGeometry(len(a), 40, 24);
    case 'cone':
      return new THREE.ConeGeometry(len(a), len(b), 40);
    case 'torus':
      return new THREE.TorusGeometry(len(a), Math.min(len(b), len(a)), 20, 72);
    case 'plane':
      return new THREE.PlaneGeometry(len(a), len(b));
    default:
      return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
}

/** Point (in the part's local space) inside the part's solid? Used to find containers. */
function insideLocal(p: AssemblyPart, v: THREE.Vector3) {
  const [a, b, c] = p.size;
  if (p.shape === 'box') return Math.abs(v.x) <= len(a) / 2 && Math.abs(v.y) <= len(b) / 2 && Math.abs(v.z) <= len(c) / 2;
  if (p.shape === 'sphere') return v.length() <= len(a);
  if (p.shape === 'cylinder') {
    const h = len(b);
    if (Math.abs(v.y) > h / 2) return false;
    const r = len(c, 0) + (len(a, 0) - len(c, 0)) * ((v.y + h / 2) / h);
    return Math.hypot(v.x, v.z) <= r;
  }
  return false;
}

/** A part is a "shell" (drawn see-through once assembled) when another part mostly sits inside it. */
function findShells(parts: AssemblyPart[], meshes: THREE.Mesh[], skip: Set<number>) {
  const shells = new Set<number>();
  const inv = new THREE.Matrix4();
  const probe = new THREE.Vector3();
  meshes.forEach((m) => m.updateMatrixWorld(true));
  parts.forEach((P, i) => {
    if (skip.has(i) || !['box', 'cylinder', 'sphere'].includes(P.shape)) return;
    inv.copy(meshes[i].matrixWorld).invert();
    for (let j = 0; j < parts.length && !shells.has(i); j++) {
      const Q = parts[j];
      if (i === j || skip.has(j) || Q.shape === 'torus' || Q.shape === 'plane') continue;
      const g = meshes[j].geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const ctr = bb.getCenter(new THREE.Vector3());
      const pts = [
        ctr.clone(),
        new THREE.Vector3(bb.min.x, ctr.y, ctr.z), new THREE.Vector3(bb.max.x, ctr.y, ctr.z),
        new THREE.Vector3(ctr.x, bb.min.y, ctr.z), new THREE.Vector3(ctr.x, bb.max.y, ctr.z),
        new THREE.Vector3(ctr.x, ctr.y, bb.min.z), new THREE.Vector3(ctr.x, ctr.y, bb.max.z),
      ];
      let hits = 0;
      for (const pt of pts) {
        probe.copy(pt).applyMatrix4(meshes[j].matrixWorld).applyMatrix4(inv);
        if (insideLocal(P, probe)) hits++;
      }
      if (hits >= 5 && insideLocal(P, probe.copy(ctr).applyMatrix4(meshes[j].matrixWorld).applyMatrix4(inv))) shells.add(i);
    }
  });
  return shells;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => {
      if (!mt) return;
      Object.values(mt).forEach((v) => (v as THREE.Texture | null)?.isTexture && (v as THREE.Texture).dispose());
      mt.dispose();
    });
  });
  root.removeFromParent();
}

function softDiscTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(0.55, '#bbb');
    grd.addColorStop(1, '#000');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

type Item = {
  part: AssemblyPart;
  mesh: THREE.Mesh; // primitive fallback
  mat: THREE.MeshStandardMaterial;
  anchorOnly: boolean; // model part with size [0,0,0]: never drawn as a primitive
  hidden: boolean; // a fallback primitive replaced by its component's loaded model
  model: THREE.Object3D | null;
  modelMats: { m: THREE.Material; base: number }[];
  modelMeshes: THREE.Mesh[];
  labelOffset: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  target: number;
  delay: number;
  stagger: number;
  max: number;
  shell: boolean;
  phase: number;
};

type Label = {
  key: string;
  item: Item; el: HTMLDivElement; pill: HTMLSpanElement; line: HTMLSpanElement; obj: CSS2DObject;
  lift: number; state: string; side: number; dx: number; dy: number; sx: number; sy: number;
};

export function AssemblyView({ block }: { block: BlockOf<'AssemblyView'> }) {
  const parts = useMemo(() => (Array.isArray(block?.parts) ? block.parts : []), [block]);
  const steps = useMemo(
    () => (Array.isArray(block?.steps) ? [...block.steps].sort((a, b) => a.n - b.n) : []),
    [block],
  );
  const ns = useMemo(() => stepNumbers(steps, parts), [steps, parts]);

  const mountRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const currentN = useRef<number>(-Infinity);
  const [idx, setIdx] = useState(-1); // -1 = fully exploded
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(parts.length === 0);

  currentN.current = idx >= 0 ? ns[idx] : -Infinity;
  const last = ns.length - 1;
  const stepInfo = idx >= 0 ? steps.find((s) => s.n === ns[idx]) : undefined;

  // Step player.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(
      () => {
        if (idx < last) setIdx(idx + 1);
        else setPlaying(false);
      },
      idx === -1 ? 450 : idx >= last ? 200 : STEP_GAP,
    );
    return () => window.clearTimeout(id);
  }, [playing, idx, last]);

  // Auto-play once when first scrolled into view.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The three.js scene.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || failed || parts.length === 0) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let labelRenderer: CSS2DRenderer | null = null;
    let controls: OrbitControls | null = null;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    const disposables: { dispose: () => void }[] = [];
    const loaded: THREE.Object3D[] = [];
    let disposed = false;
    const cleanups: (() => void)[] = [];

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return;
    }

    try {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const r = renderer;
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.setClearColor(0x000000, 0);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.NeutralToneMapping;
      r.toneMappingExposure = 1.05;
      r.domElement.style.display = 'block';
      r.domElement.style.outline = 'none';
      mount.appendChild(r.domElement);

      const lr = new CSS2DRenderer();
      labelRenderer = lr;
      Object.assign(lr.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      mount.appendChild(lr.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);

      // Lights: soft warm sky + one gentle key light that casts shadows.
      scene.add(new THREE.HemisphereLight(0xfff8ec, 0xcfc4b0, 1.25));
      const key = new THREE.DirectionalLight(0xfff3e2, 1.9);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
      scene.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xe8eefc, 0.35);
      scene.add(fill);

      // Parts.
      const items: Item[] = parts.map((p, i) => {
        const geo = makeGeometry(p);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(typeof p.color === 'string' ? p.color : '#a8a29e'),
          roughness: 0.7,
          metalness: 0,
          transparent: true,
          opacity: 0,
          side: p.shape === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
        });
        disposables.push(geo, mat);
        const mesh = new THREE.Mesh(geo, mat);
        const to = new THREE.Vector3(num(p.pos?.[0]), num(p.pos?.[1]), num(p.pos?.[2]));
        const ex = p.explode ?? [0, 0, 0];
        const from = to.clone().add(new THREE.Vector3(num(ex[0]), num(ex[1]), num(ex[2])));
        mesh.position.copy(to);
        if (p.rot) mesh.rotation.set(num(p.rot[0]), num(p.rot[1]), num(p.rot[2]));
        mesh.receiveShadow = true;
        scene.add(mesh);
        // size [0,0,0] + model = pure attachment anchor: the component's other primitives stand in until the model loads.
        const anchorOnly = !!p.model && p.size.every((v) => !num(v));
        mesh.visible = !anchorOnly;
        return {
          part: p, mesh, mat, from, to, t: 0, target: 0, delay: 0, stagger: 0, max: 1, shell: false, phase: i * 1.7,
          anchorOnly, hidden: false, model: null, modelMats: [], modelMeshes: [], labelOffset: new THREE.Vector3(),
        };
      });

      // Containers go see-through once assembled, so the inside stays readable.
      const anchors = new Set<number>();
      items.forEach((it, i) => it.anchorOnly && anchors.add(i));
      const shells = findShells(parts, items.map((it) => it.mesh), anchors);
      items.forEach((it, i) => {
        if (!shells.has(i)) return;
        it.shell = true;
        it.max = SHELL;
        it.mat.side = THREE.DoubleSide;
        it.mat.depthWrite = false;
        it.mesh.renderOrder = 2;
      });

      // Stagger within each step.
      const perStep = new Map<number, number>();
      items.forEach((it) => {
        const k = perStep.get(it.part.step) ?? 0;
        it.stagger = k * STAGGER;
        perStep.set(it.part.step, k + 1);
      });

      // Bounds over both assembled and exploded layouts, for framing and the ground disc.
      const bounds = new THREE.Box3();
      const tmpBox = new THREE.Box3();
      const assembledBox = new THREE.Box3();
      items.forEach((it) => {
        if (it.anchorOnly) return;
        it.mesh.position.copy(it.to);
        it.mesh.updateMatrixWorld(true);
        tmpBox.setFromObject(it.mesh);
        assembledBox.union(tmpBox);
        bounds.union(tmpBox);
        it.mesh.position.copy(it.from);
        it.mesh.updateMatrixWorld(true);
        tmpBox.setFromObject(it.mesh);
        bounds.union(tmpBox);
      });
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const groundY = assembledBox.isEmpty() ? 0 : assembledBox.min.y;
      let rXZ = 0.1;
      const corners = [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.z, bounds.max.z].map((z) => [x, z]));
      corners.forEach(([x, z]) => (rXZ = Math.max(rXZ, Math.hypot(x - center.x, z - center.z) * 0.8)));
      const radius = Math.max(0.5, Math.hypot(size.x, size.y, size.z) / 2);

      // Ground disc with a soft edge.
      const discTex = softDiscTexture();
      const discGeo = new THREE.CircleGeometry(Math.max(rXZ * 1.6, 1), 64);
      const discMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 1, transparent: true, alphaMap: discTex, depthWrite: false });
      disposables.push(discTex, discGeo, discMat);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(center.x, groundY - 0.002, center.z);
      disc.receiveShadow = true;
      disc.renderOrder = -1;
      scene.add(disc);

      key.position.set(center.x + radius * 1.4, groundY + radius * 2.6, center.z + radius * 1.8);
      key.target.position.set(center.x, groundY, center.z);
      fill.position.set(center.x - radius * 2, groundY + radius, center.z - radius);
      const sc = key.shadow.camera;
      sc.left = sc.bottom = -radius * 1.3;
      sc.right = sc.top = radius * 1.3;
      sc.near = 0.1;
      sc.far = radius * 8;
      sc.updateProjectionMatrix();

      // Camera + controls.
      const target = new THREE.Vector3(center.x, center.y, center.z);
      const viewDir = new THREE.Vector3(0.55, 0.32, 1).normalize();
      const fitDistance = (aspect: number) => {
        const v = THREE.MathUtils.degToRad(camera.fov);
        const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
        const dH = (size.y / 2) / Math.tan(v / 2);
        const dW = rXZ / Math.tan(h / 2);
        return Math.max(dH, dW) * 1.06 + rXZ * 0.35;
      };
      camera.position.copy(target).addScaledVector(viewDir, fitDistance(1.6));
      camera.lookAt(target);

      const ctl = new OrbitControls(camera, r.domElement);
      controls = ctl;
      ctl.target.copy(target);
      ctl.enableDamping = true;
      ctl.dampingFactor = 0.08;
      ctl.enablePan = false;
      ctl.autoRotate = !reduced;
      ctl.autoRotateSpeed = 0.7;
      ctl.maxPolarAngle = Math.PI / 2 - 0.08;
      ctl.minPolarAngle = 0.25;
      ctl.enableZoom = false; // wheel only zooms after the shopper engages, so the page still scrolls
      r.domElement.style.touchAction = 'pan-y'; // vertical swipes keep scrolling the page on phones
      const engage = () => (ctl.enableZoom = true);
      const disengage = () => (ctl.enableZoom = false);
      r.domElement.addEventListener('pointerdown', engage);
      r.domElement.addEventListener('pointerleave', disengage);
      cleanups.push(() => {
        r.domElement.removeEventListener('pointerdown', engage);
        r.domElement.removeEventListener('pointerleave', disengage);
      });

      // Labels: one per distinct (step, label), anchored to the first part carrying it.
      const labels: Label[] = [];
      const seen = new Set<string>();
      items.forEach((it) => {
        const key2 = `${it.part.step}|${it.part.label}`;
        if (seen.has(key2) || !it.part.label || it.anchorOnly) return;
        seen.add(key2);
        // The CSS2D element is a zero-size anchor at the part; the pill floats out to a side column
        // and a thin leader line joins them (laid out each frame so pills never pile up).
        const el = document.createElement('div');
        el.className = 'pointer-events-none select-none transition-opacity duration-300';
        Object.assign(el.style, { width: '0px', height: '0px', position: 'relative', opacity: '0' });
        const tip = document.createElement('span');
        tip.className = 'absolute block h-[5px] w-[5px] rounded-full bg-ink/45';
        Object.assign(tip.style, { left: '-2.5px', top: '-2.5px' });
        const line = document.createElement('span');
        line.className = 'absolute block h-px bg-ink/25';
        Object.assign(line.style, { left: '0px', top: '0px', transformOrigin: '0 0' });
        const pill = document.createElement('span');
        pill.className =
          'absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card/95 px-2 py-0.5 font-sans text-[11px] font-medium text-ink shadow-[var(--shadow-soft)]';
        const dot = document.createElement('i');
        dot.className = 'inline-block h-1.5 w-1.5 rounded-full';
        dot.style.background = typeof it.part.color === 'string' ? it.part.color : '#a8a29e';
        pill.append(dot, document.createTextNode(it.part.label));
        el.append(line, tip, pill);
        const obj = new CSS2DObject(el);
        obj.center.set(0.5, 0.5);
        scene.add(obj);
        it.mesh.geometry.computeBoundingBox();
        it.labelOffset.set(0, (it.mesh.geometry.boundingBox?.max.y ?? 0) * 0.2, 0);
        labels.push({ key: key2, item: it, el, pill, line, obj, lift: 0, state: '', side: 0, dx: 0, dy: 0, sx: 0, sy: 0 });
      });

      // Photo-derived models: start with the primitive, swap in the model when it arrives.
      // A model replaces its own primitive and every model-less primitive of the same component.
      items.forEach((it) => {
        const build = it.part.model ? MODELS[it.part.model] : undefined;
        if (!build) return;
        let pending: Promise<THREE.Object3D | null>;
        try {
          pending = Promise.resolve(build());
        } catch (err) {
          console.warn('[AssemblyView] model failed', it.part.model, err);
          return;
        }
        pending
          .then((obj) => {
            if (!obj) return;
            if (disposed) return disposeObject(obj);
            const mats: Item['modelMats'] = [];
            const meshes: THREE.Mesh[] = [];
            obj.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!m.isMesh) return;
              meshes.push(m);
              m.receiveShadow = true;
              (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => {
                if (!mt || mats.some((x) => x.m === mt)) return;
                mats.push({ m: mt, base: mt.transparent ? mt.opacity : 1 });
                mt.transparent = true;
              });
            });
            const rot = it.part.rot;
            if (rot) obj.rotation.set(num(rot[0]), num(rot[1]), num(rot[2]));
            obj.position.set(0, 0, 0);
            obj.updateMatrixWorld(true);
            const bb = new THREE.Box3().setFromObject(obj);
            if (!bb.isEmpty()) it.labelOffset.copy(bb.getCenter(new THREE.Vector3()));
            obj.position.copy(it.mesh.position);
            loaded.push(obj);
            scene.add(obj);
            it.model = obj;
            it.modelMats = mats;
            it.modelMeshes = meshes;
            it.mesh.visible = false;
            const comp = it.part.componentId;
            items.forEach((s2) => {
              if (s2 !== it && !s2.part.model && comp && s2.part.componentId === comp) {
                s2.hidden = true;
                s2.mesh.visible = false;
              }
            });
            labels.forEach((L) => {
              if (L.item.hidden || L.item === it || L.key === `${it.part.step}|${it.part.label}`) L.item = it;
            });
          })
          .catch((err) => console.warn('[AssemblyView] model failed', it.part.model, err));
      });

      // Resize.
      const view = { w: 1, h: 1 };
      const proj = new THREE.Vector3();
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const y of [bounds.min.y, bounds.max.y])
          ring.push(new THREE.Vector3(center.x + Math.cos(a) * rXZ, y, center.z + Math.sin(a) * rXZ));
      }
      const resize = () => {
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        view.w = w;
        view.h = h;
        r.setSize(w, h);
        lr.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Fit: start from an analytic guess, then project a ring around the layout and correct
        // distance + target height so everything sits centred with a small margin.
        const dir = camera.position.clone().sub(ctl.target).normalize();
        let d = fitDistance(camera.aspect);
        const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        for (let iter = 0; iter < 3; iter++) {
          camera.position.copy(ctl.target).addScaledVector(dir, d);
          camera.lookAt(ctl.target);
          camera.updateMatrixWorld();
          let minY = Infinity, maxY = -Infinity, maxX = 0;
          for (const pt of ring) {
            proj.copy(pt).project(camera);
            minY = Math.min(minY, proj.y);
            maxY = Math.max(maxY, proj.y);
            maxX = Math.max(maxX, Math.abs(proj.x));
          }
          if (!Number.isFinite(minY)) break;
          ctl.target.y += ((minY + maxY) / 2) * halfV * d;
          d *= Math.max(0.3, Math.max((maxY - minY) / 2, maxX) / 0.86);
        }
        camera.position.copy(ctl.target).addScaledVector(dir, d);
        ctl.minDistance = d * 0.55;
        ctl.maxDistance = d * 1.5;
        ctl.update();
      };
      resize();
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => resize());
        ro.observe(mount);
      }

      // Only render while on screen.
      let onScreen = true;
      if (typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver((es) => (onScreen = es.some((e) => e.isIntersecting)));
        io.observe(mount);
      }

      const onLost = (e: Event) => e.preventDefault();
      r.domElement.addEventListener('webglcontextlost', onLost);
      cleanups.push(() => r.domElement.removeEventListener('webglcontextlost', onLost));

      const start = performance.now();
      let prev = start;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(250, now - prev); // generous cap so throttled tabs still catch up
        prev = now;
        if (!onScreen) return;
        const n = currentN.current;
        const intro = ease(clamp01((now - start) / 700));
        const secs = now / 1000;
        for (const it of items) {
          const tgt = it.part.step <= n ? 1 : 0;
          if (tgt !== it.target) {
            it.target = tgt;
            it.delay = tgt ? it.stagger : 0;
          }
          if (it.delay > 0) it.delay -= dt;
          else if (it.t !== tgt) it.t = reduced ? tgt : clamp01(it.t + (Math.sign(tgt - it.t) * dt) / DUR);
          if (it.hidden) continue;
          const e = ease(it.t);
          const o3 = it.model ?? it.mesh;
          o3.position.lerpVectors(it.from, it.to, e);
          if (!reduced && e < 1) o3.position.y += Math.sin(secs * 1.3 + it.phase) * 0.018 * (1 - e);
          const op = (GHOST + (it.max - GHOST) * e) * intro;
          if (it.model) {
            for (const mm of it.modelMats) {
              mm.m.opacity = mm.base * op;
              mm.m.depthWrite = e > 0.97 && mm.base >= 1;
            }
            for (const m of it.modelMeshes) m.castShadow = e > 0.6;
          } else {
            it.mat.opacity = op;
            if (!it.shell) it.mat.depthWrite = e > 0.97;
            it.mesh.castShadow = !it.shell && e > 0.6;
          }
        }
        ctl.update();
        // Label layout in screen space: anchors left of centre get pills in a left column, right
        // of centre a right column; each column is stacked top-down with a minimum gap.
        const W = view.w, H = view.h;
        proj.copy(ctl.target).project(camera);
        const cx = (proj.x * 0.5 + 0.5) * W;
        const col = Math.max(70, Math.min(W * 0.26, 230));
        const live: Label[] = [];
        for (const L of labels) {
          L.obj.position.copy((L.item.model ?? L.item.mesh).position).add(L.item.labelOffset);
          const st = L.item.part.step > n || L.item.t < 0.6 ? 'off' : L.item.part.step === n ? 'on' : 'past';
          if (st !== L.state) {
            L.state = st;
            L.el.style.opacity = st === 'off' ? '0' : st === 'on' ? '1' : '0.6';
          }
          proj.copy(L.obj.position).project(camera);
          L.sx = (proj.x * 0.5 + 0.5) * W;
          L.sy = (-proj.y * 0.5 + 0.5) * H;
          const want = L.sx < cx - 10 ? -1 : L.sx > cx + 10 ? 1 : L.side || 1;
          if (L.side === 0 || want !== L.side) L.side = want;
          if (st !== 'off') live.push(L);
        }
        // Keep the two columns roughly balanced: move the labels nearest the centre across.
        const cap = Math.ceil(live.length / 2) + 1;
        for (const side of [-1, 1]) {
          const mine = live.filter((L) => L.side === side).sort((a, b) => Math.abs(a.sx - cx) - Math.abs(b.sx - cx));
          for (let i = 0; i < mine.length - cap; i++) mine[i].side = -side;
        }
        const GAP = 26;
        for (const side of [-1, 1]) {
          const colL = live.filter((L) => L.side === side).sort((a, b) => a.sy - b.sy);
          const ys: number[] = [];
          colL.forEach((L, i) => ys.push(Math.max(L.sy - 6, i ? ys[i - 1] + GAP : 14)));
          for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - GAP : H - 14);
          colL.forEach((L, i) => {
            const y = ys[i];
            const px = cx + side * col;
            const tdx = px - L.sx, tdy = y - L.sy;
            const k = L.dx === 0 && L.dy === 0 ? 1 : 0.18;
            L.dx += (tdx - L.dx) * k;
            L.dy += (tdy - L.dy) * k;
            const len2 = Math.hypot(L.dx, L.dy);
            L.line.style.width = `${len2}px`;
            L.line.style.transform = `rotate(${Math.atan2(L.dy, L.dx)}rad)`;
            L.pill.style.transform = `translate(${L.dx}px, ${L.dy}px) translate(${side < 0 ? '-100%' : '0'}, -50%)`;
          });
        }
        r.render(scene, camera);
        lr.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
    } catch (err) {
      console.warn('[AssemblyView] falling back to step list', err);
      cancelAnimationFrame(raf);
      setFailed(true);
    }

    return () => {
      disposed = true;
      loaded.forEach(disposeObject);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      cleanups.forEach((f) => f());
      controls?.dispose();
      disposables.forEach((d) => d.dispose());
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
      labelRenderer?.domElement.remove();
    };
  }, [parts, failed]);

  const go = (i: number) => {
    setPlaying(false);
    setIdx(Math.max(-1, Math.min(last, i)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (idx >= last) setIdx(-1);
    setPlaying(true);
  };

  if (failed) return <StepList block={block} steps={steps} parts={parts} />;

  return (
    <div ref={cardRef} className="rise overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 sm:px-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Assembly</div>
          <div className="font-display text-2xl leading-tight text-ink">{block.title}</div>
        </div>
        <div className="hidden font-mono text-[11px] text-faint sm:block">drag to turn</div>
      </div>

      <div
        ref={mountRef}
        className="relative h-[320px] cursor-grab bg-[radial-gradient(ellipse_at_50%_45%,#fbf9f4_0%,#f3efe6_75%)] active:cursor-grabbing sm:h-[420px]"
        aria-label={`3D assembly of ${block.title}`}
        role="img"
      />

      <div className="border-t border-line px-5 pb-5 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {ns.map((n, i) => (
              <button
                key={n}
                onClick={() => go(i)}
                aria-label={`Step ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === idx ? 'w-6 bg-accent' : i < idx ? 'w-2 bg-ink/70' : 'w-2 bg-line hover:bg-faint'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => go(idx - 1)}
              disabled={idx < 0}
              aria-label="Previous step"
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink transition hover:border-ink/40 disabled:opacity-35"
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={togglePlay}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:brightness-125"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? 'Pause' : idx >= last ? 'Replay' : 'Play'}
            </button>
            <button
              onClick={() => go(idx + 1)}
              disabled={idx >= last}
              aria-label="Next step"
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink transition hover:border-ink/40 disabled:opacity-35"
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>

        <div className="mt-4 min-h-[72px]" aria-live="polite">
          {stepInfo || idx >= 0 ? (
            <div key={idx} className="rise">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Step {idx + 1} of {ns.length}
              </div>
              <div className="mt-0.5 font-display text-[22px] leading-snug text-ink">{stepInfo?.title ?? `Step ${ns[idx]}`}</div>
              {stepInfo?.text && <p className="mt-0.5 text-sm leading-relaxed text-muted">{stepInfo.text}</p>}
            </div>
          ) : (
            <div className="rise">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                {ns.length} steps · {new Set(parts.map((p) => p.label)).size} parts
              </div>
              <div className="mt-0.5 font-display text-[22px] leading-snug text-ink">Everything you gathered, in order.</div>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">Press play to watch it come together.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepList({ block, steps, parts }: { block: BlockOf<'AssemblyView'>; steps: Step[]; parts: AssemblyPart[] }) {
  return (
    <div className="rise rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Assembly</div>
      <div className="font-display text-2xl leading-tight text-ink">{block?.title}</div>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => {
          const here = [...new Map(parts.filter((p) => p.step === s.n).map((p) => [p.label, p])).values()];
          return (
            <li key={s.n} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] text-paper">{i + 1}</span>
              <div>
                <div className="font-display text-xl leading-snug text-ink">{s.title}</div>
                <p className="text-sm leading-relaxed text-muted">{s.text}</p>
                {here.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {here.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink">
                        <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
  </svg>
);
const PlayIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7.5-4.5z" /></svg>
);
const PauseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" /></svg>
);

export default AssemblyView;
