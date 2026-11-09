import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSolarSystem, SCALES } from './scene/solarSystem.js';
import { CameraRig } from './scene/cameraRig.js';
import { CATALOG, ORDER } from './data/catalog.js';
import { InfoPanel } from './ui/panel.js';

const $ = (s) => document.querySelector(s);

// ---------- State ----------
const state = {
  simMs: Date.now(),
  speed: 3600, // sim seconds per real second
  playing: true,
  mode: 'visual',
  selected: null,
};

// ---------- Renderer / camera ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.0005, 1e7);
camera.position.set(0, 90, 220);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 1.2;
controls.enablePan = false;
controls.maxDistance = 2e5;

const rig = new CameraRig(camera, controls);
if (import.meta.env.DEV) window.__app = { camera, controls, rig, state, get system() { return system; } };
let system = null;

// ---------- UI ----------
const panel = new InfoPanel($('#panel'), {
  onClose: () => select(null),
  onSelect: (id) => select(id),
  getSimMs: () => state.simMs,
});

function buildObjectList() {
  const ul = $('#object-list');
  ul.innerHTML = ORDER.map((id) => {
    const o = CATALOG[id];
    return `<li><button data-id="${id}" class="obj ${o.parent ? 'child' : ''}">
      <i style="--c:${o.color}"></i><span><b>${o.name}</b><small>${o.kind}</small></span></button></li>`;
  }).join('');
  ul.querySelectorAll('button').forEach((b) => { b.onclick = () => select(b.dataset.id); });
}

const labels = {};
function buildLabels() {
  const host = $('#labels');
  for (const id of ORDER) {
    const div = document.createElement('button');
    div.className = `label ${CATALOG[id].parent ? 'small' : ''}`;
    div.style.setProperty('--c', CATALOG[id].color);
    div.innerHTML = `<i></i>${CATALOG[id].name}`;
    div.onclick = () => select(id);
    host.appendChild(div);
    labels[id] = div;
  }
}

// ---------- Selection & camera flights ----------
const UP = new THREE.Vector3(0, 1, 0);
function litViewDir(obj) {
  // Three-quarter view from the sunny side.
  return () => {
    const p = obj.anchor.getWorldPosition(new THREE.Vector3());
    const toSun = p.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(UP, toSun).normalize();
    return toSun.multiplyScalar(0.8).addScaledVector(side, 0.6).addScaledVector(UP, 0.35);
  };
}
function surfaceViewDir(obj) {
  return () => {
    const p = obj.anchor.getWorldPosition(new THREE.Vector3());
    const c = obj.center.getWorldPosition(new THREE.Vector3());
    const out = p.clone().sub(c).normalize();
    const toSun = c.clone().negate().normalize();
    return out.addScaledVector(toSun, 1.1).addScaledVector(UP, 0.1);
  };
}

function select(id, { duration } = {}) {
  if (!system) return;
  state.selected = id;
  document.querySelectorAll('#object-list button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  Object.entries(labels).forEach(([k, el]) => el.classList.toggle('active', k === id));
  if (!id) { panel.close(); overview(); return; }
  panel.open(id);
  const obj = system.objects[id];
  const R = obj.radius();
  if (id === 'sun') {
    const dir = camera.position.clone().sub(controls.target).normalize();
    rig.flyTo(obj, { distance: R * 4.2, dir, duration: duration ?? 1.8, minDistance: R * 1.3 });
  } else if (obj.center) {
    rig.flyTo(obj, { distance: R * 1.1, dir: surfaceViewDir(obj), duration: duration ?? 2.2, minDistance: R * 0.03 });
  } else {
    rig.flyTo(obj, { distance: R * 4.5, dir: litViewDir(obj), duration: duration ?? 2, minDistance: R * 1.2 });
  }
}

function overview(duration = 1.8) {
  const s = SCALES[state.mode];
  const target = new THREE.Vector3();
  const cam = new THREE.Vector3(0, s.earthOrbit * 0.6, s.earthOrbit * 1.55);
  rig.flyToPoint(target, cam, duration);
  controls.minDistance = s.sunR * 1.3;
}

// ---------- Picking & hover ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  const owner = new Map();
  for (const [id, o] of Object.entries(system.objects)) {
    for (const m of o.pick) { if (m.visible !== false) { meshes.push(m); owner.set(m, id); } }
  }
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  // Markers win over the body they sit on.
  const marker = hits.find((h) => h.object.isSprite);
  return owner.get((marker || hits[0]).object);
}

let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || !system) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 5) return;
  const id = pick(e);
  if (id) select(id);
});
canvas.addEventListener('dblclick', () => select(null));

