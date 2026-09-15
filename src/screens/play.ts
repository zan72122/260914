import * as THREE from 'three';
import { findTile, tileAt } from '../core/board';
import { solve } from '../core/solve';
import { applyTool } from '../core/tools';
import { markCleared } from '../core/progress';
import type { GameState, Vec2 } from '../core/types';
import { buildBoard, buildTools, PALETTES, type Level } from '../levels/schema';
import { attachTouchInput } from '../input/touch';
import { resumeAudio } from '../audio/context';
import { createStage, type Stage } from '../render/scene';
import {
  createTileMesh,
  createBlockProp,
  rubbleColor,
  setTileLift,
  topYOf,
  updateTileMesh,
  STEP_HEIGHT,
  TILE_THICKNESS,
} from '../render/tileMesh';
import { createToolOverlay, pressOverlay, pulseOverlay, type ToolOverlay } from '../render/overlay';
import { createPathLine } from '../render/pathLine';
import { createVehicle } from '../render/vehicle';
import { createConfetti, createDebris, createDust } from '../render/fx';
import { createGoalFlag, createSurroundings } from '../render/props';

/** 経路が繋がってから発車するまでの溜め(4.4) */
const LAUNCH_DELAY = 0.5;
/** 無操作でヒント演出に入るまで(3.4) */
const HINT_IDLE = 6;
/** タイルの上下アニメ(7.4: 0.30s ease-in-out + 着地時に微バウンス) */
const LIFT_DURATION = 0.3;

/** ease-in-out + 着地の微バウンス */
function liftEase(p: number): number {
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  if (p <= 0.7) return e;
  // 行き過ぎてから戻る小さな跳ね返り
  return e + Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.07;
}

/** デバッグ用に露出する読み取り口(E2E のタップ位置計算に使う) */
export interface PlayDebug {
  tools(): { index: number; used: boolean; x: number; y: number; z: number }[];
  /** ワールド座標 → キャンバス上の CSS ピクセル座標 */
  project(x: number, y: number, z: number): { x: number; y: number };
  connected(): boolean;
  cleared(): boolean;
}

export interface PlayScreen {
  readonly debug: PlayDebug;
  dispose(): void;
}

