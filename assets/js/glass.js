// WebGL glass, twice: the hero's one enormous block, and the process wall that assembles as you scroll.
// Without WebGL (or with reduced motion for the wall) the poster image and the drawn diagram stay in place.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/addons/RoundedBoxGeometry.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';

const hero = document.querySelector('.hero');
const host = hero?.querySelector('.hero__glass');
const canvas = hero?.querySelector('.hero__canvas');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}

// Concentric square ridges, flat and clear in the middle: the pressed pattern of a glass block.
function rippleNormalMap(size = 512, rings = 6) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const h = (x, y) => {
    const u = x / size - 0.5, v = y / size - 0.5;
    const d = Math.max(Math.abs(u), Math.abs(v)) * 2;
    return Math.sin(d * Math.PI * 2 * rings) * smooth(0.42, 0.7, d) * (1 - smooth(0.93, 1, d));
  };
  const k = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

let ripples;
const glassMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.5, ior: 1.52, dispersion: 0.35,
  attenuationColor: new THREE.Color('#c8f5e4'), attenuationDistance: 6, clearcoat: 1, clearcoatRoughness: 0.03,
  specularIntensity: 1, envMapIntensity: 1.15, normalMap: (ripples ||= rippleNormalMap()), normalScale: new THREE.Vector2(1.1, 1.1),
});
function lightScene(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  return scene;
}
const flat = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const scene = lightScene(renderer);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const glass = glassMaterial();

  const blockGeo = new RoundedBoxGeometry(1, 1, 0.44, 8, 0.075);
  const block = new THREE.Mesh(blockGeo, glass);
  const smallA = new THREE.Mesh(blockGeo, glass);
  const smallB = new THREE.Mesh(blockGeo, glass);

  const plane = new THREE.PlaneGeometry(1, 1);
  const field = new THREE.Mesh(plane, flat('#a6f0d6'));

  const rig = new THREE.Group();
  rig.add(field, block, smallA, smallB);
  scene.add(rig);

  // Layout in pixels, converted to world units, so the block is cropped exactly as the design says.
  const L = { S: 1 };
  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const phone = innerWidth < 768;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const upp = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;

    let side, cx, cy;
    if (phone) { side = 1.3 * w; cx = 0.5 * w; cy = 0.06 * h + side / 2; }
    else { side = 0.9 * innerHeight; cx = Math.max(48, 0.12 * w) + side / 2; cy = 0.6 * h; }
    L.S = side * upp;
    L.x = (cx - w / 2) * upp;
    L.y = -(cy - h / 2) * upp;
    L.phone = phone;
  }

  const state = { px: 0, py: 0, tx: 0, ty: 0, scroll: 0, t0: performance.now() };
  if (finePointer && !reduced) {
    addEventListener('pointermove', (e) => {
      state.tx = (e.clientX / innerWidth - 0.5) * 2;
      state.ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  addEventListener('scroll', () => { state.scroll = Math.min(1, scrollY / Math.max(1, hero.offsetHeight)); }, { passive: true });

  const easeExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

  function pose(now) {
    const S = L.S;
    const intro = reduced ? 1 : easeExpo(Math.min(1, (now - state.t0) / 1800));
    const idle = reduced ? 0 : (now - state.t0) / 1000;
    state.px += (state.tx - state.px) * 0.05;
    state.py += (state.ty - state.py) * 0.05;
    const sc = state.scroll;

    block.scale.set(S, S, S).multiplyScalar(0.86 + 0.14 * intro);
    block.position.set(L.x, L.y + sc * 0.22 * S, 0);
    block.rotation.set(
      -0.16 + state.py * 0.12 + Math.sin(idle * 0.35) * 0.025 + sc * 0.45,
      0.24 + (1 - intro) * 0.9 + state.px * 0.16 + Math.sin(idle * 0.27) * 0.03 + sc * 0.5,
      0.04 + (1 - intro) * -0.12
    );

    // the flat accent field sits behind, its corner passing under the glass
    const fs = L.phone ? 0.78 * S : 0.7 * S;
    field.scale.set(fs, fs, 1);
    field.position.set(L.x + (L.phone ? -0.08 : 0.2) * S + (1 - intro) * 0.5 * S, L.y - (L.phone ? 0.05 : 0.16) * S - sc * 0.1 * S, -1.4 * S);

    const a = 0.13 * S;
    smallA.scale.set(a, a, a);
    smallA.position.set(L.x - 0.47 * S, L.y - 0.62 * S - sc * 0.2 * S, 0.6 * S);
    smallA.rotation.set(0.5 + idle * 0.08 + state.py * 0.2, 0.7 + idle * 0.11, 0.2);
    const b = 0.065 * S;
    smallB.scale.set(b, b, b);
    smallB.position.set(L.x - 0.32 * S, L.y + 0.56 * S + sc * 0.3 * S, 0.9 * S);
    smallB.rotation.set(-0.3 + idle * 0.13, 0.4 - idle * 0.09, -0.3);
    smallA.visible = smallB.visible = !L.phone;
  }

  let running = false, visible = true, frame = 0;
  function tick(now) {
    pose(now);
    renderer.render(scene, camera);
    if (!frame++) hero.classList.add('is-live');
    if (running) requestAnimationFrame(tick);
  }
  function play() {
    if (running || reduced || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(tick);
  }
  const stop = () => { running = false; };

  layout();
  if (reduced) { pose(performance.now()); renderer.render(scene, camera); hero.classList.add('is-live'); }
  else play();

  new ResizeObserver(() => { layout(); if (!running) { pose(performance.now()); renderer.render(scene, camera); } }).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : stop(); }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
}

// Process: 48 blocks go from scattered (Discovery) to a tight ribbon (Analysis) to ordered rows (Strategy)
// to one finished wall (Partnership), scrubbed by the scroll through a pinned stage.
function startWall() {
  const section = document.querySelector('.process');
  const stage = section?.querySelector('.process__stage');
  const wallCanvas = stage?.querySelector('.process__canvas');
  if (!wallCanvas || reduced || innerWidth < 768) return;
  section.classList.add('has-scene');
  const track = section.querySelector('.process__body');
  const phases = [...section.querySelectorAll('.phases li')];
  phases.forEach((li) => li.removeAttribute('data-reveal'));

  const renderer = new THREE.WebGLRenderer({ canvas: wallCanvas, antialias: true, powerPreference: 'high-performance' });
  const scene = lightScene(renderer);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const COLS = 8, ROWS = 6, N = COLS * ROWS, GAP = 1.04;
  const blocks = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 0.46, 3, 0.08), glassMaterial(), N);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat('#a6f0d6'));
  field.scale.set(6.4, 4.6, 1);
  field.position.set(1.6, -0.9, -2.6);
  const rig = new THREE.Group();
  rig.add(field, blocks);
  scene.add(rig);

  let seed = 11; const rnd = (a, b) => a + (b - a) * ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const K = [[], [], [], []], delay = [];
  for (let i = 0; i < N; i++) {
    const c = i % COLS, r = Math.floor(i / COLS), j = i % 16, k = Math.floor(i / 16);
    K[0].push({ p: V(rnd(-5.4, 5.4), rnd(-3.3, 3.3), rnd(-3, 1.2)), r: V(rnd(-1.6, 1.6), rnd(-1.6, 1.6), rnd(-1.6, 1.6)) });
    K[1].push({ p: V((j - 7.5) * 0.66, (k - 1) * 0.64 + (j - 7.5) * 0.1, -0.6 + j * 0.04), r: V(0.18, 0.5, 0.12) });
    K[2].push({ p: V((c - 3.5) * 1.28, (r - 2.5) * 1.22, (r % 2) * 0.5 - 0.25), r: V(0, (r % 2 ? 0.22 : -0.22), 0) });
    K[3].push({ p: V((c - 3.5) * GAP, (r - 2.5) * GAP, 0), r: V(0, 0, 0) });
    delay.push(((c + r * 3) % 9) / 9);
  }
  const STOPS = [[0.16, 0.3], [0.41, 0.55], [0.66, 0.8]];
  const smooth = (t) => t * t * (3 - 2 * t);
  const dummy = new THREE.Object3D(), pa = new THREE.Vector3(), ra = new THREE.Vector3();

  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // framed on the widest state (the spaced rows), so no block is cut by the canvas edge
    camera.position.set(0, 0, Math.max((COLS * 1.28 * 0.62) / (tanV * camera.aspect), (ROWS * 1.22 * 0.64) / tanV));
    camera.updateProjectionMatrix();
  }

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  let active = -1;
  function frame() {
    const r = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    let seg = 2, f = 1;
    for (let s = 0; s < 3; s++) {
      const [a, b] = STOPS[s];
      if (p < a) { seg = s; f = 0; break; }
      if (p <= b) { seg = s; f = (p - a) / (b - a); break; }
    }
    for (let i = 0; i < N; i++) {
      const t = smooth(Math.min(1, Math.max(0, f * 1.4 - delay[i] * 0.4)));
      const A = K[seg][i], B = K[seg + 1][i];
      pa.lerpVectors(A.p, B.p, t);
      ra.lerpVectors(A.r, B.r, t);
      dummy.position.copy(pa);
      dummy.rotation.set(ra.x, ra.y, ra.z);
      dummy.updateMatrix();
      blocks.setMatrixAt(i, dummy.matrix);
    }
    blocks.instanceMatrix.needsUpdate = true;
    pointer.sx += (pointer.x - pointer.sx) * 0.06;
    pointer.sy += (pointer.y - pointer.sy) * 0.06;
    rig.rotation.set(0.1 + pointer.sy * 0.12, 0.5 - p * 0.36 + pointer.sx * 0.2, 0);
    renderer.render(scene, camera);
    const now = p < 0.24 ? 0 : p < 0.49 ? 1 : p < 0.74 ? 2 : 3;
    if (now !== active) { active = now; phases.forEach((li, i) => li.classList.toggle('is-active', i === now)); }
  }

  let running = false, visible = false;
  const loop = () => { if (!running) return; frame(); requestAnimationFrame(loop); };
  const play = () => { if (running || !visible || document.hidden) return; running = true; requestAnimationFrame(loop); };
  fit();
  frame();
  new ResizeObserver(() => { fit(); frame(); }).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : (running = false); }).observe(track);
  document.addEventListener('visibilitychange', () => (document.hidden ? (running = false) : play()));
}

if (hasWebGL()) {
  if (hero && canvas) { try { start(); } catch (err) { console.warn('Glass hero fell back to the still image.', err); } }
  try { startWall(); } catch (err) { document.querySelector('.process')?.classList.remove('has-scene'); console.warn('Process wall fell back to the drawn diagram.', err); }
}
