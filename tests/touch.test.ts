import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachTouchInput, EDGE_IGNORE_PX, TAP_SLOP_PX } from '../src/input/touch';

/**
 * 誤タッチ耐性(5.1 / 5.2)の検証。
 * DOM も WebGL も要らないよう、キャンバスの代わりに «イベントを配る箱» を渡す。
 */

interface FakeDom {
  addEventListener(type: string, fn: (e: never) => void): void;
  removeEventListener(type: string, fn: (e: never) => void): void;
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
  fire(type: string, e: Record<string, unknown>): void;
  listeners(type: string): number;
}

const SIZE = 400;

function fakeDom(): FakeDom {
  const map = new Map<string, ((e: never) => void)[]>();
  return {
    addEventListener(type, fn) {
      const list = map.get(type) ?? [];
      list.push(fn);
      map.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = map.get(type) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE };
    },
    fire(type, e) {
      for (const fn of [...(map.get(type) ?? [])]) fn({ preventDefault() {}, ...e } as never);
    },
    listeners(type) {
      return (map.get(type) ?? []).length;
    },
  };
}

function isoCamera(): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 200);
  cam.position.set(20, 20, 20);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function hitPlane(toolIndex: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData['toolIndex'] = toolIndex;
  mesh.updateMatrixWorld(true);
  return mesh;
}

interface Log {
  taps: number[];
  pressStarts: number[];
  pressEnds: number[];
  outside: number;
  pinchOut: number;
  pinchIn: number;
  firstInput: number;
}

function setup(locked = false): { dom: FakeDom; log: Log; dispose(): void } {
  const dom = fakeDom();
  const log: Log = { taps: [], pressStarts: [], pressEnds: [], outside: 0, pinchOut: 0, pinchIn: 0, firstInput: 0 };
  const input = attachTouchInput(
    dom as unknown as HTMLCanvasElement,
    isoCamera(),
    { objects: [hitPlane(0)] },
    {
      onPressStart: (i) => log.pressStarts.push(i),
      onPressEnd: (i) => log.pressEnds.push(i),
      onTap: (i) => log.taps.push(i),
      onOutsideTap: () => {
        log.outside++;
      },
      onPinchOut: () => {
        log.pinchOut++;
      },
      onPinchIn: () => {
        log.pinchIn++;
      },
      onFirstInput: () => {
        log.firstInput++;
      },
      locked: () => locked,
    },
  );
  return { dom, log, dispose: () => input.dispose() };
}

/** 画面のまんなか = 当たり判定の板のまんなか */
const MID = SIZE / 2;

describe('タップ判定(5.1)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('押して離すとタップになり、押し込みアニメも出る', () => {
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.pressStarts).toEqual([0]);
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.taps).toEqual([0]);
    expect(ctx.log.firstInput).toBe(1);
  });

  it(`${TAP_SLOP_PX}px 以上動かすとタップにならない`, () => {
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointermove', { pointerId: 1, clientX: MID + TAP_SLOP_PX + 4, clientY: MID });
    expect(ctx.log.pressEnds).toEqual([0]); // 押し込みは戻る
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID + TAP_SLOP_PX + 4, clientY: MID });
    expect(ctx.log.taps).toEqual([]);
    expect(ctx.log.outside).toBe(0);
  });

  it('少しだけ動いてもタップになる(4 歳の指のぶれ)', () => {
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointermove', { pointerId: 1, clientX: MID + 5, clientY: MID + 5 });
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID + 5, clientY: MID + 5 });
    expect(ctx.log.taps).toEqual([0]);
  });

  it('pointercancel ではタップにならない', () => {
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointercancel', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.pressEnds).toEqual([0]);
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.taps).toEqual([]);
  });

  it('板の外を離すと «外側のタップ»(地図へ戻る)', () => {
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID + 150, clientY: MID });
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID + 150, clientY: MID });
    expect(ctx.log.taps).toEqual([]);
    expect(ctx.log.outside).toBe(1);
  });

  it('dispose で購読を全部やめる', () => {
    ctx.dispose();
    expect(ctx.dom.listeners('pointerdown')).toBe(0);
    expect(ctx.dom.listeners('pointermove')).toBe(0);
    expect(ctx.dom.listeners('pointerup')).toBe(0);
    expect(ctx.dom.listeners('pointercancel')).toBe(0);
  });
});

