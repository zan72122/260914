import * as THREE from 'three';
import { createMonster } from './world/monster.js';
import { createGarden } from './world/garden.js';
import { createSky } from './world/sky.js';
import { createTree } from './world/tree.js';
import { createParticles } from './world/particles.js';
import { createInput } from './interact/input.js';
import { createHint } from './interact/hint.js';
import { updateTweens, tween } from './tween.js';
import { easeInOut, easeOutElastic, C } from './world/materials.js';
import { state, on, count, setComplete } from './state.js';
import { ensureAudio, sfx } from './audio/synth.js';
import { music } from './audio/music.js';

// ---------- レンダラ / シーン ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb8d8a0, 1.1);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(2, 4, 3);
scene.add(dir);
const fill = new THREE.DirectionalLight(0xffe8d0, 0.5);
fill.position.set(-3, 1, -2);
scene.add(fill);

// ---------- 世界 ----------
const particles = createParticles(scene);
const monster = createMonster();
scene.add(monster.group);
const box = monster.group;

const garden = createGarden(particles);
garden.group.rotation.y = 0; // 後ろの壁(A)
box.add(garden.group);

const sky = createSky(particles, onDaytimeChange);
sky.group.rotation.y = Math.PI / 2; // 左の壁(B)
box.add(sky.group);

const tree = createTree(particles, box);
tree.group.rotation.y = -Math.PI / 2; // 右の壁(C)
box.add(tree.group);
tree.setFlowerGetter((i) => garden.flowerLocal(i));
garden.onFlowerTap((i) => tree.gatherTo(i));

// 足元の柔らかい影(地面の丸)
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -1.25;
scene.add(shadow);

// ---------- カメラ ----------
const FACE_YAW = { A: 0, B: -Math.PI / 2, C: Math.PI / 2 };
let yaw = 0, yawVel = 0, snapping = false;
let camElev = 0.22, camDist = 6, camTargetY = 0;
const camState = { elev: 0.2, targetY: 0.05, radius: 1.5 };
const isLandscape = () => camera.aspect > 1;

function fitDistance(radius) {
  const vf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const hf = vf * camera.aspect;
  return radius / Math.min(vf, hf) * 1.05;
}
function placeCamera() {
  // 横画面では倒れた前面や開いたふたも含めて見えるよう、少し引く
  camDist = fitDistance(camState.radius * (isLandscape() ? 1.45 : 1));
  const e = camState.elev;
  camera.position.set(0, Math.sin(e) * camDist + camState.targetY, Math.cos(e) * camDist);
  camera.lookAt(0, camState.targetY, 0);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

function currentFace() {
  const y = yaw;
  if (y < -Math.PI / 4) return 'B';
  if (y > Math.PI / 4) return 'C';
  return 'A';
}
function snapYaw() {
  const targets = [FACE_YAW.B, FACE_YAW.A, FACE_YAW.C];
  let best = targets[0];
  for (const t of targets) if (Math.abs(t - yaw) < Math.abs(best - yaw)) best = t;
  const from = yaw;
  snapping = true;
  tween({ duration: 0.5, ease: easeInOut, onUpdate: (e) => { yaw = from + (best - from) * e; }, onComplete: () => { snapping = false; sfx.tap(); } });
}
function rotateTo(face, dur = 0.5) {
  const from = yaw, to = FACE_YAW[face];
  snapping = true;
  tween({ duration: dur, ease: easeInOut, onUpdate: (e) => { yaw = from + (to - from) * e; }, onComplete: () => { snapping = false; } });
}
function nudgeTo(face) {
  const dirn = Math.sign(FACE_YAW[face] - yaw) || 1;
  const from = yaw;
  tween({ duration: 1.0, onUpdate: (e) => { yaw = from + dirn * Math.sin(e * Math.PI) * 0.22; } });
  sfx.boop();
}

// ---------- 入力 ----------
const input = createInput({
  canvas: renderer.domElement,
  camera,
  scene,
  onRotate: (dx) => { if (!snapping) { yaw += (dx / window.innerWidth) * Math.PI * 1.15; yaw = THREE.MathUtils.clamp(yaw, FACE_YAW.B - 0.35, FACE_YAW.C + 0.35); } },
  onRotateEnd: () => snapYaw(),
  onTapNothing: (p) => { particles.puff(p, 'spark', 5, 0.5); sfx.tap(); },
  onActivity: () => { hint.activity(); firstTouch(); },
});

let audioStarted = false;
function firstTouch() {
  if (audioStarted) return;
  audioStarted = true;
  ensureAudio();
  music.start();
  music.enable('pad', true, 3);
}
// iOS: 最初のタッチで AudioContext を有効化
for (const ev of ['touchstart', 'pointerdown', 'mousedown']) window.addEventListener(ev, firstTouch, { passive: true });

const hint = createHint({ scene, particles, monster, camera, nudgeTo, currentFace });

// ---------- 進行に応じた世界の変化 ----------
function moveCamera(to, dur = 1.2) {
  const from = { ...camState };
  tween({ duration: dur, ease: easeInOut, onUpdate: (e) => { camState.elev = from.elev + (to.elev - from.elev) * e; camState.targetY = from.targetY + (to.targetY - from.targetY) * e; camState.radius = from.radius + (to.radius - from.radius) * e; placeCamera(); } });
}

on('opened', () => {
  moveCamera({ elev: 0.9, targetY: -0.45, radius: 1.45 }, 1.4);
  music.enable('arp', true, 3);
});
on('sprout', () => {});
on('sproutedAll', () => {
  music.enable('bass', true, 3);
  // 光の粒が空(B)の方向へ流れて誘う
  streamMotes(garden.group, 'B');
});
on('sunny', () => {
  garden.budAll();
  music.enable('bells', true, 4);
  tween({ duration: 1.5, delay: 1.2, onComplete: () => streamMotes(sky.group, 'A') });
});
on('bloomedAll', () => {
  music.enable('trill', true, 3);
  streamMotes(garden.group, 'C');
  monster.setHappy(0.6, 1);
});
on('butterfly', () => {
  if (count(state.butterflies) === 3) tween({ duration: 4.5, onComplete: setComplete });
});
on('complete', () => {
  sfx.fanfare();
  monster.celebrate();
  petalRain(6);
  // 花壇の面へゆっくり戻り、蝶と花と喜ぶ顔を見せる
  tween({ duration: 3, onComplete: () => rotateTo('A', 1.6) });
});

function faceAnchor(face) {
  const a = { A: [0, 0.3, -0.7], B: [-0.7, 0.3, 0], C: [0.7, 0.3, 0] }[face];
  return box.localToWorld(new THREE.Vector3(...a));
}
function streamMotes(fromGroup, toFace) {
  const from = fromGroup.localToWorld(new THREE.Vector3(0, -0.3, -0.4));
  const to = faceAnchor(toFace);
  for (let i = 0; i < 26; i++) {
    tween({ duration: 0.001, delay: i * 0.12, onComplete: () => {
      const target = faceAnchor(toFace); // 箱が回っていても追従
      const p = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4));
      particles.spawn({ kind: 'mote', pos: p, vel: new THREE.Vector3(0, 1.4, 0), life: 2.6, size: 0.1, target, seek: 3.5, drag: 1.2 });
    } });
  }
  void to;
}
function petalRain(seconds) {
  const n = Math.floor(seconds / 0.06);
  for (let i = 0; i < n; i++) {
    tween({ duration: 0.001, delay: i * 0.06, onComplete: () => {
      const p = new THREE.Vector3((Math.random() - 0.5) * 3.5, 2.2 + Math.random(), (Math.random() - 0.5) * 3);
      particles.spawn({ kind: `petal${i % 3}`, pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3, 0), life: 4, size: 0.12, gravity: 0.35, drag: 0.6, spin: (Math.random() - 0.5) * 6, fade: true });
    } });
  }
}