const tip = $('#hover-tip');
let hoverFrame = 0;
canvas.addEventListener('pointermove', (e) => {
  if (!system || ++hoverFrame % 2) return;
  const id = pick(e);
  canvas.style.cursor = id ? 'pointer' : 'grab';
  if (id && id !== state.selected) {
    tip.hidden = false;
    tip.textContent = `${CATALOG[id].name} — click to fly`;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  } else tip.hidden = true;
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

// ---------- Time controls ----------
const playBtn = $('#play-btn');
function setPlaying(p) {
  state.playing = p;
  playBtn.textContent = p ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
}
playBtn.onclick = () => setPlaying(!state.playing);
$('#speeds').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    state.speed = Number(b.dataset.speed);
    $('#speeds').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    setPlaying(true);
  };
});
$('#now-btn').onclick = () => { state.simMs = Date.now(); panel.refresh(true); };
const dateInput = $('#date-input');
dateInput.addEventListener('change', () => {
  const v = Date.parse(`${dateInput.value}:00Z`);
  if (!Number.isNaN(v)) { state.simMs = v; panel.refresh(true); }
});

document.querySelectorAll('[data-scale]').forEach((b) => {
  b.onclick = () => {
    if (state.mode === b.dataset.scale) return;
    state.mode = b.dataset.scale;
    document.querySelectorAll('[data-scale]').forEach((x) => x.classList.toggle('active', x === b));
    system.update(state.simMs, state.mode, clock.elapsedTime, camera);
    if (state.selected) select(state.selected, { duration: 1.2 }); else overview(1.2);
  };
});

$('#overview-btn').onclick = () => select(null);
$('#brand').onclick = () => select(null);
$('#about-btn').onclick = () => $('#about').showModal();
$('#intro-about').onclick = () => $('#about').showModal();

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Escape' && !$('#about').open) select(null);
  if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
  const n = Number(e.key);
  if (n >= 1 && n <= ORDER.length) select(ORDER[n - 1]);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Loop ----------
const clock = new THREE.Clock();
const pad = (n) => String(n).padStart(2, '0');
let uiTimer = 0;
const v3 = new THREE.Vector3();

function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const id of ORDER) {
    const o = system.objects[id];
    const el = labels[id];
    if (o.anchor.visible === false) { el.hidden = true; continue; }
    o.anchor.getWorldPosition(v3);
    const dist = camera.position.distanceTo(v3);
    if (o.center) {
      // Surface point on the far side of its body → hide.
      const c = o.center.getWorldPosition(new THREE.Vector3());
      const normal = v3.clone().sub(c);
      const toCam = camera.position.clone().sub(v3);
      if (normal.dot(toCam) < 0) { el.hidden = true; continue; }
    }
    v3.project(camera);
    const behind = v3.z > 1;
    // Hide a body's label when we're right on top of it (the panel names it).
    const tooClose = !o.center && dist < o.radius() * 2.2;
    el.hidden = behind || tooClose;
    if (el.hidden) continue;
    const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
    // Offset label below the body's disc.
    const pxRadius = o.center ? 0 : (o.radius() / dist) * (h / 2) / Math.tan((camera.fov * Math.PI) / 360);
    // Moon label goes above its disc so it never collides with Earth's.
    const above = id === 'moon';
    const yy = above ? y - Math.min(pxRadius, h) - 30 : y + Math.min(pxRadius, h) + 8;
    el.style.transform = `translate(${x}px, ${yy}px) translateX(-50%)`;
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.playing) state.simMs += dt * state.speed * 1000;
  if (system) {
    system.update(state.simMs, state.mode, clock.elapsedTime, camera);
    rig.update(dt);
    updateLabels();
    uiTimer += dt;
    if (uiTimer > 0.25) {
      uiTimer = 0;
      const d = new Date(state.simMs);
      $('#clock-date').textContent = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      $('#clock-time').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      if (document.activeElement !== dateInput) dateInput.value = d.toISOString().slice(0, 16);
      panel.refresh();
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
buildObjectList();
buildLabels();
setTimeout(() => {
  system = createSolarSystem(scene);
  system.update(state.simMs, state.mode, 0, camera);
  controls.target.set(0, 0, 0);
  $('#intro-status').textContent = 'Ready';
  const start = $('#start-btn');
  start.disabled = false;
  start.focus();
  start.onclick = () => {
    $('#intro').classList.add('hidden');
    document.body.classList.add('started');
    overview(2.4);
  };
}, 50);
requestAnimationFrame(frame);
