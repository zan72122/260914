import * as THREE from 'three';
import { findTile, tileAt } from '../core/board';
import { solve } from '../core/solve';
import { applyTool } from '../core/tools';
import { markCleared } from '../core/progress';
import type { GameState, Vec2 } from '../core/types';
import { buildBoard, buildTools, PALETTES, type Level } from '../levels/schema';
import { attachTouchInput } from '../input/touch';
import { resumeAudio } from '../audio/context';
import { startBgm } from '../audio/bgm';
import {
  playDestroy,
  playExitIsland,
  playFanfare,
  playHorn,
  playLift,
  playMiss,
  playRotate,
  playSparkle,
  startEngine,
  stopEngine,
} from '../audio/sfx';
import { createStage, CAMERA_SECONDS, type Stage } from '../render/scene';
import { expandFrame, frameFromBox } from '../render/fit';
import {
  createTileMesh,
  createBlockProp,
  rubbleColor,
  setTileLift,
  topYOf,
  updateTileMesh,
  STEP_HEIGHT,
  TILE_THICKNESS,
  SLAB_SIZE,
} from '../render/tileMesh';
import { createToolOverlay, pressOverlay, pulseOverlay, type ToolOverlay } from '../render/overlay';
import { createPathLine } from '../render/pathLine';
import { createVehicle } from '../render/vehicle';
import { createConfetti, createDebris, createDust } from '../render/fx';
import { createBridgeRails, createGoalFlag, createPropField, createSurroundings, planProps } from '../render/props';
import { railTexture } from '../render/textures';

/** 経路が繋がってから発車するまでの溜め(4.4) */
const LAUNCH_DELAY = 0.5;
/** 無操作でヒント演出に入るまで(3.4) */
const HINT_IDLE = 6;
/** タイルの上下アニメ(7.4: 0.30s ease-in-out + 着地時に微バウンス) */
const LIFT_DURATION = 0.3;
/** タイルの回転アニメ(7.4: 0.25s ease-out)。この間は入力を受け付けない(4.2 T1) */
const ROTATE_DURATION = 0.25;
/** クリア後、自動で地図へ戻るまでの猶予(3.4: その間のタップで留まれる) */
const AUTO_EXIT_DELAY = 2;

/** ease-in-out + 着地の微バウンス */
function liftEase(p: number): number {
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  if (p <= 0.7) return e;
  // 行き過ぎてから戻る小さな跳ね返り
  return e + Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.07;
}

/** ease-out(7.4: 回転) */
function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** デバッグ用に露出する読み取り口(E2E のタップ位置計算に使う) */
export interface PlayDebug {
  tools(): { index: number; used: boolean; touched: boolean; dormant: boolean; x: number; y: number; z: number }[];
  /** ワールド座標 → キャンバス上の CSS ピクセル座標 */
  project(x: number, y: number, z: number): { x: number; y: number };
  connected(): boolean;
  cleared(): boolean;
  /** 回転アニメ中は入力を受け付けない(4.2 T1)。E2E の待ち合わせに使う */
  rotating(): boolean;
}

export interface PlayScreen {
  readonly debug: PlayDebug;
  dispose(): void;
}

export interface PlayOptions {
  /** ピンチアウト / 盤外タップ / クリア後の自動で地図へ戻る(5.1) */
  onExit?(cleared: boolean): void;
  /** 地図へ引き始めた瞬間。遷移時間の実測に使う */
  onExitStart?(): void;
}

