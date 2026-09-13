import * as THREE from 'three';
import { createRenderer, createScene, createCamera, fitCamera } from './scene.js';
import { LEVELS } from './levels/index.js';
import { buildLevel } from './build.js';
import { key, buildGraph, findPath, worldOfCell } from './engine/graph.js';
import { createCharacter, placeCharacter, faceToward, updateCharacter } from './character.js';
import { updateDoor, createConfetti, burstConfetti, updateConfetti } from './effects.js';
import { createSky } from './sky.js';
import { loadStage, saveStage } from './progress.js';
import * as sfx from './audio.js';

// ---------- 基本セットアップ ----------
const canvas = document.getElementById('c');
const renderer = createRenderer(canvas);
const { scene, hemi, sun } = createScene();
const camera = createCamera(new THREE.Vector3(3, 2, 0));
const sky = createSky(scene, hemi, sun);
const girl = createCharacter(scene);
const confetti = createConfetti(scene);

{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

const SINK_Y = -16;
const HINT_DELAY = 8;

// ---------- ゲーム状態 ----------
const state = {
  stage: loadStage(LEVELS.length),
  built: null,
  cells: null,
  graph: null,
  girlRef: null, // { x, z } または { gadget, rel }
  path: [],
  move: null, // { from: Vector3, to: Vector3, toCell, t }
  stepCount: 0,
  phase: 'intro', // intro | play | goal | transition
  timer: 0,
  fading: false,
  drag: null, // { gadget, x0, y0, moved }
  pointerId: null,
  tapStart: null,
  idle: 0,
  hintOn: false,
  levelY: 0,
  levelAnim: null, // { from, to, t, dur, ease, done }
};

function girlCell() {
  if (!state.girlRef) return null;
  const g = state.built.resolveRef(state.girlRef);
  return state.cells.get(key(g.x, g.z)) ?? null;
}

function girlWorld() {
  const c = girlCell();
  return c ? worldOfCell(c, state.built.gadgets) : girl.group.position.clone();
}

function refToCell(cell) {
  if (cell.gadget && cell.rel) return { gadget: cell.gadget, rel: { ...cell.rel } };
  return { x: cell.x, z: cell.z };
}

function goalKey() {
  return key(state.built.level.goal.x, state.built.level.goal.z);
}

function refreshGraph(announce = true) {
  const b = state.built;
  state.cells = b.cellsNow();
  state.graph = buildGraph(state.cells, { illusion: !!b.level.illusion });
  const gc = girlCell();
  const canReach = gc ? findPath(state.graph, key(gc.x, gc.z), goalKey()) !== null : false;
  if (canReach && !state.solved && announce) {
    sfx.sfxConnect();
    b.door.excite = 1;
    faceToward(girl, b.goalCell.x - gc.x, b.goalCell.z - gc.z);
  }
  state.solved = canReach;
}

// ---------- 面の読み込み ----------
function loadLevel(index, { rise }) {
  if (state.built) state.built.dispose();
  const level = LEVELS[index];
  const built = buildLevel(level, scene);
  state.built = built;
  state.stage = index;
  saveStage(index);
  state.girlRef = { x: level.start.x, z: level.start.z };
  state.path = [];
  state.move = null;
  state.solved = false;
  state.hintOn = false;
  state.idle = 0;
  girl.walking = false;
  girl.group.visible = true;
  girl.group.scale.setScalar(1);
  girl.facing = Math.atan2(-level.entryDir.x, -level.entryDir.z);
  girl.targetFacing = girl.facing;

  for (const g of built.gadgets.values()) {
    if (g.type === 'rotator' || g.type === 'slider') {
      g.onSnap = (gg, changed) => {
        sfx.sfxClick();
        refreshGraph();
        // 引き出しは戻すこともできるので、戻したら再びヒントの対象になる
      };
    } else if (g.type === 'stairs') {
      g.onStep = () => sfx.sfxThud();
      g.onRisen = () => refreshGraph();
    }
  }
  refreshGraph(false);
  resize();

  state.levelY = rise ? SINK_Y : 0;
  built.root.position.y = state.levelY;
  if (rise) {
    state.levelAnim = { from: SINK_Y, to: 0, t: 0, dur: 1.4, ease: 'out', done: () => startIntro() };
  } else {
    startIntro();
  }
}

// 女の子が入口の扉から出てくる
function startIntro() {
  const b = state.built;
  state.phase = 'intro';
  state.timer = 0;
  b.entry.open = 1;
  b.entry.targetOpen = 1;
  girl.group.visible = true;
  const start = girlWorld();
  const d = b.level.entryDir;
  girl.group.position.copy(start).add(new THREE.Vector3(d.x * 0.75, 0, d.z * 0.75));
  girl.group.scale.setScalar(0.45);
  girl.walking = true;
}

// ---------- 入力 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}

function hitGadget(e) {
  setPointer(e);
  const targets = state.built.dragTargets();
  const hits = raycaster.intersectObjects(
    targets.map((t) => t.mesh),
    false
  );
  if (!hits.length) return null;
  const mesh = hits[0].object;
  return targets.find((t) => t.mesh === mesh)?.gadget ?? null;
}

function hitCellRef(e) {
  setPointer(e);
  const hits = raycaster.intersectObjects(state.built.tapMeshes, false);
  for (const h of hits) {
    if (h.object.userData.cellRef) return h.object.userData.cellRef;
  }
  return null;
}

// 世界の 1 単位ベクトルが画面上で何ピクセルになるか
function axisPx(axis) {
  const rect = canvas.getBoundingClientRect();
  const a = new THREE.Vector3(0, 0, 0).project(camera);
  const b = new THREE.Vector3(axis.x, 0, axis.z).project(camera);
  return { x: ((b.x - a.x) / 2) * rect.width, y: (-(b.y - a.y) / 2) * rect.height };
}

function girlOnGadget(g) {
  const c = girlCell();
  return c && c.gadget === g.id;
}

function touch() {
  state.idle = 0;
  if (state.hintOn) {
    state.hintOn = false;
    for (const g of state.built.gadgets.values()) g.hint = 0;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlockAudio();
  if (state.phase !== 'play' || state.pointerId !== null) return;
  state.pointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  touch();
  const g = hitGadget(e);
  const canDrag = g && g.beginDrag && !g.busy() && !girl.walking && !(g.type === 'slider' && girlOnGadget(g));
  state.tapStart = { x: e.clientX, y: e.clientY, moved: false, gadget: canDrag ? g : null };
  state.drag = null;
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== state.pointerId || !state.tapStart) return;
  const dx = e.clientX - state.tapStart.x;
  const dy = e.clientY - state.tapStart.y;
  if (!state.drag) {
    if (state.tapStart.gadget && Math.hypot(dx, dy) > 6) {
      state.drag = { gadget: state.tapStart.gadget };
      state.drag.gadget.beginDrag();
    } else if (Math.hypot(dx, dy) > 12) {
      state.tapStart.moved = true;
    }
  }
  if (state.drag) {
    const rect = canvas.getBoundingClientRect();
    const r = state.drag.gadget.drag(dx, dy, { minSide: Math.min(rect.width, rect.height), axisPx });
    if (r === 'tick') sfx.sfxTick();
    placeCharacter(girl, girlWorld());
  }
});

