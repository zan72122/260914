import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { World } from './world.js';
import { createGirl, updateGirl, setCostume, addCandy, girlWorldPoint, COSTUMES } from './girl.js';
import { FollowCamera } from './camera.js';
import { Chain } from './chain.js';
import { Fireflies, Leaves, CandyDrops, Sparkles, Bats, Fireworks } from './particles.js';
import * as A from './audio.js';
import { setSeed, getSeed, randInt } from './rng.js';

const QS = new URLSearchParams(location.search);

/**
 * The testability layer (window.__game, ?scenario=, ?seed=, ?debug=) only
 * exists in a development or test build. `__TESTABLE__` is replaced at build
 * time by vite.config.js: `npm run build` produces false, `npm run build:test`
 * and `npm run dev` produce true.
 */
const TESTABLE = __TESTABLE__;
const DEBUG = TESTABLE && QS.has('debug');
// Optional time multiplier, used by the automated walkthrough so a full
// five-house run fits in a test budget on a software rasteriser.
const TIME_SCALE = TESTABLE
  ? Math.max(0.25, Math.min(4, parseFloat(QS.get('speed')) || 1))
  : 1;

// ------------------------------------------------------------------- icons
/**
 * Draws the jack-o'-lantern used for every icon on a 2D canvas of side `size`.
 * Shared by the home-screen icon so nothing has to be fetched: the favicon in
 * index.html is the same face as an inline SVG.
 */
function drawPumpkinIcon(g, size) {
  const u = size / 192;
  g.fillStyle = '#0b1030';
  g.fillRect(0, 0, size, size);

  // stalk
  g.fillStyle = '#4c6b2e';
  g.beginPath();
  g.roundRect ? g.roundRect(86 * u, 62 * u, 12 * u, 22 * u, 5 * u)
              : g.rect(86 * u, 62 * u, 12 * u, 22 * u);
  g.fill();

  // body: three overlapping lobes so it reads as a pumpkin, not a circle
  g.fillStyle = '#d8641c';
  for (const [cx, rx] of [[70, 34], [122, 34], [96, 54]]) {
    g.beginPath();
    g.ellipse(cx * u, 122 * u, rx * u, 46 * u, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,170,80,0.28)';
  g.beginPath();
  g.ellipse(80 * u, 108 * u, 18 * u, 26 * u, -0.3, 0, Math.PI * 2);
  g.fill();

  // face
  g.fillStyle = '#2a1200';
  const tri = (pts) => {
    g.beginPath();
    g.moveTo(pts[0] * u, pts[1] * u);
    g.lineTo(pts[2] * u, pts[3] * u);
    g.lineTo(pts[4] * u, pts[5] * u);
    g.closePath();
    g.fill();
  };
  tri([64, 112, 88, 124, 64, 132]);   // left eye
  tri([128, 112, 104, 124, 128, 132]); // right eye
  g.beginPath();                       // grin
  g.moveTo(62 * u, 142 * u);
  g.quadraticCurveTo(96 * u, 176 * u, 130 * u, 142 * u);
  g.quadraticCurveTo(114 * u, 154 * u, 106 * u, 146 * u);
  g.quadraticCurveTo(96 * u, 156 * u, 86 * u, 146 * u);
  g.quadraticCurveTo(78 * u, 154 * u, 62 * u, 142 * u);
  g.fill();
}

/**
 * Add-to-Home-Screen wants a raster icon, and this build ships no files, so
 * the 180x180 apple-touch-icon is painted once at startup and handed over as a
 * PNG data URL. index.html carries the SVG `rel="icon"` for the tab.
 */
(function appleTouchIcon() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    if (!g) return;
    drawPumpkinIcon(g, 180);
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.setAttribute('sizes', '180x180');
    link.href = c.toDataURL('image/png');
    document.head.appendChild(link);
  } catch (e) { /* an icon is never worth breaking startup over */ }
})();

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

// The whole world is generated from this seed, so a fixed seed means a fixed
// street, decoration layout and particle motion.
setSeed(TESTABLE ? (parseInt(QS.get('seed'), 10) || 1) : 1);

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
const sparkles = new Sparkles(scene, 640);
const candy = new CandyDrops(scene, 60);
const bats = new Bats(scene, 28);
const fireworks = new Fireworks(scene, sparkles);
candy.onLand = () => { addCandy(girl, 1); A.sfxCandy(randInt(5)); };

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
  m.userData = Object.assign({ pick: tag, isProxy: true }, extra || {});
  parent.add(m);
  return m;
}
for (const h of world.houses) {
  h.bellProxy = addProxy(h.doorbell, h.doorbell.userData.hitRadius, 'doorbell', { house: h.index });
  if (h.resident) addProxy(h.resident, 0.9, 'resident', { house: h.index }).position.y = 0.9;
}
girl.bucket.userData.hitRadius = 1.05;
const bucketProxy = addProxy(girl.bucket, girl.bucket.userData.hitRadius, 'bucket');
const girlProxy = addProxy(girl.rig, 0.95, 'girl');
girlProxy.position.y = 1.1;
girl.root.userData.pick = 'girl';
girl.bucket.userData.pick = 'bucket';
// the chain swells whichever of these is currently the invited target
ctx.proxies = { bucket: bucketProxy, girl: girlProxy };
chain.sizeProxies(chain.state);

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

