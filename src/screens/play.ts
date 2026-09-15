import * as THREE from 'three';
import { findTile, tileAt } from '../core/board';
import { solve } from '../core/solve';
import { applyTool } from '../core/tools';
import { markCleared } from '../core/progress';
import type { GameState, Tile, Vec2 } from '../core/types';
import { buildBoard, buildTools, PALETTES, type Level } from '../levels/schema';
import { attachTouchInput } from '../input/touch';
import { resumeAudio } from '../audio/context';
import { createStage, type Stage } from '../render/scene';
import { createTileMesh, createBlockProp, updateTileMesh, STEP_HEIGHT, TILE_THICKNESS } from '../render/tileMesh';
import { createToolOverlay, pressOverlay, pulseOverlay, type ToolOverlay } from '../render/overlay';
import { createPathLine } from '../render/pathLine';
import { createVehicle } from '../render/vehicle';
import { createConfetti } from '../render/fx';
import { createGoalFlag, createSurroundings } from '../render/props';

/** 経路が繋がってから発車するまでの溜め(4.4) */
const LAUNCH_DELAY = 0.5;
/** 無操作でヒント演出に入るまで(3.4) */
const HINT_IDLE = 6;

export interface PlayScreen {
  dispose(): void;
}

export function createPlayScreen(container: HTMLElement, level: Level): PlayScreen {
  const palette = PALETTES[level.theme];
  const stage: Stage = createStage(container);
  stage.setPalette(palette);

  let state: GameState = { board: buildBoard(level), tools: buildTools(level) };
  const { w, h } = level.size;

  stage.root.add(createSurroundings(w, h, palette));

  // --- タイル ---
  const tileMeshes: THREE.Mesh[] = [];
  const blockProps: (THREE.Mesh | undefined)[] = [];
  /** 回転・上下のアニメーション目標 */
  const targetRotY: number[] = [];
  const targetY: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tile = state.board.tiles[i]!;
      const mesh = createTileMesh(tile, palette);
      updateTileMesh(mesh, tile, palette, x, y);
      stage.root.add(mesh);
      tileMeshes.push(mesh);
      targetRotY.push(mesh.rotation.y);
      targetY.push(mesh.position.y);

      if (tile.kind === 'block') {
        const prop = createBlockProp(palette);
        prop.position.set(x, tile.height * STEP_HEIGHT + TILE_THICKNESS + 0.2, y);
        stage.root.add(prop);
        blockProps.push(prop);
      } else {
        blockProps.push(undefined);
      }
    }
  }

  // --- ゴールの旗 ---
  const goalPos = findTile(state.board, 'goal');
  const flag = createGoalFlag();
  if (goalPos) {
    const gt = tileAt(state.board, goalPos);
    flag.position.set(goalPos.x, (gt?.height ?? 0) * STEP_HEIGHT + TILE_THICKNESS, goalPos.y);
    stage.root.add(flag);
  } else {
    flag.visible = false;
  }
  const flagBaseY = flag.position.y;

  // --- 経路プレビュー線・乗り物・紙吹雪 ---
  const pathLine = createPathLine();
  stage.root.add(pathLine.group);

  const vehicle = createVehicle(level.vehicle);
  stage.root.add(vehicle.group);

  const confetti = createConfetti();
  stage.root.add(confetti.group);

  // --- ツールのオーバーレイ ---
  const overlays: ToolOverlay[] = [];
  const hitObjects: THREE.Object3D[] = [];
  state.tools.forEach((tool, idx) => {
    const ov = createToolOverlay(tool, idx, (p: Vec2) => tileAt(state.board, p));
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

  function refreshVisuals(): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const tile = state.board.tiles[i]!;
        const mesh = tileMeshes[i]!;
        const prevRot = mesh.rotation.y;
        const prevY = mesh.position.y;
        updateTileMesh(mesh, tile, palette, x, y);
        targetRotY[i] = mesh.rotation.y;
        targetY[i] = mesh.position.y;
        // アニメーションで追いつかせるため、いったん元の姿勢に戻す
        mesh.rotation.y = prevRot;
        mesh.position.y = prevY;

        const prop = blockProps[i];
        if (prop) prop.visible = tile.kind === 'block';
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
    const gt: Tile | undefined = tileAt(state.board, gp);
    confetti.burst(new THREE.Vector3(gp.x, (gt?.height ?? 0) * STEP_HEIGHT + TILE_THICKNESS, gp.y));
    markCleared(level.id);
  }

  function tap(toolIndex: number): void {
    resumeAudio();
    idleTimer = 0;
    hintActive = false;
    hintReturnTimer = -1;

    const before = connected;
    const result = applyTool(state, toolIndex);
    state = result.state;
    pressTarget[toolIndex] = 0;

    if (!result.changed) return; // 「ぷにっと沈んで戻る」だけ(4.2 T3)

    cleared = false;
    refreshVisuals();
    updatePath(before);

    const tool = state.tools[toolIndex];
    if (tool?.used) {
      // 使い切りのツールは点線枠ごと消える(4.2 T3)
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
      const ty = targetY[i]!;
      // 0.25s ease-out 相当の指数的な追従
      const k = 1 - Math.pow(0.001, dt / 0.25);
      let diff = tr - mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      mesh.rotation.y += diff * k;
      mesh.position.y += (ty - mesh.position.y) * (1 - Math.pow(0.001, dt / 0.3));
      const prop = blockProps[i];
      if (prop) prop.position.y = mesh.position.y + TILE_THICKNESS / 2 + 0.2;
    }

    // ゴールマーカーの上下(7.4: 2.0 秒周期、振幅 0.1)
    flag.position.y = flagBaseY + Math.sin((t / 2) * Math.PI * 2) * 0.1;

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
        for (const m of ov.overlayMats) m.opacity = 0.2 + glow * 0.3;
      });
    }
  });

  stage.start();

  return {
    dispose() {
      input.dispose();
      stage.dispose();
    },
  };
}