function endPointer(e) {
  if (e.pointerId !== state.pointerId) return;
  state.pointerId = null;
  const ts = state.tapStart;
  state.tapStart = null;
  if (state.drag) {
    state.drag.gadget.release();
    state.drag = null;
    return;
  }
  if (!ts || ts.moved || state.phase !== 'play') return;
  const ref = hitCellRef(e);
  if (ref) onTapCell(ref);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ---------- タップ処理 ----------
const flashes = [];

function findMeshForRef(ref) {
  return state.built.tapMeshes.find((m) => {
    const r = m.userData.cellRef;
    if (!r || m.geometry.type !== 'BoxGeometry' || m.geometry.parameters.height < 0.2) return false;
    if (ref.gadget) return r.gadget === ref.gadget && r.rel && r.rel.x === ref.rel.x && r.rel.z === ref.rel.z;
    return !r.gadget && r.x === ref.x && r.z === ref.z;
  });
}

function flashCell(ref, ok) {
  const mesh = findMeshForRef(ref);
  if (!mesh) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const idx = Array.isArray(mesh.material) ? 2 : 0;
  const orig = mats[idx];
  const mat = orig.clone();
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.slice();
    mesh.material[2] = mat;
  } else mesh.material = mat;
  flashes.push({ mesh, mat, orig, ok, t: 0, baseY: mesh.position.y, arr: Array.isArray(mesh.material) });
}