/** true when the hit sits under something that is currently hidden */
function hiddenAncestor(obj) {
  let o = obj;
  while (o) {
    if (o.visible === false && !(o.userData && o.userData.isProxy)) return true;
    o = o.parent;
  }
  return false;
}

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

/** one ring-buffer entry per tap - never per frame */
function logTap(before, nx, ny, own) {
  chain.note('input', {
    hit: own.type,
    house: own.house,
    toy: own.toy ? own.toy.kind : undefined,
    ndc: [Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000],
    from: before
  });
}

function handleTap(nx, ny) {
  A.unlock();
  chain.noteInput();
  const before = chain.state;
  ndc.set(nx, ny);
  raycaster.setFromCamera(ndc, camera);

  const targets = [girl.root, ...world.pickables];
  const hits = raycaster.intersectObjects(targets, true);

  // collect owners front-to-back, then let whatever the world is currently
  // inviting win the tie: small fingers should not be punished for being close
  const owners = [];
  for (const hit of hits) {
    if (hit.object === world.sky) continue;
    if (hiddenAncestor(hit.object)) continue;
    const o = ownerOf(hit.object);
    if (o) owners.push(o);
  }
  const want = chain.expected();
  if (want) {
    const i = owners.findIndex(o => o.type === want.type &&
      (want.house === undefined || o.house === want.house));
    if (i > 0) { const [w] = owners.splice(i, 1); owners.unshift(w); }
  }

  for (const own of owners) {
    if (own.type === 'toy') { logTap(before, nx, ny, own); own.toy.tap(ctx); return own; }
    if (own.type === 'bucket') { logTap(before, nx, ny, own); chain.tapBucket(); return own; }
    if (own.type === 'girl') { logTap(before, nx, ny, own); chain.tapGirl(); return own; }
    if (own.type === 'doorbell') { logTap(before, nx, ny, own); chain.tapDoorbell(own.house); return own; }
    if (own.type === 'resident') {
      logTap(before, nx, ny, own);
      const h = world.houses[own.house];
      if (h.resident) { h.resident.userData.hop = 1; h.resident.userData.waving = 1.2; }
      A.sfxHum(230);
      sparkles.burst(h.doorWorld.clone().add(new THREE.Vector3(0, 1.2, 0)), 12, 0xffd8a0, 0.7);
      return own;
    }
    if (own.type === 'house') { logTap(before, nx, ny, own); chain.tapHouse(own.house); return own; }
  }

  // ground
  const p = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(groundPlane, p);
  if (ok && raycaster.ray.direction.y < -0.02) {
    logTap(before, nx, ny, { type: 'ground' });
    chain.tapGround(p);
    return { type: 'ground', point: p };
  }
  // sky
  const sky = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 26);
  logTap(before, nx, ny, { type: 'sky' });
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
  A.resumeIfSuspended();
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
// iOS pinch-zoom / double-tap-zoom suppression
for (const g of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(g, e => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// Every pointer down, not just the first: iOS leaves the context suspended
// after a lock screen or an app switch, and only a gesture reliably revives it.
window.addEventListener('pointerdown', () => { A.unlock(); A.resumeIfSuspended(); }, { passive: true });

// ------------------------------------------------------------------- loop
let last = performance.now(), elapsed = 0;
let frames = 0, fpsT = 0, fps = 60, lastCalls = 0, lastTris = 0;
let paused = false;
let rafId = 0;
let running = false;       // is the rAF loop scheduled at all
let hidden = false;        // page is in the background / screen locked
let contextLost = false;   // the WebGL context went away

/**
 * One simulation + render step. `step(dt, n)` below drives exactly this, so a
 * stepped run goes through the same code as a real frame - nothing is skipped.
 */
function frame(dt, render = true) {
  elapsed += dt;
  const t = elapsed;
  chain.frame++;

  chain.update(dt);
  updateGirl(girl, dt, t);
  world.update(dt, camera);
  fireflies.update(dt, t);
  leaves.update(dt, t);
  sparkles.update(dt);
  candy.retarget(girlWorldPoint(girl, 'bucket'));
  candy.update(dt);
  bats.update(dt, t);
  fireworks.update(dt);
  cam.update(dt, girl);
  A.tick(dt);

  // keep the shadow frustum around the girl
  moonLight.position.copy(girl.pos).addScaledVector(lightDir, 55);
  moonTarget.position.copy(girl.pos);

  camera.updateMatrixWorld(true);
  if (render) {
    renderer.info.reset();
    composer.render();
    lastCalls = renderer.info.render.calls;
    lastTris = renderer.info.render.triangles;
  }

  frames++; fpsT += dt;
  if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
}

function animate() {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000) * TIME_SCALE;
  last = now;
  if (!paused) frame(dt);
  rafId = requestAnimationFrame(animate);
}

/**
 * The rAF loop is stopped outright - not just paused - while the page is
 * hidden or the WebGL context is gone. `paused` stays what the test API set it
 * to; these two are a separate concern.
 */
function startLoop() {
  if (running || hidden || contextLost) return;
  running = true;
  last = performance.now();          // no giant dt for the first frame back
  rafId = requestAnimationFrame(animate);
}
function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}
startLoop();

