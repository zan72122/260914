import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { World } from './world.js';
import { createGirl, updateGirl, setCostume, addCandy, COSTUMES } from './girl.js';
import { FollowCamera } from './camera.js';
import { Chain } from './chain.js';
import { Fireflies, Leaves, CandyDrops, Sparkles, Bats, Fireworks } from './particles.js';
import * as A from './audio.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------------------------------------------------------------- manifest
(function manifest() {
  const icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
      <rect width="192" height="192" rx="36" fill="#0b1030"/>
      <circle cx="140" cy="52" r="22" fill="#f3ecd4"/>
      <ellipse cx="92" cy="122" rx="52" ry="44" fill="#d8641c"/>
      <path d="M70 112 l20 10 -20 8z M114 112 l-20 10 20 8z" fill="#2a1200"/>
      <path d="M62 140 q30 26 60 0 q-30 12 -60 0z" fill="#2a1200"/>
      <rect x="86" y="70" width="10" height="16" rx="4" fill="#4c6b2e"/>
    </svg>`);
  const m = {
    name: 'Halloween Night', short_name: 'Halloween', start_url: './',
    display: 'standalone', background_color: '#05050f', theme_color: '#0a0a1e',
    orientation: 'any',
    icons: [{ src: icon, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' }]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
  const link = document.createElement('link');
  link.rel = 'manifest'; link.href = url;
  document.head.appendChild(link);
})();

// ---------------------------------------------------------------- renderer
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: 'high-performance', alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1b2647, 0.0115);

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
scene.add(camera);

// ------------------------------------------------------------------ lights
const world = new World(scene);

// The visible moon sits low for drama; the key light comes from higher up so the
// street itself still catches moonlight.
const lightDir = new THREE.Vector3(-0.38, 0.80, -0.46).normalize();
const moonLight = new THREE.DirectionalLight(0xbfd2ff, 2.4);
moonLight.position.copy(lightDir).multiplyScalar(60);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.near = 1;
moonLight.shadow.camera.far = 160;
const SH = 26;
moonLight.shadow.camera.left = -SH;
moonLight.shadow.camera.right = SH;
moonLight.shadow.camera.top = SH;
moonLight.shadow.camera.bottom = -SH;
moonLight.shadow.bias = -0.0012;
moonLight.shadow.normalBias = 0.035;
scene.add(moonLight);
const moonTarget = new THREE.Object3D();
scene.add(moonTarget);
moonLight.target = moonTarget;

scene.add(new THREE.HemisphereLight(0x53709f, 0x1a2030, 0.95));
const fill = new THREE.AmbientLight(0x38467a, 0.6);
scene.add(fill);

// ------------------------------------------------------------------- girl
const girl = createGirl();
scene.add(girl.root);
girl.onFootstep = () => A.sfxFootstep();

// --------------------------------------------------------------- particles
const fireflies = new Fireflies(scene, 120);
const leaves = new Leaves(scene, 170);
const sparkles = new Sparkles(scene, 360);
const candy = new CandyDrops(scene, 60);
const bats = new Bats(scene, 28);
const fireworks = new Fireworks(scene, sparkles);
candy.onLand = () => { addCandy(girl, 1); A.sfxCandy((Math.random() * 5) | 0); };

// ------------------------------------------------------------------ camera
const cam = new FollowCamera(camera);

// -------------------------------------------------------------------- chain
const ctx = { world, girl, cam, fireflies, leaves, sparkles, candy, bats, fireworks, debug: DEBUG };
world.ctx = ctx;
const chain = new Chain(ctx);
chain.start();

// -------------------------------------------------------- pick proxies
function addProxy(parent, radius, tag, extra) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), new THREE.MeshBasicMaterial());
  m.visible = false;
  m.userData = Object.assign({ pick: tag }, extra || {});
  parent.add(m);
  return m;
}
for (const h of world.houses) {
  addProxy(h.doorbell, 0.36, 'doorbell', { house: h.index });
  if (h.resident) addProxy(h.resident, 0.9, 'resident', { house: h.index }).position.y = 0.9;
}
const bucketProxy = addProxy(girl.bucket, 0.4, 'bucket');
const girlProxy = addProxy(girl.rig, 0.62, 'girl');
girlProxy.position.y = 1.1;
girl.root.userData.pick = 'girl';
girl.bucket.userData.pick = 'bucket';

// ------------------------------------------------------------------ compose
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.78, 0.72);
composer.addPass(bloom);

// ------------------------------------------------------------------- resize
function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  bloom.setSize(Math.max(8, Math.floor(w / 2)), Math.max(8, Math.floor(h / 2)));
  camera.aspect = w / h;
  camera.fov = h > w ? 58 : 50;
  camera.updateProjectionMatrix();
  cam.setViewport(w, h);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 220); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// -------------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
raycaster.far = 400;
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function ownerOf(obj) {
  let o = obj;
  while (o) {
    if (o.userData) {
      if (o.userData.toy) return { type: 'toy', toy: o.userData.toy };
      if (o.userData.pick === 'bucket') return { type: 'bucket' };
      if (o.userData.pick === 'girl') return { type: 'girl' };
      if (o.userData.pick === 'doorbell' || o.userData.kind === 'doorbell') return { type: 'doorbell', house: o.userData.house };
      if (o.userData.pick === 'resident' || o.userData.kind === 'resident') return { type: 'resident', house: o.userData.house };
      if (o.userData.kind === 'house') return { type: 'house', house: o.userData.house };
    }
    o = o.parent;
  }
  return null;
}

function handleTap(nx, ny) {
  A.unlock();
  chain.noteInput();
  ndc.set(nx, ny);
  raycaster.setFromCamera(ndc, camera);

  const targets = [girl.root, ...world.pickables];
  const hits = raycaster.intersectObjects(targets, true);
  for (const hit of hits) {
    if (hit.object === world.sky) continue;
    const own = ownerOf(hit.object);
    if (!own) continue;
    if (own.type === 'toy') { own.toy.tap(ctx); return own; }
    if (own.type === 'bucket') { chain.tapBucket(); return own; }
    if (own.type === 'girl') { chain.tapGirl(); return own; }
    if (own.type === 'doorbell') { chain.tapDoorbell(own.house); return own; }
    if (own.type === 'resident') {
      const h = world.houses[own.house];
      if (h.resident) { h.resident.userData.hop = 1; h.resident.userData.waving = 1.2; }
      A.sfxHum(230);
      sparkles.burst(h.doorWorld.clone().add(new THREE.Vector3(0, 1.2, 0)), 12, 0xffd8a0, 0.7);
      return own;
    }
    if (own.type === 'house') { chain.tapHouse(own.house); return own; }
  }

  // ground
  const p = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(groundPlane, p);
  if (ok && raycaster.ray.direction.y < -0.02) {
    chain.tapGround(p);
    return { type: 'ground', point: p };
  }
  // sky
  const sky = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 26);
  chain.tapSky(sky);
  return { type: 'sky', point: sky };
}

function screenToNdc(px, py) {
  const r = renderer.domElement.getBoundingClientRect();
  return [((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1];
}

let pointerDown = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  A.unlock();
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
}, { passive: true });
el.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  const dx = e.clientX - pointerDown.x, dy = e.clientY - pointerDown.y;
  const dt = performance.now() - pointerDown.t;
  pointerDown = null;
  if (dx * dx + dy * dy > 40 * 40 || dt > 1400) return;
  const [nx, ny] = screenToNdc(e.clientX, e.clientY);
  handleTap(nx, ny);
});
el.addEventListener('pointercancel', () => { pointerDown = null; });
el.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
window.addEventListener('pointerdown', () => A.unlock(), { once: true });

// ------------------------------------------------------------------- loop
let last = performance.now(), elapsed = 0;
let frames = 0, fpsT = 0, fps = 60, lastCalls = 0, lastTris = 0;

function animate() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  const t = elapsed;

  chain.update(dt);
  updateGirl(girl, dt, t);
  world.update(dt, camera);
  fireflies.update(dt, t);
  leaves.update(dt, t);
  sparkles.update(dt);
  candy.update(dt);
  bats.update(dt, t);
  fireworks.update(dt);
  cam.update(dt, girl);
  A.tick(dt);

  // keep the shadow frustum around the girl
  moonLight.position.copy(girl.pos).addScaledVector(lightDir, 55);
  moonTarget.position.copy(girl.pos);

  renderer.info.reset();
  composer.render();
  lastCalls = renderer.info.render.calls;
  lastTris = renderer.info.render.triangles;

  frames++; fpsT += dt;
  if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// --------------------------------------------------------------- test hook
const api = {
  THREE,
  get state() { return chain.state; },
  get houseIndex() { return chain.houseIndex; },
  get houses() { return world.houses; },
  get toys() { return world.toys; },
  girl, world, chain, camera, renderer, scene, cam,
  get costume() { return girl.costume; },
  setCostume: (c) => setCostume(girl, c),
  costumes: COSTUMES,
  advance: () => chain.advance(),
  restart: () => chain.restart(),
  setIdle: (sec) => { chain.idle = sec; },
  get idle() { return chain.idle; },
  get busy() { return chain.busy; },
  get restartReady() { return chain.restartReady; },
  get candyCount() { return girl.candyCount; },
  get fps() { return fps; },
  get info() {
    return {
      calls: lastCalls,
      triangles: lastTris,
      programs: renderer.info.programs ? renderer.info.programs.length : 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    };
  },
  /** world coordinates -> screen pixels */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return {
      x: r.left + (v.x * 0.5 + 0.5) * r.width,
      y: r.top + (-v.y * 0.5 + 0.5) * r.height,
      onScreen: v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z < 1
    };
  },
  tapScreen(px, py) {
    const [nx, ny] = screenToNdc(px, py);
    return simplify(handleTap(nx, ny));
  },
  tapAt(x, y, z) {
    const p = api.project(x, y, z);
    return api.tapScreen(p.x, p.y);
  },
  tapNdc(nx, ny) { return simplify(handleTap(nx, ny)); },
  debug: DEBUG
};
function simplify(r) {
  if (!r) return null;
  return { type: r.type, house: r.house, toy: r.toy ? r.toy.kind : undefined };
}
window.__game = api;
if (DEBUG) console.log('[state] ready', chain.state);