function onTapCell(ref) {
  for (const g of state.built.gadgets.values()) if (g.busy()) return;
  const target = state.built.resolveRef(ref);
  const targetKey = key(target.x, target.z);
  const fromCell = state.move ? state.move.toCell : girlCell();
  if (!fromCell) return;
  const path = state.cells.has(targetKey) ? findPath(state.graph, key(fromCell.x, fromCell.z), targetKey) : null;
  if (path === null) {
    sfx.sfxNope();
    flashCell(ref, false);
    const g = girlWorld();
    faceToward(girl, target.x - g.x, target.z - g.z);
    girl.body.rotation.z = 0.25;
    return;
  }
  sfx.sfxTap();
  flashCell(ref, true);
  state.path = path;
  if (!state.move) startNextStep();
}

function startNextStep() {
  if (!state.path.length) {
    state.move = null;
    girl.walking = false;
    onArrive();
    return;
  }
  const next = state.path.shift();
  const from = girlWorld();
  const to = worldOfCell(next, state.built.gadgets);
  state.move = { from, to, toCell: next, t: 0 };
  girl.walking = true;
  faceToward(girl, to.x - from.x, to.z - from.z);
  sfx.sfxStep(state.stepCount++);
}

function onArrive() {
  const c = girlCell();
  if (!c) return;
  if (c.switch) {
    const sw = state.built.gadgets.get(c.switch);
    if (sw && !sw.triggered) {
      sfx.sfxPress();
      sw.trigger();
    }
  }
  if (key(c.x, c.z) === goalKey()) {
    const b = state.built;
    state.phase = 'goal';
    state.timer = 0;
    b.door.targetOpen = 1;
    b.door.excite = 1;
    faceToward(girl, b.level.doorDir.x, b.level.doorDir.z);
  }
}

// ---------- ヒント(手が止まったとき) ----------
function showHint() {
  const b = state.built;
  state.hintOn = true;
  let target = null;
  for (const id of b.level.order ?? []) {
    const g = b.gadgets.get(id);
    if (g && !g.isDone()) {
      target = g;
      break;
    }
  }
  let p;
  if (target) {
    target.hint = 1;
    p = target.hintPoint();
  } else {
    b.door.excite = 1;
    p = new THREE.Vector3(b.goalCell.x, b.goalCell.h, b.goalCell.z);
  }
  const g = girlWorld();
  faceToward(girl, p.x - g.x, p.z - g.z);
}