// ------------------------------------------------- visibility (iOS / lock)
function onPageVisible() {
  hidden = false;
  A.resumeIfSuspended();
  A.setMuted(false);                 // fade back in, so the return is not a burst
  startLoop();
}
function onPageHidden() {
  hidden = true;
  A.setMuted(true);
  stopLoop();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onPageVisible(); else onPageHidden();
});
window.addEventListener('pageshow', onPageVisible);
window.addEventListener('pagehide', onPageHidden);

// ------------------------------------------- WebGL context loss (iOS OOM)
// Safari drops the context under memory pressure. Preventing the default makes
// the loss recoverable; if the restore never arrives we reload, which is silent
// and text-free either way.
let restoreTimer = 0;
el.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  stopLoop();
  A.setMuted(true);
  if (!restoreTimer) {
    restoreTimer = setTimeout(() => {
      restoreTimer = 0;
      if (contextLost) location.reload();
    }, 3000);
  }
}, false);
el.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = 0; }
  // three.js has re-initialised the GL state by now; the composer still holds
  // render targets from the dead context, so size them again to rebuild them.
  resize();
  A.resumeIfSuspended();
  A.setMuted(false);
  startLoop();
}, false);

// --------------------------------------------------------------- test hook
function simplify(r) {
  if (!r) return null;
  return { type: r.type, house: r.house, toy: r.toy ? r.toy.kind : undefined };
}

const _right = new THREE.Vector3();

/**
 * Screen position of a world point, plus - when the caller passes the object's
 * world-space hit radius - how big that target actually is in pixels. That is
 * the number that says whether a four-year-old can hit it.
 */
function projectPoint(p, hitRadius = 0) {
  camera.updateMatrixWorld(true);
  const v = p.clone().project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  const px = (v.x * 0.5 + 0.5) * r.width;
  const py = (-v.y * 0.5 + 0.5) * r.height;
  const out = {
    x: Math.round((r.left + px) * 10) / 10,
    y: Math.round((r.top + py) * 10) / 10,
    onScreen: v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 && v.z < 1
  };
  if (hitRadius > 0) {
    _right.setFromMatrixColumn(camera.matrixWorld, 0).setLength(hitRadius);
    const e = p.clone().add(_right).project(camera);
    const ex = (e.x * 0.5 + 0.5) * r.width;
    const ey = (-e.y * 0.5 + 0.5) * r.height;
    out.radius = Math.round(Math.hypot(ex - px, ey - py) * 10) / 10;
  }
  return out;
}

const r2 = (n) => Math.round(n * 100) / 100;

