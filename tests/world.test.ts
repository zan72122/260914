import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/core/EventLog';
import { Rng } from '../src/core/Rng';
import { computeLayout } from '../src/game/layout';
import { AFTERGLOW_MS, JOB_RUN_MS, World, type SpeechRequest } from '../src/game/world';
import { SCENARIOS } from '../src/scenarios/scenarios';

interface Harness {
  world: World;
  log: EventLog;
  spoken: SpeechRequest[];
  step: (ms: number) => void;
}

function makeWorld(scenario: 'bench_idle' | 'copper_called', w = 390, h = 844): Harness {
  const layout = computeLayout(w, h);
  const log = new EventLog(200);
  const spoken: SpeechRequest[] = [];
  const world = new World({
    layout,
    rng: new Rng(SCENARIOS[scenario].seed),
    log,
    speak: (r) => spoken.push(r),
  });
  SCENARIOS[scenario].apply(world);
  let t = 0;
  const step = (ms: number): void => {
    let remaining = ms;
    while (remaining > 0) {
      const slice = Math.min(16, remaining);
      t += slice;
      world.update(slice, t);
      remaining -= slice;
    }
  };
  return { world, log, spoken, step };
}

function flamePoint(world: World): { x: number; y: number } {
  const f = world.layout.flame;
  return { x: f.x, y: f.y - f.h * 0.5 };
}

/** 本来の入力経路（押さえる → 引きずる → 離す）だけで届ける一筆書き。 */
function deliver(h: Harness, materialId: 'copper_scrap' | 'lithium_powder'): void {
  const m = h.world.material(materialId);
  h.world.pointerDown(m.x, m.y);
  const f = flamePoint(h.world);
  h.world.pointerMove((m.x + f.x) / 2, (m.y + f.y) / 2);
  h.world.pointerMove(f.x, f.y);
  h.step(160);
  const gap = h.world.layout.wireGap;
  h.world.pointerMove(f.x, f.y - 60);
  h.step(160);
  h.world.pointerMove(gap.x, gap.y);
  h.step(160);
  h.world.pointerUp(gap.x, gap.y);
}