// ---------- リサイズ ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (!state.built) return;
  const box = state.built.bbox.clone();
  box.min.add(new THREE.Vector3(-0.4, -0.2, -0.4));
  box.max.add(new THREE.Vector3(0.4, 0.3, 0.4));
  fitCamera(camera, box, w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- 面の切り替え ----------
function sinkAndNext() {
  state.phase = 'transition';
  const nextIndex = (state.stage + 1) % LEVELS.length;
  sky.set(LEVELS[nextIndex], 2.2);
  state.levelAnim = {
    from: 0,
    to: SINK_Y,
    t: 0,
    dur: 1.3,
    ease: 'in',
    done: () => loadLevel(nextIndex, { rise: true }),
  };
}

// ---------- メインループ ----------
sky.set(LEVELS[state.stage], 0);
resize();
loadLevel(state.stage, { rise: true });
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  const b = state.built;

  // 建物の沈む/せり上がる
  if (state.levelAnim) {
    const a = state.levelAnim;
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = a.ease === 'in' ? a.t * a.t * a.t : 1 - Math.pow(1 - a.t, 3);
    state.levelY = a.from + (a.to - a.from) * e;
    b.root.position.y = state.levelY;
    if (a.t >= 1) {
      state.levelAnim = null;
      a.done();
    }
  }

  b.update(dt, time);

  if (state.phase === 'intro') {
    state.timer += dt;
    const t = Math.min(1, state.timer / 0.9);
    const start = girlWorld();
    const d = b.level.entryDir;
    girl.group.position.copy(start).add(new THREE.Vector3(d.x * 0.75 * (1 - t), 0, d.z * 0.75 * (1 - t)));
    girl.group.scale.setScalar(0.45 + 0.55 * t);
    if (t >= 1) {
      girl.walking = false;
      b.entry.targetOpen = 0;
      state.phase = 'play';
      state.idle = 0;
    }
  } else if (state.phase === 'play') {
    if (state.move) {
      const m = state.move;
      m.t += dt / 0.32;
      if (m.t >= 1) {
        state.girlRef = refToCell(m.toCell);
        placeCharacter(girl, girlWorld());
        startNextStep();
      } else {
        placeCharacter(girl, new THREE.Vector3().lerpVectors(m.from, m.to, m.t));
      }
    } else if (!state.drag) {
      placeCharacter(girl, girlWorld());
    }
    // 手が止まったら世界から誘う
    const busy = state.drag || girl.walking || [...b.gadgets.values()].some((g) => g.busy());
    if (!busy) {
      state.idle += dt;
      if (state.idle > HINT_DELAY && !state.hintOn) showHint();
    }
  } else if (state.phase === 'goal') {
    state.timer += dt;
    if (state.timer > 0.6) {
      const t = Math.min(1, (state.timer - 0.6) / 0.9);
      const d = b.level.doorDir;
      const p = girlWorld().add(new THREE.Vector3(d.x * t * 0.75, 0, d.z * t * 0.75));
      placeCharacter(girl, p);
      girl.walking = t < 1;
      girl.group.scale.setScalar(1 - t * 0.55);
      if (t >= 1 && girl.group.visible) {
        girl.group.visible = false;
        sfx.sfxGoal();
        burstConfetti(confetti, b.door.group.position.clone().add(new THREE.Vector3(0, 1.2, 0.4)));
        state.timer = 100; // 紙吹雪の待ち時間へ
      }
    }
    if (state.timer > 102.2) sinkAndNext();
  } else if (state.phase === 'transition') {
    girl.group.visible = false;
  }

  // タップの光/沈み
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = f.t / 0.45;
    if (k >= 1) {
      if (f.arr) f.mesh.material[2] = f.orig;
      else f.mesh.material = f.orig;
      f.mesh.position.y = f.baseY;
      flashes.splice(i, 1);
      continue;
    }
    const a = Math.sin(k * Math.PI);
    if (f.ok) {
      f.mat.emissive.setHex(0xfff2c0);
      f.mat.emissiveIntensity = a * 0.6;
    } else {
      f.mat.color.setHex(0xbdb3b0);
      if (!f.mesh.userData.cellRef.gadget) f.mesh.position.y = f.baseY - a * 0.12;
    }
  }

  const exciteDecay = state.phase === 'goal' ? 0.2 : state.hintOn && state.solved ? 0.0 : 0.8;
  b.door.excite += (0 - b.door.excite) * Math.min(1, dt * exciteDecay);
  if (state.hintOn && state.solved) b.door.excite = 0.6 + 0.4 * Math.sin(time * 4);
  updateDoor(b.door, dt, time);
  updateDoor(b.entry, dt, time);
  b.entry.open += (b.entry.targetOpen - b.entry.open) * Math.min(1, dt * 3);
  b.entry.panelL.rotation.y = -b.entry.open * 1.9;
  b.entry.panelR.rotation.y = b.entry.open * 1.9;
  sky.update(dt, time);
  updateCharacter(girl, dt, time);
  updateConfetti(confetti, dt);
  renderer.render(scene, camera);
}
animate();

// テスト用フック(自動プレイで画面座標を得る)
window.__mg = {
  state,
  screenOf(v) {
    const rect = canvas.getBoundingClientRect();
    const p = v.clone().project(camera);
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  },
  gadgetScreen(id) {
    const g = state.built.gadgets.get(id);
    const p = g.hintPoint().add(state.built.root.position);
    if (g.type === 'rotator') p.y -= 0.6;
    return this.screenOf(p);
  },
  cellScreen(x, z) {
    const c = state.cells.get(`${x},${z}`);
    if (!c) return null;
    const v = worldOfCell(c, state.built.gadgets).add(state.built.root.position);
    return this.screenOf(v);
  },
  axisPx,
  goto(i) {
    localStorage.setItem('monument-garden.stage', String(i));
    location.reload();
  },
};
