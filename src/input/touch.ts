import * as THREE from 'three';

/** 画面端 16px 以内は手のひらの誤接触とみなして無視する(5.2) */
export const EDGE_IGNORE_PX = 16;
/** 12px 以上動いたらタップではない(5.1) */
export const TAP_SLOP_PX = 12;
/** 2 点の距離がこの倍率を超えたらピンチとみなす(5.1: 判定は緩め) */
export const PINCH_RATIO = 1.2;

export interface TapTargets {
  /** 当たり判定に使う見えない板。userData.toolIndex を持つ */
  readonly objects: THREE.Object3D[];
}

export interface TouchHandlers {
  /** 押し込みアニメ用。押された対象(ツール番号)を即座に伝える(3.3-(6)) */
  onPressStart(toolIndex: number): void;
  /** 押し込みの解除(キャンセル or 確定の直前) */
  onPressEnd(toolIndex: number): void;
  /** タップ確定(pointerup、5.1) */
  onTap(toolIndex: number): void;
  /** 盤面の外側(海・隣の島)のタップ。地図へ戻る操作(5.1) */
  onOutsideTap?(): void;
  /** 2 本指ピンチアウト。ズームアウト = 地図へ戻る(5.1) */
  onPinchOut?(): void;
  /** 2 本指ピンチイン。地図画面で島に寄る(5.1) */
  onPinchIn?(): void;
  /** 最初の入力。AudioContext の resume 契機(R1) */
  onFirstInput?(): void;
  /** タップを受け付けない状態か(回転アニメ中など、4.2 T1) */
  locked?(): boolean;
}

export interface TouchInput {
  dispose(): void;
}

export function attachTouchInput(
  dom: HTMLCanvasElement,
  camera: THREE.Camera,
  targets: TapTargets,
  handlers: TouchHandlers,
): TouchInput {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let activeId: number | undefined;
  let startX = 0;
  let startY = 0;
  let pressedTool: number | undefined;
  let firstInputDone = false;

  /** ピンチ検出用(5.1: pointer イベントを自前で処理して 2 点の距離変化を追う) */
  const points = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let pinchFired = false;

  function pick(clientX: number, clientY: number): number | undefined {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets.objects, false);
    const first = hits[0];
    if (!first) return undefined;
    const idx = first.object.userData['toolIndex'];
    return typeof idx === 'number' ? idx : undefined;
  }

  function nearEdge(clientX: number, clientY: number): boolean {
    const rect = dom.getBoundingClientRect();
    return (
      clientX - rect.left < EDGE_IGNORE_PX ||
      rect.right - clientX < EDGE_IGNORE_PX ||
      clientY - rect.top < EDGE_IGNORE_PX ||
      rect.bottom - clientY < EDGE_IGNORE_PX
    );
  }

  function cancel(): void {
    if (pressedTool !== undefined) handlers.onPressEnd(pressedTool);
    pressedTool = undefined;
    activeId = undefined;
  }

  function pinchDistance(): number {
    const it = [...points.values()];
    const a = it[0];
    const b = it[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const onDown = (e: PointerEvent): void => {
    if (!firstInputDone) {
      firstInputDone = true;
      handlers.onFirstInput?.();
    }
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size >= 2) {
      // 2 本目の指が触れた。ここからはピンチとして扱い、タップは取り消す
      cancel();
      pinchStart = pinchDistance();
      pinchFired = false;
      return;
    }
    if (activeId !== undefined) {
      cancel();
      return;
    }
    if (nearEdge(e.clientX, e.clientY)) return;
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    if (handlers.locked?.()) return;
    const idx = pick(e.clientX, e.clientY);
    if (idx !== undefined) {
      pressedTool = idx;
      handlers.onPressStart(idx);
    }
  };

  const onMove = (e: PointerEvent): void => {
    const p = points.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (points.size >= 2) {
      if (pinchFired || pinchStart <= 0) return;
      const d = pinchDistance();
      if (d <= 0) return;
      const ratio = d / pinchStart;
      if (ratio >= PINCH_RATIO) {
        pinchFired = true;
        handlers.onPinchOut?.();
      } else if (ratio <= 1 / PINCH_RATIO) {
        pinchFired = true;
        handlers.onPinchIn?.();
      }
      return;
    }
    if (e.pointerId !== activeId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) cancel();
  };

  const onUp = (e: PointerEvent): void => {
    const wasPinching = points.size >= 2;
    points.delete(e.pointerId);
    if (wasPinching) {
      cancel();
      return;
    }
    if (e.pointerId !== activeId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const moved = dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX;
    const pressed = pressedTool;
    cancel();
    if (moved) return;
    if (nearEdge(e.clientX, e.clientY)) return;
    if (handlers.locked?.()) return;
    const idx = pick(e.clientX, e.clientY);
    if (idx !== undefined && idx === pressed) handlers.onTap(idx);
    else if (idx === undefined) handlers.onOutsideTap?.();
  };

  const onCancel = (e: PointerEvent): void => {
    points.delete(e.pointerId);
    if (e.pointerId !== activeId) return;
    cancel();
  };

  const prevent = (e: Event): void => e.preventDefault();

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onCancel);
  dom.addEventListener('contextmenu', prevent);
  dom.addEventListener('touchstart', prevent, { passive: false });
  dom.addEventListener('touchmove', prevent, { passive: false });

  return {
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('contextmenu', prevent);
      dom.removeEventListener('touchstart', prevent);
      dom.removeEventListener('touchmove', prevent);
    },
  };
}