describe('World: 銅を届ける', () => {
  it('copper_called は配線が呼ばれた状態で始まり、名前が一度だけ聞こえる', () => {
    const h = makeWorld('copper_called');
    expect(h.world.job('wiring').status).toBe('called');
    expect(h.world.job('wiring').calledAt).toBe(0);
    expect(h.spoken.map((s) => s.label)).toEqual(['銅〜']);
    expect(h.spoken[0].text).toBe('どう〜');
  });

  it('bench_idle は困りなし・炎は青・全材料が台', () => {
    const h = makeWorld('bench_idle');
    const s = h.world.stateView();
    expect(s.jobs[0].status).toBe('waiting');
    expect(s.flame.element).toBeNull();
    expect(s.materials.every((m) => m.at === 'bench')).toBe(true);
    expect(h.spoken).toHaveLength(0);
  });

  it('炎に触れている間だけ炎が元素色になる', () => {
    const h = makeWorld('copper_called');
    const m = h.world.material('copper_scrap');
    h.world.pointerDown(m.x, m.y);
    expect(h.world.stateView().flame.element).toBeNull();
    const f = flamePoint(h.world);
    h.world.pointerMove(f.x, f.y);
    expect(h.world.stateView().flame.element).toBe('copper');
    expect(h.world.stateView().flame.intensityPct).toBeGreaterThan(100);
    h.world.pointerMove(f.x, f.y - h.world.layout.flame.h * 2);
    expect(h.world.stateView().flame.element).toBeNull();
  });

  it('炎から出た後、余熱発光が 3 秒続いて消える', () => {
    const h = makeWorld('copper_called');
    const m = h.world.material('copper_scrap');
    const f = flamePoint(h.world);
    h.world.pointerDown(m.x, m.y);
    h.world.pointerMove(f.x, f.y);
    h.world.pointerMove(f.x, f.y - h.world.layout.flame.h * 2);
    expect(h.world.stateView().held?.afterglowMs).toBe(AFTERGLOW_MS);
    h.step(1000);
    expect(h.world.stateView().held!.afterglowMs).toBeGreaterThan(1900);
    h.step(AFTERGLOW_MS);
    expect(h.world.stateView().held!.afterglowMs).toBe(0);
  });

  it('銅を配線の隙間に置くと仕事が動き、進めると終わって灯が点く', () => {
    const h = makeWorld('copper_called');
    deliver(h, 'copper_scrap');
    expect(h.world.stateView().jobs[0].status).toBe('job_running');
    expect(h.world.stateView().phase).toBe('job_running');
    expect(h.world.stateView().input.accepting).toBe(false);
    expect(h.world.stateView().waitingFor).toBe('job_animation');
    h.step(JOB_RUN_MS + 32);
    const s = h.world.stateView();
    expect(s.jobs[0].status).toBe('done');
    expect(s.phase).toBe('idle');
    expect(h.world.job('wiring').lampLit).toBe(1);
    expect(h.spoken.map((s2) => s2.label)).toEqual(['銅〜', '銅、ありがとう']);
    expect(h.spoken[1].text).toBe('どう、ありがとう');
  });

  it('ログに 入力 → 炎入り → 炎出 → 届け → 成功 → 発話 の順が残る', () => {
    const h = makeWorld('copper_called');
    deliver(h, 'copper_scrap');
    const keys = h.log.tail().map((e) => `${e.kind}:${e.msg}`);
    const want = ['input:down', 'flame:enter', 'flame:exit', 'input:up', 'deliver:success'];
    let i = 0;
    for (const k of keys) if (k === want[i]) i++;
    expect(i, keys.join(' > ')).toBe(want.length);
    expect(h.spoken[h.spoken.length - 1].reason).toBe('thanks');
  });

  it('銅以外を置いても何も起きず、材料はその場に残り拾い直せる', () => {
    const h = makeWorld('copper_called');
    deliver(h, 'lithium_powder');
    const s = h.world.stateView();
    expect(s.jobs[0].status).toBe('called');
    expect(s.materials.find((m) => m.id === 'lithium_powder')!.at).toBe('site:wiring');
    expect(h.spoken).toHaveLength(1);
    const reasons = h.log.tail().filter((e) => e.msg === 'mismatch');
    expect(reasons[0].data?.reason).toBe('element_mismatch');
    // 拾い直せる
    const m = h.world.material('lithium_powder');
    h.world.pointerDown(m.x, m.y);
    expect(h.world.stateView().held?.id).toBe('lithium_powder');
  });

  it('仕事が動いている間は新しい入力を受けない', () => {
    const h = makeWorld('copper_called');
    deliver(h, 'copper_scrap');
    const m = h.world.material('strontium_grains');
    h.world.pointerDown(m.x, m.y);
    expect(h.world.stateView().held).toBeNull();
    expect(h.world.stateView().input.rejectReason).toBe('job_animation');
  });

  it('同じ入力列は同じ結果になる（再現）', () => {
    const run = (): string => {
      const h = makeWorld('copper_called');
      deliver(h, 'copper_scrap');
      h.step(JOB_RUN_MS + 32);
      return JSON.stringify({
        state: h.world.stateView(),
        log: h.log.tail().map((e) => `${e.t}|${e.kind}:${e.msg}`),
        spoken: h.spoken,
      });
    };
    expect(run()).toBe(run());
  });

  it('縦横は同じ世界の置き直しで、材料も仕事も保たれる', () => {
    const h = makeWorld('copper_called');
    expect(h.world.layout.orientation).toBe('portrait');
    deliver(h, 'copper_scrap');
    h.step(JOB_RUN_MS + 32);
    const before = h.world.stateView();
    h.world.setLayout(computeLayout(844, 390));
    const after = h.world.stateView();
    expect(h.world.layout.orientation).toBe('landscape');
    expect(after).toEqual(before);
    // 置き直した後も配線の場所にある
    const m = h.world.material('copper_scrap');
    expect(Math.hypot(m.x - h.world.layout.wireGap.x, m.y - h.world.layout.wireGap.y)).toBeLessThan(
      h.world.layout.touchRadius * 2,
    );
  });
});
