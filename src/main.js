import * as THREE from 'three';
import { createRenderer, createScene, createCamera, fitCamera, PALETTE } from './scene.js';
import {
  H,
  PLATFORM_CELLS,
  START,
  GOAL,
  DOOR_DIR,
  INITIAL_ROT,
  TOWER_CENTER,
  walkableCells,
  logicalToGrid,
  gridToLogical,
  key,
  rotateRel,
} from './level.js';
import { findPath } from './pathfinding.js';
import { createTower, setTowerIndex, beginTowerDrag, dragTower, releaseTower, updateTower } from './tower.js';
import { createCharacter, placeCharacter, faceToward, updateCharacter } from './character.js';
import { createDoor, updateDoor, createConfetti, burstConfetti, updateConfetti } from './effects.js';
import * as sfx from './audio.js';

// ---------- 基本セットアップ ----------
const canvas = document.getElementById('c');
const fadeEl = document.getElementById('fade');
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = createCamera(new THREE.Vector3(TOWER_CENTER.x - 1, H / 2 + 0.5, 0));

// ---------- 固定の足場 ----------
const tapTargets = []; // タップ判定用のメッシュ
const platformMeshes = new Map(); // key -> { top, block }
{
  const sideMat = new THREE.MeshLambertMaterial({ color: PALETTE.platformSide });
  const topMat = new THREE.MeshLambertMaterial({ color: PALETTE.platformTop });
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  for (const c of PLATFORM_CELLS) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1, H, 1), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    block.position.set(c.x, H / 2, c.z);
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.cell = { tower: false, x: c.x, z: c.z };
    scene.add(block);
    tapTargets.push(block);

    // 道(帯)。隣のセルへ向かって伸び、切れ目で終わる。
    const road = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.62), roadMat);
    road.position.set(c.x, H + 0.02, c.z);
    road.receiveShadow = true;
    scene.add(road);
    tapTargets.push(road);
    road.userData.cell = block.userData.cell;

    for (const d of [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ]) {
      const nx = c.x + d.x;
      const nz = c.z + d.z;
      const neighborIsPlatform = PLATFORM_CELLS.some((p) => p.x === nx && p.z === nz);
      const neighborIsTowerArea = Math.abs(nx - TOWER_CENTER.x) <= 1 && Math.abs(nz - TOWER_CENTER.z) <= 1;
      if (neighborIsPlatform || neighborIsTowerArea) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(d.x ? 0.5 : 0.62, 0.04, d.z ? 0.5 : 0.62), roadMat);
        seg.position.set(c.x + d.x * 0.44, H + 0.02, c.z + d.z * 0.44);
        seg.userData.cell = block.userData.cell;
        scene.add(seg);
        tapTargets.push(seg);
      }
    }
    platformMeshes.set(key(c.x, c.z), { block, road, baseY: H / 2 });
  }
}

// ---------- 塔・扉・キャラ・演出 ----------
const tower = createTower(scene);
for (const t of tower.tiles) tapTargets.push(t);
const door = createDoor(scene);
const girl = createCharacter(scene);
const confetti = createConfetti(scene);

// 地面の影受け(薄い床)
{
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.12 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- ゲーム状態 ----------
const state = {
  cells: null, // 現在の歩けるセル
  girlPos: null, // 論理位置
  path: [], // 残りの経路(セル配列)
  moveFrom: null, // Vector3
  moveTo: null,
  moveT: 0,
  stepCount: 0,
  solved: false,
  goalPhase: null, // null | 'enter' | 'done'
  goalTimer: 0,
  dragging: false,
  dragStartX: 0,
  dragMoved: false,
  lastTickAngle: 0,
  pendingTap: null,
  frozen: false,
};

function worldOfGrid(x, z) {
  return new THREE.Vector3(x, H, z);
}

// 論理位置から現在の世界座標(回転中は連続角度を使う)
function worldOfLogical(pos) {
  if (pos.tower) {
    const v = new THREE.Vector3(pos.rel.x, H, pos.rel.z);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), tower.angle);
    v.x += TOWER_CENTER.x;
    v.z += TOWER_CENTER.z;
    return v;
  }
  return worldOfGrid(pos.x, pos.z);
}

function isSolved(k) {
  const cells = walkableCells(k);
  return findPath(cells, START, GOAL) !== null;
}