const api = {
  THREE,
  // ---- plain state -------------------------------------------------------
  get state() { return chain.state; },
  get houseIndex() { return chain.houseIndex; },
  get houses() { return world.houses; },
  get toys() { return world.toys; },
  girl, world, chain, camera, renderer, scene, cam,
  get costume() { return girl.costume; },
  setCostume: (c) => setCostume(girl, c),
  costumes: COSTUMES,
  get ready() { return chain.ready; },
  get busy() { return chain.busy; },
  get restartReady() { return chain.restartReady; },
  get candyCount() { return girl.candyCount; },
  get idle() { return chain.idle; },
  get fps() { return fps; },
  get seed() { return getSeed(); },
  get frame() { return chain.frame; },
  debug: DEBUG,

  // ---- observation -------------------------------------------------------
  /** small, side-effect free picture of what is going on right now */
  snapshot() {
    const invited = chain.invitedPoint();
    const h = world.houses[chain.houseIndex];
    const waiting = chain.waitReason();
    return {
      ready: chain.ready,
      stage: chain.state,
      houseIndex: chain.houseIndex,
      seed: getSeed(),
      frame: chain.frame,
      time: r2(elapsed),
      target: invited ? {
        kind: (chain.expected() || {}).type || null,
        world: { x: r2(invited.x), y: r2(invited.y), z: r2(invited.z) },
        hitRadius: r2(chain.invitedHitRadius()),
        screen: projectPoint(invited, chain.invitedHitRadius())
      } : null,
      girl: {
        x: r2(girl.pos.x), z: r2(girl.pos.z),
        heading: r2(girl.heading),
        anim: girl.anim,
        walking: !!girl.path,
        speed: r2(girl.speed),
        costume: girl.costume
      },
      bucket: { fill: girl.candyCount, capacity: girl.candySlots.length },
      house: h ? {
        lit: r2(h.lit), litTarget: h.litTarget,
        doorOpen: r2(h.doorOpen), doorTarget: h.doorTarget,
        bellGlow: r2(h.bellGlow), bellTarget: h.bellTarget,
        residentOut: r2(h.residentOut)
      } : null,
      litHouses: world.houses.map((x, i) => (x.litTarget > 0.5 ? i : -1)).filter(i => i >= 0),
      input: {
        accepted: !chain.busy && chain.ready,
        lastRejection: chain.lastRejection
      },
      wait: waiting,
      attractor: { active: chain.attractor.active, level: r2(chain.attractor.level) },
      endingPhase: chain.endingPhase,
      restartReady: chain.restartReady,
      paused,
      render: { calls: lastCalls, triangles: lastTris }
    };
  },

  /** ordered ring buffer of inputs, transitions and rejections */
  log(n) {
    const e = chain.events;
    return n ? e.slice(Math.max(0, e.length - n)) : e.slice();
  },
  clearLog() { chain.events.length = 0; },

  // ---- scenarios ---------------------------------------------------------
  /** loadScenario('bell:2') or loadScenario('bell', 2) */
  loadScenario(name, index) {
    let stage = name, i = index;
    if (typeof name === 'string' && name.includes(':')) {
      const parts = name.split(':');
      stage = parts[0];
      i = parseInt(parts[1], 10);
    }
    const out = chain.loadScenario(stage, i || 1);
    cam.snapNext = true;
    frame(1 / 60);              // settle the camera and one round of updates
    return out;
  },
  scenarios: ['find', 'walk', 'bell', 'open', 'reveal', 'bucket', 'candy', 'next', 'ending'],

  // ---- deterministic time -----------------------------------------------
  pause() { paused = true; },
  resume() { paused = false; last = performance.now(); startLoop(); },
  /** advance the real update loop n times by exactly dt seconds each */
  step(dt = 1 / 60, n = 1) {
    paused = true;
    const d = Math.max(0.0001, Math.min(0.1, dt));
    // every step runs the full simulation; only the last one is drawn, since
    // drawing feeds nothing back into game state
    for (let k = 0; k < n; k++) frame(d, k === n - 1);
    return chain.state;
  },
  /** step until `pred(snapshot)` is true or the budget runs out */
  stepUntil(predSrc, maxSteps = 900, dt = 1 / 60) {
    const pred = typeof predSrc === 'function' ? predSrc : new Function('s', 'return (' + predSrc + ')(s);');
    paused = true;
    for (let k = 0; k < maxSteps; k++) {
      if (pred(api.snapshot())) { frame(0.0001); return { ok: true, steps: k }; }
      frame(Math.min(0.1, dt), false);
    }
    const ok = pred(api.snapshot());
    frame(0.0001);
    return { ok, steps: maxSteps };
  },

  // ---- input (the real path) --------------------------------------------
  /** world coordinates -> screen pixels */
  project(x, y, z) { return projectPoint(new THREE.Vector3(x, y, z)); },
  /** the screen position of whatever the world is inviting right now */
  targetScreen() {
    const p = chain.invitedPoint();
    return p ? projectPoint(p, chain.invitedHitRadius()) : null;
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

  // ---- shortcuts ---------------------------------------------------------
  advance: () => chain.advance(),
  restart: () => chain.restart(),
  setIdle: (sec) => { chain.idle = sec; },
  get info() {
    return {
      calls: lastCalls,
      triangles: lastTris,
      programs: renderer.info.programs ? renderer.info.programs.length : 0,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    };
  }
};

if (TESTABLE) {
  window.__game = api;
  const sc = QS.get('scenario');
  if (sc) {
    // a scenario starts paused so the very first observation is reproducible
    paused = true;
    try { api.loadScenario(sc); } catch (e) { console.error('[scenario]', e.message); }
  }
  if (DEBUG) console.log('[state] ready', chain.state, 'seed', getSeed());
}