describe('誤タッチ耐性(5.2)', () => {
  it(`画面端 ${EDGE_IGNORE_PX}px 以内は無視する(手のひらの誤接触)`, () => {
    const ctx = setup();
    for (const [x, y] of [
      [EDGE_IGNORE_PX - 2, MID],
      [SIZE - EDGE_IGNORE_PX + 2, MID],
      [MID, EDGE_IGNORE_PX - 2],
      [MID, SIZE - EDGE_IGNORE_PX + 2],
    ] as const) {
      ctx.dom.fire('pointerdown', { pointerId: 1, clientX: x, clientY: y });
      ctx.dom.fire('pointerup', { pointerId: 1, clientX: x, clientY: y });
    }
    expect(ctx.log.taps).toEqual([]);
    expect(ctx.log.outside).toBe(0);
    expect(ctx.log.pressStarts).toEqual([]);
  });

  it('2 本目の指が触れたらタップを取り消す', () => {
    const ctx = setup();
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.pressStarts).toEqual([0]);
    ctx.dom.fire('pointerdown', { pointerId: 2, clientX: MID + 40, clientY: MID + 40 });
    expect(ctx.log.pressEnds).toEqual([0]);
    ctx.dom.fire('pointerup', { pointerId: 2, clientX: MID + 40, clientY: MID + 40 });
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.taps).toEqual([]);
  });

  it('回転アニメ中(locked)はタップも押し込みも起きない', () => {
    const ctx = setup(true);
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    expect(ctx.log.pressStarts).toEqual([]);
    expect(ctx.log.taps).toEqual([]);
    expect(ctx.log.outside).toBe(0);
  });

  it('連打しても回転中の入力は捨てられる(locked の間だけ)', () => {
    const dom = fakeDom();
    const taps: number[] = [];
    let locked = false;
    attachTouchInput(
      dom as unknown as HTMLCanvasElement,
      isoCamera(),
      { objects: [hitPlane(0)] },
      {
        onPressStart() {},
        onPressEnd() {},
        onTap(i) {
          taps.push(i);
          locked = true; // 回転アニメが始まる
        },
        locked: () => locked,
      },
    );
    const tap = (): void => {
      dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
      dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    };
    tap();
    tap();
    tap();
    expect(taps).toEqual([0]); // 2 回目以降は捨てられる
    locked = false; // アニメが終われば また効く
    tap();
    expect(taps).toEqual([0, 0]);
  });
});

describe('ピンチ(5.1)', () => {
  it('2 点の距離が 1.2 倍になったらズームアウト(地図へ戻る)', () => {
    const ctx = setup();
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID - 50, clientY: MID });
    ctx.dom.fire('pointerdown', { pointerId: 2, clientX: MID + 50, clientY: MID });
    ctx.dom.fire('pointermove', { pointerId: 2, clientX: MID + 80, clientY: MID });
    expect(ctx.log.pinchOut).toBe(1);
    expect(ctx.log.pinchIn).toBe(0);
    // 1 回だけ
    ctx.dom.fire('pointermove', { pointerId: 2, clientX: MID + 120, clientY: MID });
    expect(ctx.log.pinchOut).toBe(1);
  });

  it('距離が縮まったらズームイン', () => {
    const ctx = setup();
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID - 60, clientY: MID });
    ctx.dom.fire('pointerdown', { pointerId: 2, clientX: MID + 60, clientY: MID });
    ctx.dom.fire('pointermove', { pointerId: 2, clientX: MID + 20, clientY: MID });
    expect(ctx.log.pinchIn).toBe(1);
    expect(ctx.log.taps).toEqual([]);
  });

  it('ピンチのあと指を離してもタップにならない', () => {
    const ctx = setup();
    ctx.dom.fire('pointerdown', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointerdown', { pointerId: 2, clientX: MID + 60, clientY: MID });
    ctx.dom.fire('pointerup', { pointerId: 1, clientX: MID, clientY: MID });
    ctx.dom.fire('pointerup', { pointerId: 2, clientX: MID + 60, clientY: MID });
    expect(ctx.log.taps).toEqual([]);
    expect(ctx.log.outside).toBe(0);
  });
});