function refreshCells() {
  state.cells = walkableCells(tower.snapIndex);
  const nowSolved = findPath(state.cells, logicalToGrid(state.girlPos, tower.snapIndex), GOAL) !== null;
  const goalConnected = isSolved(tower.snapIndex);
  if (nowSolved && !state.solved) {
    // 道がつながった
    sfx.sfxConnect();
    door.excite = 1;
    tower.pulse = false;
    const g = logicalToGrid(state.girlPos, tower.snapIndex);
    faceToward(girl, GOAL.x - g.x, GOAL.z - g.z);
  }
  state.solved = nowSolved;
  tower.pulse = !goalConnected;
}

function resetLevel() {
  setTowerIndex(tower, INITIAL_ROT);
  state.girlPos = { tower: false, x: START.x, z: START.z };
  state.path = [];
  state.moveFrom = null;
  state.moveTo = null;
  state.solved = false;
  state.goalPhase = null;
  state.goalTimer = 0;
  state.dragging = false;
  state.frozen = false;
  girl.walking = false;
  girl.hidden = false;
  girl.group.visible = true;
  girl.group.scale.setScalar(1);
  girl.facing = Math.atan2(1, 0);
  girl.targetFacing = girl.facing;
  door.targetOpen = 0;
  door.open = 0;
  door.excite = 0;
  placeCharacter(girl, worldOfLogical(state.girlPos));
  refreshCells();
}

tower.onSnap = (k, changed) => {
  sfx.sfxClick();
  refreshCells();
  // 塔の上にいれば位置はそのまま(相対座標)。世界座標だけ更新される。
};

// ---------- 入力 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}

function hitTower(e) {
  setPointer(e);
  return raycaster.intersectObjects(tower.dragTargets, false).length > 0;
}

function hitCell(e) {
  setPointer(e);
  const hits = raycaster.intersectObjects(tapTargets, false);
  if (!hits.length) return null;
  return hits[0].object.userData.cell || null;
}

let activePointer = null;

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlockAudio();
  if (state.frozen || activePointer !== null) return;
  activePointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.dragMoved = false;
  state.downOnTower = hitTower(e);
  state.dragging = false;
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer || state.frozen) return;
  const dx = e.clientX - state.dragStartX;
  const dy = e.clientY - state.dragStartY;
  if (!state.dragging) {
    if (state.downOnTower && Math.hypot(dx, dy) > 6 && !girl.walking) {
      state.dragging = true;
      beginTowerDrag(tower);
      state.lastTickAngle = tower.angle;
    } else if (Math.hypot(dx, dy) > 12) {
      state.dragMoved = true;
    }
  }
  if (state.dragging) {
    // 画面上の水平移動に比例して回転(右ドラッグで手前が右へ動く)
    const rect = canvas.getBoundingClientRect();
    const scale = (Math.PI * 1.15) / Math.min(rect.width, rect.height);
    dragTower(tower, dx * scale);
    if (Math.abs(tower.angle - state.lastTickAngle) > Math.PI / 16) {
      state.lastTickAngle = tower.angle;
      sfx.sfxTick();
    }
    placeCharacter(girl, worldOfLogical(state.girlPos));
  }
});

function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (state.frozen) return;
  if (state.dragging) {
    state.dragging = false;
    releaseTower(tower);
    return;
  }
  if (state.dragMoved) return;
  // タップ
  const cell = hitCell(e);
  if (cell) onTapCell(cell);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ---------- タップ処理 ----------
const flashes = []; // { mesh, t }

function flashCell(cell, ok) {
  let mesh;
  if (cell.tower) {
    mesh = tower.tiles.find((t) => t.userData.cell.rel.x === cell.rel.x && t.userData.cell.rel.z === cell.rel.z);
  } else {
    mesh = platformMeshes.get(key(cell.x, cell.z))?.block;
  }
  if (!mesh) return;
  flashes.push({ mesh, t: 0, ok, baseY: mesh.position.y });
}

function onTapCell(cell) {
  if (tower.snapping) return;
  const k = tower.snapIndex;
  const target = cell.tower
    ? (() => {
        const r = rotateRel(cell.rel, k);
        return { x: TOWER_CENTER.x + r.x, z: TOWER_CENTER.z + r.z };
      })()
    : { x: cell.x, z: cell.z };
  const from = state.moveTo ? state.moveToGrid : logicalToGrid(state.girlPos, k);
  const path = findPath(state.cells, from, target);
  if (path === null) {
    sfx.sfxNope();
    flashCell(cell, false);
    // 行けない方向を見て、ちょっと首をかしげる
    const g = logicalToGrid(state.girlPos, k);
    faceToward(girl, target.x - g.x, target.z - g.z);
    girl.body.rotation.z = 0.25;
    return;
  }
  sfx.sfxTap();
  flashCell(cell, true);
  state.path = path;
  if (!state.moveTo) startNextStep();
}

