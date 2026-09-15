import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/core/EventLog';
import { Rng } from '../src/core/Rng';
import { computeLayout } from '../src/game/layout';
import { JOB_RUN_MS, World, type SpeechRequest, type WorldStateView } from '../src/game/world';
import { SCENARIOS, type ScenarioName } from '../src/scenarios/scenarios';

const PORTRAIT: [number, number] = [390, 844];
const LANDSCAPE: [number, number] = [844, 390];

interface Harness {
  world: World;
  spoken: SpeechRequest[];
  step: (ms: number) => void;
  rotate: (w: number, h: number) => void;
}

function makeWorld(scenario: ScenarioName, [w, h]: [number, number] = PORTRAIT): Harness {
  const log = new EventLog(400);
  const spoken: SpeechRequest[] = [];
  const world = new World({
    layout: computeLayout(w, h),
    rng: new Rng(SCENARIOS[scenario].seed),
    log,
    speak: (r) => spoken.push(r),
  });
  SCENARIOS[scenario].apply(world);
  let t = 0;
  return {
    world,
    spoken,
    step: (ms) => {
      let remaining = ms;
      while (remaining > 0) {
        const slice = Math.min(16, remaining);
        t += slice;
        world.update(slice, t);
        remaining -= slice;
      }
    },
    // Game.handleResize と同じことをする（layout を計算し直して世界に渡すだけ）
    rotate: (nw, nh) => world.setLayout(computeLayout(nw, nh)),
  };
}

/** 状態の一致は stateView（PLAN §5.2 の項目）で見る。 */
function view(world: World): WorldStateView {
  return world.stateView();
}

describe('回転・リサイズ', () => {
  it('縦横で世界の作りは同じで、置き直されるだけ', () => {
    const p = computeLayout(...PORTRAIT);
    const l = computeLayout(...LANDSCAPE);
    expect(p.orientation).toBe('portrait');
    expect(l.orientation).toBe('landscape');
    // 同じ物が、どちらでも画面の中にある
    for (const layout of [p, l]) {
      for (const pt of [
        layout.burner,
        layout.wireGap,
        layout.flareLauncher,
        layout.batteryFactory,
        layout.remote,
        layout.prism,
        layout.materialSlots.copper_scrap,
      ]) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(layout.width);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(layout.height);
      }
    }
    // 奥の物の見え方は縦横で揃う（工房の短辺から決まる）
    expect(Math.abs(l.unit - p.unit) / p.unit).toBeLessThan(0.35);
  });

  it('何も持っていないとき、回転しても stateView が一致する', () => {
    const h = makeWorld('copper_called');
    h.step(320);
    const before = view(h.world);
    h.rotate(...LANDSCAPE);
    expect(view(h.world)).toEqual(before);
    // 元に戻しても同じ
    h.rotate(...PORTRAIT);
    expect(view(h.world)).toEqual(before);
  });

  it('材料を持ったまま回転しても、持ったまま・進行状態も失わない', () => {
    const h = makeWorld('copper_called');
    const m = h.world.material('copper_scrap');
    h.world.pointerDown(m.x, m.y);
    const flame = h.world.layout.flame;
    h.world.pointerMove(flame.x, flame.y - flame.h * 0.5);
    h.step(160);

    const before = view(h.world);
    expect(before.held?.id).toBe('copper_scrap');
    expect(before.held?.inFlame).toBe(true);
    expect(before.flame.element).toBe('copper');

    h.rotate(...LANDSCAPE);
    const after = view(h.world);
    // 保持中の材料・炎の色・仕事の進行は、置き直しでは変わらない
    expect(after).toEqual(before);
    expect(h.world.layout.orientation).toBe('landscape');
  });

  it('回転したあとも、新しい置き場所へ届けて仕事が動く', () => {
    const h = makeWorld('copper_called');
    const m = h.world.material('copper_scrap');
    h.world.pointerDown(m.x, m.y);
    const flame = h.world.layout.flame;
    h.world.pointerMove(flame.x, flame.y - flame.h * 0.5);
    h.step(160);
    expect(view(h.world).flame.element).toBe('copper');

    // 持ったまま横画面へ
    h.rotate(...LANDSCAPE);
    expect(view(h.world).held?.id).toBe('copper_scrap');

    // 横画面の新しい受け口へ運んで離す（判定は通常の入力経路を通る）
    const gap = h.world.layout.wireGap;
    h.world.pointerMove(gap.x, gap.y);
    h.step(16);
    h.world.pointerUp(gap.x, gap.y);
    h.step(16);
    const delivering = view(h.world);
    expect(delivering.jobs.find((j) => j.id === 'wiring')?.status).toBe('job_running');

    h.step(JOB_RUN_MS.wiring + 64);
    expect(view(h.world).jobs.find((j) => j.id === 'wiring')?.status).toBe('done');
  });

  it('仕事が動いている最中に回転しても、進行は途切れない', () => {
    const h = makeWorld('copper_called');
    const m = h.world.material('copper_scrap');
    const gap = h.world.layout.wireGap;
    h.world.pointerDown(m.x, m.y);
    h.world.pointerMove(gap.x, gap.y);
    h.world.pointerUp(gap.x, gap.y);
    h.step(Math.round(JOB_RUN_MS.wiring / 2));
    const mid = h.world.job('wiring').progress;
    expect(mid).toBeGreaterThan(0.2);

    h.rotate(...LANDSCAPE);
    expect(h.world.job('wiring').progress).toBe(mid);
    expect(h.world.job('wiring').status).toBe('job_running');

    h.step(JOB_RUN_MS.wiring / 2 + 64);
    expect(h.world.job('wiring').status).toBe('done');
    // 直った材料は、横画面の木箱の定位置へ戻る
    h.step(3200);
    const back = h.world.material('copper_scrap');
    const slot = h.world.layout.materialSlots.copper_scrap;
    expect(back.at).toBe('bench');
    expect(back.x).toBeCloseTo(slot.x, 3);
    expect(back.y).toBeCloseTo(slot.y, 3);
  });

  it('大きさだけ変わっても（Safari のバーの出入り）状態は変わらない', () => {
    const h = makeWorld('battery_called');
    h.step(480);
    const before = view(h.world);
    h.rotate(390, 790);
    expect(view(h.world)).toEqual(before);
  });
});
