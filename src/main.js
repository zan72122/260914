import * as THREE from 'three';
import { createScene } from './scene.js';
import { createPhysics } from './physics.js';
import { createBlocks } from './voxel.js';
import { createBalls } from './ball.js';
import { createFx } from './fx.js';
import { buildLevel, LEVELS } from './levels.js';
import { tick as tweenTick, after, clearAll as clearTweens } from './tween.js';
import { unlock as unlockAudio, sfx } from './audio.js';
import { loadLevel, saveLevel } from './storage.js';

const canvas = document.getElementById('c');
const view = createScene(canvas);
const phys = createPhysics();
const fx = createFx(view.scene);
const blocks = createBlocks({ scene: view.scene, phys, fx, onShake: (a) => view.shake(a) });
const balls = createBalls({ scene: view.scene, camera: view.camera, phys, fx, onLaunch, onBallGone: () => {} });

let levelIndex = loadLevel() % LEVELS.length;
let state = 'enter';   // enter | play | clear | rewind
let idle = 0;
let quiet = 0;
let nextInvite = 3;
let demoCount = 0;

// iOS のジェスチャ封じ
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointerdown', () => { unlockAudio(); idle = 0; }, { capture: true });
window.addEventListener('pointermove', () => { idle = 0; });

// 2本指で画面をなでる → 巻き戻し（主導線ではない。尽きれば自動で戻る）
{
  const pts = new Map();
  window.addEventListener('pointerdown', (e) => pts.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 }));
  window.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && p.moved > 140 && state === 'play' && blocks.count() < buildLevel(levelIndex).blocks.length) {
      pts.clear(); balls.setEnabled(false); rewind();
    }
  });
  const clr = (e) => pts.delete(e.pointerId);
  window.addEventListener('pointerup', clr); window.addEventListener('pointercancel', clr);
}

function startLevel(i) {
  levelIndex = i % LEVELS.length;
  saveLevel(levelIndex);
  clearTweens(); // 進行中の演出・遅延処理を全て破棄
  state = 'enter';
  balls.setEnabled(false);
  const lv = buildLevel(levelIndex);
  const box = blocks.load(lv);
  view.setFitBox(box);
  balls.setAimBox(box);
  balls.layout();
  balls.setRack(lv.balls);
  let pending = 2;
  const ready = () => { if (--pending === 0) { state = 'play'; balls.setEnabled(true); idle = 0; nextInvite = 3; } };
  blocks.enterAnim(ready);
  after(0.5, () => balls.enterAnim(ready));
}

function onLaunch() { idle = 0; quiet = 0; nextInvite = 4; }

function handleContacts(list) {
  for (const [a, b] of list) {
    const ua = a.userData, ub = b.userData;
    if (!ua || !ub) continue;
    // ボール × ブロック
    let ball = null, blk = null, other = null;
    if (ua.kind === 'ball' && ub.kind === 'block') { ball = ua.ref; blk = ub.ref; }
    else if (ub.kind === 'ball' && ua.kind === 'block') { ball = ub.ref; blk = ua.ref; }
    if (ball && blk) {
      if (blk.state === 'gone') continue;
      if (blk.state === 'falling') { // 落下中ブロックにも当たれば砕ける（気持ちよさ優先）
        if (ball.type === 'B') { blocks.hitByBall(blk, ball); balls.removeBall(ball, false); }
        else if (blk.t !== 'I' || ball.type === 'I') blocks.hitByBall(blk, ball);
        continue;
      }
      const r = blocks.hitByBall(blk, ball, ball.body.position);
      ball.hits++;
      if (r === 'consumed') balls.removeBall(ball, false);
      else if (r === 'slow') balls.slowBall(ball, 0.55);
      continue;
    }
    // 落下物 × 凍ったブロック
    if (ua.kind === 'block' && ub.kind === 'block') {
      const A = ua.ref, B = ub.ref;
      if (A.state === 'frozen' && B.state === 'falling') blocks.debrisContact(A, B.body);
      else if (B.state === 'frozen' && A.state === 'falling') blocks.debrisContact(B, A.body);
      continue;
    }
    if (ua.kind === 'shard' && ub.kind === 'block' && ub.ref.state === 'frozen') blocks.debrisContact(ub.ref, a);
    else if (ub.kind === 'shard' && ua.kind === 'block' && ua.ref.state === 'frozen') blocks.debrisContact(ua.ref, b);
  }
}

function levelClear() {
  state = 'clear';
  balls.setEnabled(false);
  sfx.clear();
  const c = blocks.center();
  const box = blocks.bbox();
  fx.celebrate(new THREE.Vector3(c.x, (box.min.y + box.max.y) / 2, c.z), 4);
  after(0.5, () => fx.celebrate(new THREE.Vector3(c.x, box.max.y - 1, c.z), 3));
  after(2.2, () => startLevel(levelIndex + 1));
}

function rewind() {
  state = 'rewind';
  balls.setEnabled(false);
  const lv = buildLevel(levelIndex);
  blocks.rewindAnim(() => {
    balls.setRack(lv.balls);
    balls.enterAnim(() => { state = 'play'; balls.setEnabled(true); idle = 0; nextInvite = 3; });
  });
}

let last = performance.now();
let hidden = false;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });

function frame(now) {
  requestAnimationFrame(frame);
  if (hidden) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  tweenTick(dt);
  const contacts = phys.step(dt);
  handleContacts(contacts);
  blocks.update(dt);
  balls.update(dt);
  fx.update(dt);
  view.update(dt);

  if (state === 'play') {
    if (blocks.count() === 0) levelClear();
    else {
      const moving = blocks.movingCount() + balls.flyingCount();
      quiet = moving === 0 ? quiet + dt : 0;
      if (balls.rackCount() === 0 && balls.flyingCount() === 0 && quiet > 1.2) rewind();
      // 誘い: 触らずにいるとボールがぴょこんと跳ね、さらに待つと指の影が手本を見せる
      if (!balls.isDragging()) {
        idle += dt;
        if (idle > nextInvite) {
          if (!balls.everLaunched() && demoCount < 3 && idle > 6) { balls.demo(); demoCount++; nextInvite = idle + 7; }
          else { balls.hop(); nextInvite = idle + 3.5; }
        }
      }
    }
  }
  view.render();
}

startLevel(levelIndex);
requestAnimationFrame(frame);

// 検証用フック（文字は画面に出さない）
window.__game = { get state() { return state; }, get level() { return levelIndex; }, blocks, balls, startLevel, phys, debug: () => ({ idle, nextInvite, demoCount, demoActive: balls.isDemo() }) };