export function createPlayScreen(container: HTMLElement, level: Level): PlayScreen {
  const palette = PALETTES[level.theme];
  const stage: Stage = createStage(container);
  stage.setPalette(palette);

  let state: GameState = { board: buildBoard(level), tools: buildTools(level) };
  const { w, h } = level.size;
  const idx = (x: number, y: number): number => y * w + x;

  stage.root.add(createSurroundings(w, h, palette));

  // --- タイル ---
  const tileMeshes: THREE.Mesh[] = [];
  const blockProps: (THREE.Group | undefined)[] = [];
  /** 回転アニメの目標角 */
  const targetRotY: number[] = [];
  /** 上下アニメ。lift は 0..1 の連続値(0 = 低い、1 = 1 段高い) */
  const lift: number[] = [];
  const liftFrom: number[] = [];
  const liftTo: number[] = [];
  /** 経過時間。負なら停止中 */
  const liftT: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const tile = state.board.tiles[i]!;
      const mesh = createTileMesh(tile, palette);
      updateTileMesh(mesh, tile, palette, x, y);
      setTileLift(mesh, tile.height);
      stage.root.add(mesh);
      tileMeshes.push(mesh);
      targetRotY.push(mesh.rotation.y);
      lift.push(tile.height);
      liftFrom.push(tile.height);
      liftTo.push(tile.height);
      liftT.push(-1);

      if (tile.kind === 'block') {
        const prop = createBlockProp(palette, x, y);
        prop.position.set(x, topYOf(tile.height), y);
        stage.root.add(prop);
        blockProps.push(prop);
      } else {
        blockProps.push(undefined);
      }
    }
  }

  /** セルの現在の(アニメ中の)高さ */
  const liftAt = (c: Vec2): number => {
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) return 0;
    return lift[idx(c.x, c.y)] ?? 0;
  };

  // --- ゴールの旗 ---
  const goalPos = findTile(state.board, 'goal');
  const flag = createGoalFlag();
  if (goalPos) {
    flag.position.set(goalPos.x, topYOf(liftAt(goalPos)), goalPos.y);
    stage.root.add(flag);
  } else {
    flag.visible = false;
  }

  // --- 経路プレビュー線・乗り物・エフェクト ---
  const pathLine = createPathLine();
  stage.root.add(pathLine.group);

  const vehicle = createVehicle(level.vehicle);
  stage.root.add(vehicle.group);
  // 乗り物はタイルの上に乗っているので、上下アニメに追従させる(4.2 T2)
  vehicle.setLiftOffset((cx, cy) => {
    const c = { x: cx, y: cy };
    const t = tileAt(state.board, c);
    if (!t) return 0;
    return (liftAt(c) - t.height) * STEP_HEIGHT;
  });

  const confetti = createConfetti();
  stage.root.add(confetti.group);
  const dust = createDust();
  stage.root.add(dust.group);
  const debris = createDebris();
  stage.root.add(debris.group);

  // --- ツールのオーバーレイ ---
  const overlays: ToolOverlay[] = [];
  const hitObjects: THREE.Object3D[] = [];
  state.tools.forEach((tool, i) => {
    const ov = createToolOverlay(tool, i, liftAt);
    overlays.push(ov);
    hitObjects.push(...ov.hitPlanes);
    stage.root.add(ov.group);
  });

  // --- カメラのフィット ---
  const box = new THREE.Box3(
    new THREE.Vector3(-0.5, 0, -0.5),
    new THREE.Vector3(w - 0.5, STEP_HEIGHT + TILE_THICKNESS + 0.6, h - 0.5),
  );
  stage.fit(box);

  // --- ゲーム進行の状態 ---
  let connected = false;
  let launchTimer = -1;
  let idleTimer = 0;
  let hintCount = 0;
  let cleared = false;
  let hintActive = false;
  let hintReturnTimer = -1;
  const pressAmount: number[] = state.tools.map(() => 0);
  const pressTarget: number[] = state.tools.map(() => 0);

  function startLift(i: number, to: number): void {
    liftFrom[i] = lift[i] ?? 0;
    liftTo[i] = to;
    liftT[i] = 0;
  }

  function refreshVisuals(): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        const tile = state.board.tiles[i]!;
        const mesh = tileMeshes[i]!;
        const prevRot = mesh.rotation.y;
        updateTileMesh(mesh, tile, palette, x, y);
        targetRotY[i] = mesh.rotation.y;
        // アニメーションで追いつかせるため、いったん元の角度に戻す
        mesh.rotation.y = prevRot;
        if (liftTo[i] !== tile.height) startLift(i, tile.height);
      }
    }
  }

  function updatePath(previouslyConnected: boolean): void {
    const result = solve(state.board);
    connected = result.connected;
    pathLine.update(state.board, result.path);
    vehicle.place(state.board, result.path);
    vehicle.setPuzzled(false);
    if (connected && !previouslyConnected) {
      pathLine.startSweep(); // 繋がった瞬間、端から端へ光が流れる(3.3-(6))
      launchTimer = LAUNCH_DELAY;
    } else {
      launchTimer = -1;
    }
  }

  function onArrive(): void {
    if (!connected || cleared) return;
    cleared = true;
    const gp = goalPos ?? { x: 0, y: 0 };
    confetti.burst(new THREE.Vector3(gp.x, topYOf(liftAt(gp)), gp.y));
    markCleared(level.id);
  }

  /** 破壊の演出(4.2 T3): 破片が飛び、土煙が上がり、跡は空地になる */
  function playDestroy(cells: readonly Vec2[], before: GameState): void {
    for (const c of cells) {
      const was = tileAt(before.board, c);
      const now = tileAt(state.board, c);
      if (!was || !now || was.kind !== 'block' || now.kind === 'block') continue;
      const at = new THREE.Vector3(c.x, topYOf(liftAt(c)), c.y);
      debris.burst(at, rubbleColor(palette));
      dust.burst(at);
      const prop = blockProps[idx(c.x, c.y)];
      if (prop) {
        prop.visible = false;
        blockProps[idx(c.x, c.y)] = undefined;
        stage.root.remove(prop);
      }
    }
  }

  function tap(toolIndex: number): void {
    resumeAudio();
    idleTimer = 0;
    hintActive = false;
    hintReturnTimer = -1;

    const before = connected;
    const beforeState = state;
    const result = applyTool(state, toolIndex);
    state = result.state;
    pressTarget[toolIndex] = 0;

    if (!result.changed) return; // 「ぷにっと沈んで戻る」だけ(4.2 T3)

    const tool = state.tools[toolIndex];
    cleared = false;
    refreshVisuals();
    updatePath(before);

    if (tool?.kind === 'destroy') playDestroy(tool.cells, beforeState);
    if (tool?.kind === 'raise') {
      // 持ち上げ時の土煙(4.2 T2)
      for (const c of tool.cells) dust.burst(new THREE.Vector3(c.x, topYOf(liftAt(c)), c.y));
    }

    if (tool?.used) {
      // 使い切りのツールはオーバーレイ・点線枠・アイコンごと消える(4.2 T3)
      const ov = overlays[toolIndex];
      if (ov) ov.group.visible = false;
    }
  }

  const input = attachTouchInput(stage.renderer.domElement, stage.camera, { objects: hitObjects }, {
    onPressStart(i) {
      pressTarget[i] = 1;
      idleTimer = 0;
    },
    onPressEnd(i) {
      pressTarget[i] = 0;
    },
    onTap: tap,
    onFirstInput: resumeAudio,
  });

  updatePath(false);

  stage.onFrame((dt, t) => {
    // タイルのアニメーション(7.4)
    for (let i = 0; i < tileMeshes.length; i++) {
      const mesh = tileMeshes[i]!;
      const tr = targetRotY[i]!;
      // 0.25s ease-out 相当の指数的な追従
      const k = 1 - Math.pow(0.001, dt / 0.25);
      let diff = tr - mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      mesh.rotation.y += diff * k;

      // 上下: 0.30s の ease-in-out + 着地の微バウンス
      const et = liftT[i]!;
      if (et >= 0) {
        const nt = et + dt;
        const p = Math.min(1, nt / LIFT_DURATION);
        const from = liftFrom[i]!;
        const to = liftTo[i]!;
        lift[i] = from + (to - from) * liftEase(p);
        liftT[i] = p >= 1 ? -1 : nt;
        if (p >= 1) lift[i] = to;
      }
      setTileLift(mesh, lift[i]!);

      const prop = blockProps[i];
      if (prop) prop.position.y = topYOf(lift[i]!);
    }

    // ツールのオーバーレイをタイルの高さに追従させる
    for (const ov of overlays) ov.syncHeights(liftAt);

    // ゴールマーカーの上下(7.4: 2.0 秒周期、振幅 0.1)
    if (goalPos) {
      flag.position.y = topYOf(liftAt(goalPos)) + Math.sin((t / 2) * Math.PI * 2) * 0.1;
    }

    // ツールの明滅と押し込み
    overlays.forEach((ov, i) => {
      const tool = state.tools[i];
      if (!tool || tool.used) return;
      pulseOverlay(ov, t, !tool.touched);
      const a = pressAmount[i] ?? 0;
      const target = pressTarget[i] ?? 0;
      const next = a + (target - a) * Math.min(1, dt * 18);
      pressAmount[i] = next;
      pressOverlay(ov, next);
    });

    pathLine.tick(dt);
    vehicle.tick(dt, t);
    confetti.tick(dt);
    dust.tick(dt);
    debris.tick(dt);

    // 溜めてから発車(4.4)
    if (launchTimer > 0) {
      launchTimer -= dt;
      if (launchTimer <= 0) {
        launchTimer = -1;
        vehicle.drive(onArrive);
      }
    }

    // 無操作ヒント(3.4)
    if (!connected && !hintActive) {
      idleTimer += dt;
      if (idleTimer >= HINT_IDLE) {
        idleTimer = 0;
        hintCount++;
        hintActive = true;
        vehicle.drive(() => {
          vehicle.setPuzzled(true);
          hintReturnTimer = 1.2;
        });
      }
    }
    if (hintReturnTimer > 0) {
      hintReturnTimer -= dt;
      if (hintReturnTimer <= 0) {
        hintReturnTimer = -1;
        vehicle.setPuzzled(false);
        vehicle.returnToStart();
        hintActive = false;
      }
    }

    // ヒントを 2 回出しても解けていなければ、足りないタイルがそっと光る(R7)
    if (hintCount >= 2 && !connected) {
      const glow = 0.5 + 0.5 * Math.sin(t * 3);
      overlays.forEach((ov, i) => {
        const tool = state.tools[i];
        if (!tool || tool.used) return;
        for (const m of ov.overlayMats) m.opacity = 0.12 + glow * 0.25;
      });
    }
  });

  stage.start();

  const debug: PlayDebug = {
    tools() {
      return overlays.map((ov, i) => ({
        index: i,
        used: state.tools[i]?.used ?? false,
        x: ov.center.x,
        y: topYOf(liftAt({ x: Math.round(ov.center.x), y: Math.round(ov.center.z) })) + 0.05,
        z: ov.center.z,
      }));
    },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(stage.camera);
      const dom = stage.renderer.domElement;
      const rect = dom.getBoundingClientRect();
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
      };
    },
    connected: () => connected,
    cleared: () => cleared,
  };

  return {
    debug,
    dispose() {
      input.dispose();
      stage.dispose();
    },
  };
}