// 昼夜の色
const palettes = {
  day: { bg: 0xbfe3ff, hemiSky: 0xffffff, hemiGround: 0xb8d8a0, dirI: 1.6, hemiI: 1.1 },
  sunset: { bg: 0xffc7a0, hemiSky: 0xffd9b0, hemiGround: 0xc09a80, dirI: 1.2, hemiI: 1.0 },
  night: { bg: 0x2a3560, hemiSky: 0x8fa3d9, hemiGround: 0x3a4468, dirI: 0.45, hemiI: 0.7 },
};
const cur = { bg: new THREE.Color(0xbfe3ff), hemiSky: new THREE.Color(0xffffff), hemiGround: new THREE.Color(0xb8d8a0), dirI: 1.6, hemiI: 1.1 };
function onDaytimeChange(name) {
  const to = palettes[name];
  const from = { bg: cur.bg.clone(), hemiSky: cur.hemiSky.clone(), hemiGround: cur.hemiGround.clone(), dirI: cur.dirI, hemiI: cur.hemiI };
  const toC = { bg: new THREE.Color(to.bg), hemiSky: new THREE.Color(to.hemiSky), hemiGround: new THREE.Color(to.hemiGround) };
  tween({ duration: 2, ease: easeInOut, onUpdate: (e) => {
    cur.bg.copy(from.bg).lerp(toC.bg, e);
    cur.hemiSky.copy(from.hemiSky).lerp(toC.hemiSky, e);
    cur.hemiGround.copy(from.hemiGround).lerp(toC.hemiGround, e);
    cur.dirI = from.dirI + (to.dirI - from.dirI) * e;
    cur.hemiI = from.hemiI + (to.hemiI - from.hemiI) * e;
    scene.background.copy(cur.bg);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiI;
    dir.intensity = cur.dirI;
  } });
  music.setMood(name);
  if (name === 'night') tree.butterflies.forEach((b) => (b.excite = 0));
}
// 太陽が出る前は少し薄暗い
scene.background.set(0xa9cde8);
hemi.intensity = 0.85;
dir.intensity = 1.1;
cur.bg.set(0xa9cde8); cur.hemiI = 0.85; cur.dirI = 1.1;

// ---------- ループ ----------
const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;
  updateTweens(dt);
  box.rotation.y = yaw;
  const pointerLook = input.pointer.active && performance.now() - input.pointer.lastMove < 2500 ? input.pointer.ndc : null;
  monster.update(dt, t, pointerLook);
  garden.update(dt, t);
  sky.update(dt, t);
  tree.update(dt, t);
  particles.update(dt);
  hint.update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// 開発時のみ: 動作確認用にオブジェクトを公開
if (import.meta.env.DEV) {
  window.__hana = { scene, camera, monster, garden, sky, tree, box, state, getYaw: () => yaw };
}