function startNextStep() {
  const k = tower.snapIndex;
  if (!state.path.length) {
    state.moveTo = null;
    girl.walking = false;
    checkGoal();
    return;
  }
  const next = state.path.shift();
  state.moveFrom = worldOfLogical(state.girlPos);
  state.moveToLogical = gridToLogical(next);
  state.moveToGrid = { x: next.x, z: next.z };
  state.moveTo = worldOfGrid(next.x, next.z);
  state.moveT = 0;
  girl.walking = true;
  faceToward(girl, state.moveTo.x - state.moveFrom.x, state.moveTo.z - state.moveFrom.z);
  sfx.sfxStep(state.stepCount++);
}

function checkGoal() {
  const g = logicalToGrid(state.girlPos, tower.snapIndex);
  if (g.x === GOAL.x && g.z === GOAL.z) {
    // 扉が開き、中へ入る
    state.frozen = true;
    state.goalPhase = 'enter';
    state.goalTimer = 0;
    door.targetOpen = 1;
    door.excite = 1;
    faceToward(girl, DOOR_DIR.x, DOOR_DIR.z);
  }
}

// ---------- リサイズ ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const box = new THREE.Box3(new THREE.Vector3(-0.7, -0.2, -3.2), new THREE.Vector3(5.7, H + 2.6, 3.6));
  fitCamera(camera, box, w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- メインループ ----------
resetLevel();
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;

  updateTower(tower, dt, time);

  // 歩行
  if (state.moveTo) {
    state.moveT += dt / 0.32;
    if (state.moveT >= 1) {
      state.girlPos = state.moveToLogical;
      placeCharacter(girl, worldOfLogical(state.girlPos));
      startNextStep();
    } else {
      const p = new THREE.Vector3().lerpVectors(state.moveFrom, state.moveTo, state.moveT);
      placeCharacter(girl, p);
    }
  } else if (!state.dragging && !state.frozen) {
    placeCharacter(girl, worldOfLogical(state.girlPos));
  }

  // ゴール演出
  if (state.goalPhase === 'enter') {
    state.goalTimer += dt;
    if (state.goalTimer > 0.6) {
      const t = Math.min(1, (state.goalTimer - 0.6) / 0.9);
      const p = worldOfGrid(GOAL.x, GOAL.z).addScaledVector(new THREE.Vector3(DOOR_DIR.x, 0, DOOR_DIR.z), t * 0.75);
      placeCharacter(girl, p);
      girl.walking = t < 1;
      girl.group.scale.setScalar(1 - t * 0.55);
      if (t >= 1 && !girl.hidden) {
        girl.hidden = true;
        girl.group.visible = false;
        sfx.sfxGoal();
        burstConfetti(confetti, door.group.position.clone().add(new THREE.Vector3(0, 1.2, 0.4)));
        state.goalPhase = 'done';
        state.goalTimer = 0;
      }
    }
  } else if (state.goalPhase === 'done') {
    state.goalTimer += dt;
    if (state.goalTimer > 3.0 && !state.fading) {
      state.fading = true;
      fadeEl.style.opacity = '1';
      setTimeout(() => {
        resetLevel();
        fadeEl.style.opacity = '0';
        state.fading = false;
      }, 950);
    }
  }

  // タップの光/沈み
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const m = f.mesh;
    const mat = Array.isArray(m.material) ? m.material[2] : m.material;
    if (f.t === dt && !f._mat) {
      f._mat = mat.clone();
      if (Array.isArray(m.material)) {
        m.material = m.material.slice();
        m.material[2] = f._mat;
      } else {
        m.material = f._mat;
      }
      f._orig = mat;
    }
    const k = f.t / 0.45;
    if (k >= 1) {
      if (Array.isArray(m.material)) m.material[2] = f._orig;
      else m.material = f._orig;
      m.position.y = f.baseY;
      flashes.splice(i, 1);
      continue;
    }
    const a = Math.sin(k * Math.PI);
    if (f.ok) {
      f._mat.emissive.setHex(0xfff2c0);
      f._mat.emissiveIntensity = a * 0.6;
    } else {
      f._mat.color.setHex(0xbdb3b0);
      f._mat.emissiveIntensity = 0;
      if (!f.mesh.userData.cell.tower) m.position.y = f.baseY - a * 0.12;
    }
  }

  door.excite += (0 - door.excite) * Math.min(1, dt * (state.goalPhase ? 0.2 : 0.8));
  updateDoor(door, dt, time);
  updateCharacter(girl, dt, time);
  updateConfetti(confetti, dt);
  renderer.render(scene, camera);
}
animate();