export function createPlayScreen(container: HTMLElement, level: Level, opts: PlayOptions = {}): PlayScreen {
  const palette = PALETTES[level.theme];
  const stage: Stage = createStage(container);
  stage.setPalette(palette);

  let state: GameState = { board: buildBoard(level), tools: buildTools(level) };
  const { w, h } = level.size;
  const idx = (x: number, y: number): number => y * w + x;

  const surroundings = createSurroundings(w, h, palette);
  stage.root.add(surroundings.group);

  // --- タイル ---
  const tileMeshes: THREE.Mesh[] = [];
  const blockProps: (THREE.Group | undefined)[] = [];
  /** 回転アニメ(0.25s ease-out) */
  const rotFrom: number[] = [];
  const rotTo: number[] = [];
  const rotT: number[] = [];
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
      rotFrom.push(mesh.rotation.y);
      rotTo.push(mesh.rotation.y);
      rotT.push(-1);
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

      // 橋バリアント: 直線タイルに欄干と橋げたを立てる(6.3 の 9 面)
      if (palette.bridge && tile.kind === 'straight') {
        const rails = createBridgeRails(palette);
        rails.position.set(x, topYOf(tile.height), y);
        rails.rotation.y = -tile.rot * (Math.PI / 2);
        stage.root.add(rails);
      }
    }
  }

  /** セルの現在の(アニメ中の)高さ */
  const liftAt = (c: Vec2): number => {
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) return 0;
    return lift[idx(c.x, c.y)] ?? 0;
  };

  // --- 装飾(6.3 / 7.2)。当たり判定には含めない ---
  const props = createPropField(planProps(level, state.board, palette), palette);
  stage.root.add(props.group);

  // --- ゴールの旗 ---
  const goalPos = findTile(state.board, 'goal');
  const flag = createGoalFlag(palette);
  if (goalPos) {
    flag.position.set(goalPos.x, topYOf(liftAt(goalPos)), goalPos.y);
    stage.root.add(flag);
  } else {
    flag.visible = false;
  }

  // --- 待機中の列車の «尾» が盤外に浮かないよう、スタート手前に線路を 1 枚置く ---
  const startPos = findTile(state.board, 'start');
  if (startPos && level.vehicle === 'train') {
    const startTile = tileAt(state.board, startPos);
    // start は 1 方向にだけ繋がる。その逆側(= 列車が来た方向)に線路を伸ばす
    const dir = startTile ? startTile.rot : 0;
    const back = [
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
    ][dir] ?? { dx: 0, dy: -1 };
    const approach = new THREE.Mesh(
      new THREE.BoxGeometry(SLAB_SIZE, TILE_THICKNESS, SLAB_SIZE),
      [
        new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.7) }),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.7) }),
        new THREE.MeshLambertMaterial({ map: railTexture('straight', palette.road, palette.ground) }),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.55) }),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.7) }),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground).multiplyScalar(0.7) }),
      ],
    );
    approach.position.set(
      startPos.x + back.dx,
      topYOf(startTile?.height ?? 0) - TILE_THICKNESS / 2,
      startPos.y + back.dy,
    );
    approach.rotation.y = back.dx !== 0 ? Math.PI / 2 : 0;
    approach.receiveShadow = true;
    stage.root.add(approach);
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
    stage.root.add(ov.group);
  });

  /**
   * 盤面そのものの当たり判定(toolIndex = -1)。
   * ツールでないタイルを押しても «何も起きない» ようにするために要る。
   * これが無いと、盤面のど真ん中を触っただけで地図へ戻ってしまう(5.1 / R8)。
   */
  const boardPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 1.2, h + 1.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  boardPlane.rotation.x = -Math.PI / 2;
  boardPlane.position.set((w - 1) / 2, 0.01, (h - 1) / 2);
  boardPlane.userData['toolIndex'] = -1;
  stage.root.add(boardPlane);

  /**
   * «まだ効かない» ツールは隠す(レベル 9 の «壊してから回す»)。
   * 瓦礫の上に乗った回転ツールは、壊れて道が現れるまで出さない。
   * アイコンが重なって見えるのと、当たり判定の板が重なるのを同時に防ぐ。
   */
  function isDormant(index: number): boolean {
    const tool = state.tools[index];
    if (!tool || tool.kind === 'destroy') return false;
    return tool.cells.every((c) => tileAt(state.board, c)?.kind === 'block');
  }

  function refreshTargets(): void {
    hitObjects.length = 0;
    overlays.forEach((ov, i) => {
      const tool = state.tools[i];
      const hidden = (tool?.used ?? false) || isDormant(i);
      ov.group.visible = !hidden;
      if (!hidden) hitObjects.push(...ov.hitPlanes);
    });
    hitObjects.push(boardPlane);
  }
  refreshTargets();

  // --- カメラのフィット ---
  const box = new THREE.Box3(
    new THREE.Vector3(-0.5, 0, -0.5),
    new THREE.Vector3(w - 0.5, STEP_HEIGHT + TILE_THICKNESS + 0.6, h - 0.5),
  );
  const frame = frameFromBox(box);
  /** 地図へ引くときの枠(盤面の外まで見える) */
  const outFrame = expandFrame(frame, 2.6);
  stage.fit(frame);

  // --- ゲーム進行の状態 ---
  let connected = false;
  let launchTimer = -1;
  let idleTimer = 0;
  let hintCount = 0;
  let cleared = false;
  let hintActive = false;
  let hintReturnTimer = -1;
  let autoExitTimer = -1;
  let exiting = -1;
  let driving = false;
  const pressAmount: number[] = state.tools.map(() => 0);
  const pressTarget: number[] = state.tools.map(() => 0);

  function anyRotating(): boolean {
    for (const t of rotT) if (t >= 0) return true;
    return false;
  }

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
        const target = mesh.rotation.y;
        // 回転は 0.25s ease-out のトゥイーンで追いつかせる(7.4)
        mesh.rotation.y = prevRot;
        if (Math.abs(target - prevRot) > 1e-6) {
          let from = prevRot;
          // 最短方向に回さず、必ず時計回りに見せる(3.3-(4): 回転方向は常に時計回り)
          while (from < target) from += Math.PI * 2;
          while (from - target >= Math.PI * 2) from -= Math.PI * 2;
          rotFrom[i] = from;
          rotTo[i] = target;
          rotT[i] = 0;
        }
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
    driving = false;
    stopEngine();
    if (connected && !previouslyConnected) {
      pathLine.startSweep(); // 繋がった瞬間、端から端へ光が流れる(3.3-(6))
      launchTimer = LAUNCH_DELAY;
    } else {
      launchTimer = -1;
    }
  }

  function onArrive(): void {
    driving = false;
    stopEngine();
    if (!connected || cleared) return;
    cleared = true;
    const gp = goalPos ?? { x: 0, y: 0 };
    confetti.burst(new THREE.Vector3(gp.x, topYOf(liftAt(gp)), gp.y));
    playSparkle();
    playFanfare();
    markCleared(level.id);
    // 2 秒待って自動で地図へ戻る。その間のタップで留まれる(3.4)
    autoExitTimer = AUTO_EXIT_DELAY;
  }

  function exitToMap(): void {
    if (exiting >= 0) return;
    if (!opts.onExit) return;
    exiting = CAMERA_SECONDS;
    autoExitTimer = -1;
    stopEngine();
    playExitIsland();
    opts.onExitStart?.();
    stage.animateFit(outFrame, CAMERA_SECONDS);
  }

  /** 破壊の演出(4.2 T3): 破片が飛び、土煙が上がり、跡は空地になる */
  function playDestroyFx(cells: readonly Vec2[], before: GameState): void {
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
    // 盤面そのもののタップ。何も起きない(戻りもしない)
    if (toolIndex < 0) return;
    resumeAudio();
    startBgm(level.theme);
    idleTimer = 0;
    hintActive = false;
    hintReturnTimer = -1;
    autoExitTimer = -1; // クリア後のタップは «まだ見ていたい» の合図(3.4)

    const before = connected;
    const beforeState = state;
    const result = applyTool(state, toolIndex);
    state = result.state;
    pressTarget[toolIndex] = 0;

    if (!result.changed) {
      playMiss(); // 「ぷにっと沈んで戻る」だけ(4.2 T3)
      stage.requestRender();
      return;
    }

    const tool = state.tools[toolIndex];
    cleared = false;
    refreshVisuals();
    updatePath(before);

    if (tool?.kind === 'rotate') playRotate();
    if (tool?.kind === 'destroy') {
      playDestroy();
      playDestroyFx(tool.cells, beforeState);
    }
    if (tool?.kind === 'raise') {
      // 持ち上げ時の土煙(4.2 T2)
      const first = tool.cells[0];
      const wasHigh = first ? (tileAt(beforeState.board, first)?.height ?? 0) : 0;
      const nowHigh = first ? (tileAt(state.board, first)?.height ?? 0) : 0;
      playLift(nowHigh > wasHigh);
      for (const c of tool.cells) dust.burst(new THREE.Vector3(c.x, topYOf(liftAt(c)), c.y));
    }

    // 使い切りのツールはオーバーレイ・点線枠・アイコンごと消える(4.2 T3)。
    // 瓦礫が消えて «効くようになった» ツールはここで現れる。
    refreshTargets();
    stage.requestRender();
  }

  const input = attachTouchInput(stage.renderer.domElement, stage.camera, { objects: hitObjects }, {
    onPressStart(i) {
      if (i < 0) return;
      pressTarget[i] = 1;
      idleTimer = 0;
      autoExitTimer = -1;
      stage.requestRender();
    },
    onPressEnd(i) {
      if (i < 0) return;
      pressTarget[i] = 0;
      stage.requestRender();
    },
    onTap: tap,
    // 盤面の外側(海・隣の島)をタップしても地図へ戻る(5.1)
    onOutsideTap: exitToMap,
    // 2 本指ピンチアウトが «戻る» の主操作(5.1)
    onPinchOut: exitToMap,
    onFirstInput() {
      resumeAudio();
      startBgm(level.theme);
    },
    // 回転アニメ中は入力を受け付けない(4.2 T1)
    locked: () => anyRotating() || exiting >= 0,
  });

  updatePath(false);

  stage.onFrame((dt, t) => {
    let busy = false;

    // タイルのアニメーション(7.4)
    for (let i = 0; i < tileMeshes.length; i++) {
      const mesh = tileMeshes[i]!;

      // 回転: 0.25s ease-out
      const rt = rotT[i]!;
      if (rt >= 0) {
        const nt = rt + dt;
        const p = Math.min(1, nt / ROTATE_DURATION);
        const from = rotFrom[i]!;
        const to = rotTo[i]!;
        mesh.rotation.y = from + (to - from) * easeOut(p);
        rotT[i] = p >= 1 ? -1 : nt;
        if (p >= 1) mesh.rotation.y = to;
        busy = true;
      }

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
        setTileLift(mesh, lift[i]!);
        const prop = blockProps[i];
        if (prop) prop.position.y = topYOf(lift[i]!);
        busy = true;
      }
    }

    // ツールのオーバーレイをタイルの高さに追従させる
    if (busy) for (const ov of overlays) ov.syncHeights(liftAt);

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
      if (Math.abs(next - a) > 0.001) busy = true;
      pressAmount[i] = next;
      pressOverlay(ov, next);
    });

    pathLine.tick(dt);
    vehicle.tick(dt, t);
    confetti.tick(dt);
    dust.tick(dt);
    debris.tick(dt);
    // 蛍のゆらぎ・水面のコースティクスは «ゆっくり動くもの»。30fps に間引く(R4 / R5)
    let slow = false;
    if (props.tick(t)) slow = true;
    if (surroundings.tick(dt)) slow = true;
    if (vehicle.mode !== 'idle') busy = true;

    // 溜めてから発車(4.4)
    if (launchTimer > 0) {
      launchTimer -= dt;
      busy = true;
      if (launchTimer <= 0) {
        launchTimer = -1;
        driving = true;
        startEngine(level.vehicle);
        vehicle.drive(onArrive);
      }
    }

    // 無操作ヒント(3.4)
    if (!connected && !hintActive && exiting < 0) {
      idleTimer += dt;
      if (idleTimer >= HINT_IDLE) {
        idleTimer = 0;
        hintCount++;
        hintActive = true;
        startEngine(level.vehicle);
        vehicle.drive(() => {
          vehicle.setPuzzled(true);
          stopEngine();
          playHorn(); // 首をかしげて短いクラクション 1 回(責める音にはしない)
          hintReturnTimer = 1.2;
        });
      }
    }
    if (hintReturnTimer > 0) {
      hintReturnTimer -= dt;
      busy = true;
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

    // クリア後、2 秒待って自動で地図へズームアウト(3.4)
    if (autoExitTimer > 0) {
      autoExitTimer -= dt;
      busy = true;
      if (autoExitTimer <= 0) {
        autoExitTimer = -1;
        exitToMap();
      }
    }
    if (exiting >= 0) {
      exiting -= dt;
      busy = true;
      if (exiting <= 0) {
        exiting = -1;
        opts.onExit?.(cleared);
        return;
      }
    }

    if (driving) busy = true;
    // オンデマンドレンダリング(R5)。明滅と旗の揺れしか無いときは低頻度でだけ描く
    if (busy) stage.requestRender();
    else if (slow) stage.requestSlowRender();
    else stage.requestIdleRender();
  });

  stage.start();

  const debug: PlayDebug = {
    tools() {
      return overlays.map((ov, i) => ({
        index: i,
        used: state.tools[i]?.used ?? false,
        touched: state.tools[i]?.touched ?? false,
        dormant: isDormant(i),
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
    rotating: () => anyRotating(),
  };

  return {
    debug,
    dispose() {
      stopEngine();
      input.dispose();
      stage.dispose();
    },
  };
}
