import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/core/EventLog';
import { Rng } from '../src/core/Rng';
import { computeLayout, type JobId, type MaterialId } from '../src/game/layout';
import {
  AFTERGLOW_MS,
  DONE_HOLD_MS,
  JOB_RUN_MS,
  MAX_TROUBLES,
  World,
  type SpeechRequest,
} from '../src/game/world';
import { SCENARIOS, type ScenarioName } from '../src/scenarios/scenarios';

interface Harness {
  world: World;
  log: EventLog;
  spoken: SpeechRequest[];
  step: (ms: number) => void;
}

function makeWorld(scenario: ScenarioName, w = 390, h = 844): Harness {
  const layout = computeLayout(w, h);
  const log = new EventLog(400);
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

const MATERIAL_OF: Record<JobId, MaterialId> = {
  wiring: 'copper_scrap',
  flare: 'strontium_grains',
  battery: 'lithium_powder',
};

/** 本来の入力経路（押さえる → 炎へ → 運ぶ → 離す）だけで届ける一筆書き。 */
function deliverTo(h: Harness, materialId: MaterialId, siteId: JobId): void {
  const m = h.world.material(materialId);
  h.world.pointerDown(m.x, m.y);
  const f = flamePoint(h.world);
  h.world.pointerMove((m.x + f.x) / 2, (m.y + f.y) / 2);
  h.world.pointerMove(f.x, f.y);
  h.step(160);
  const site = World.siteOf(h.world.layout, siteId);
  h.world.pointerMove((f.x + site.x) / 2, (f.y + site.y) / 2);
  h.step(160);
  h.world.pointerMove(site.x, site.y);
  h.step(160);
  h.world.pointerUp(site.x, site.y);
}

describe('World: 三つの仕事', () => {
  it('シナリオごとに呼ばれる場所と名前が違う', () => {
    const cases: [ScenarioName, JobId, string, string][] = [
      ['copper_called', 'wiring', '銅〜', 'どう〜'],
      ['flare_called', 'flare', 'ストロンチウム〜', 'すとろんちうむ〜'],
      ['battery_called', 'battery', 'リチウム〜', 'りちうむ〜'],
    ];
    for (const [scenario, jobId, label, kana] of cases) {
      const h = makeWorld(scenario);
      expect(h.world.job(jobId).status, scenario).toBe('called');
      expect(h.world.job(jobId).calledAt).toBe(0);
      expect(h.world.troubleCount).toBe(1);
      expect(h.spoken.map((s) => s.label)).toEqual([label]);
      expect(h.spoken[0].text).toBe(kana);
    }
  });

  it.each([
    ['wiring' as JobId, 'copper_scrap' as MaterialId, '銅、ありがとう'],
    ['flare' as JobId, 'strontium_grains' as MaterialId, 'ストロンチウム、ありがとう'],
    ['battery' as JobId, 'lithium_powder' as MaterialId, 'リチウム、ありがとう'],
  ])('%s: 合う材料を届けると仕事が動き、終わって材料が台に戻る', (jobId, materialId, thanks) => {
    const scenario = ({ wiring: 'copper_called', flare: 'flare_called', battery: 'battery_called' } as const)[
      jobId
    ] as ScenarioName;
    const h = makeWorld(scenario);
    deliverTo(h, materialId, jobId);
    expect(h.world.job(jobId).status).toBe('job_running');
    expect(h.world.stateView().phase).toBe('job_running');
    expect(h.world.stateView().input.accepting).toBe(false);
    expect(h.world.stateView().waitingFor).toBe('job_animation');
    // 途中では絵が進んでいる
    h.step(JOB_RUN_MS[jobId] / 2);
    expect(h.world.job(jobId).progress).toBeGreaterThan(0.3);
    expect(h.world.job(jobId).progress).toBeLessThan(0.8);
    h.step(JOB_RUN_MS[jobId] / 2 + 32);
    expect(h.world.job(jobId).status).toBe('done');
    expect(h.world.job(jobId).progress).toBe(1);
    expect(h.world.stateView().materials.find((m) => m.id === materialId)!.at).toBe(`site:${jobId}`);
    expect(h.spoken.filter((s) => s.reason === 'thanks').pop()!.label).toBe(thanks);
    // 片付くと材料は木箱の定位置に戻り、また使える
    h.step(DONE_HOLD_MS + 32);
    expect(h.world.job(jobId).status).toBe('cooldown');
    expect(h.world.stateView().materials.find((m) => m.id === materialId)!.at).toBe('bench');
    const slot = h.world.layout.materialSlots[materialId];
    expect(h.world.material(materialId).x).toBeCloseTo(slot.x, 6);
  });

  it.each([
    ['wiring' as JobId, 'strontium_grains' as MaterialId],
    ['flare' as JobId, 'lithium_powder' as MaterialId],
    ['battery' as JobId, 'copper_scrap' as MaterialId],
  ])('%s: 違う材料を置いても何も動かず、その場に残って拾い直せる', (jobId, materialId) => {
    const scenario = ({ wiring: 'copper_called', flare: 'flare_called', battery: 'battery_called' } as const)[
      jobId
    ] as ScenarioName;
    const h = makeWorld(scenario);
    deliverTo(h, materialId, jobId);
    expect(h.world.job(jobId).status).toBe('called');
    expect(h.world.job(jobId).progress).toBe(0);
    expect(h.world.stateView().materials.find((m) => m.id === materialId)!.at).toBe(`site:${jobId}`);
    // 届け先で受けた不一致の理由がログに残る
    const mismatch = h.log.tail().filter((e) => e.msg === 'mismatch').pop()!;
    expect(mismatch.data).toMatchObject({ job: jobId, reason: 'element_mismatch' });
    // 拾い直せる
    const m = h.world.material(materialId);
    h.world.pointerDown(m.x, m.y);
    expect(h.world.stateView().held?.id).toBe(materialId);
  });

  it('呼ばれていない受け口に置いても動かない', () => {
    const h = makeWorld('copper_called');
    deliverTo(h, 'strontium_grains', 'flare');
    expect(h.world.job('flare').status).toBe('waiting');
    const mismatch = h.log.tail().filter((e) => e.msg === 'mismatch').pop()!;
    expect(mismatch.data).toMatchObject({ job: 'flare', reason: 'job_not_called' });
  });
});

describe('World: 炎と余熱', () => {
  it('炎に触れている間だけ炎が元素色になる', () => {
    for (const [scenario, materialId, element] of [
      ['copper_called', 'copper_scrap', 'copper'],
      ['flare_called', 'strontium_grains', 'strontium'],
      ['battery_called', 'lithium_powder', 'lithium'],
    ] as const) {
      const h = makeWorld(scenario);
      const m = h.world.material(materialId);
      h.world.pointerDown(m.x, m.y);
      expect(h.world.stateView().flame.element).toBeNull();
      const f = flamePoint(h.world);
      h.world.pointerMove(f.x, f.y);
      expect(h.world.stateView().flame.element).toBe(element);
      expect(h.world.stateView().flame.intensityPct).toBeGreaterThan(100);
      h.world.pointerMove(f.x, f.y - h.world.layout.flame.h * 2);
      expect(h.world.stateView().flame.element).toBeNull();
    }
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
});

describe('World: ログと再現', () => {
  it('ログに 入力 → 炎入り → 炎出 → 届け → 成功 の順が残る', () => {
    const h = makeWorld('flare_called');
    deliverTo(h, 'strontium_grains', 'flare');
    const keys = h.log.tail().map((e) => `${e.kind}:${e.msg}`);
    const want = ['input:down', 'flame:enter', 'flame:exit', 'input:up', 'deliver:success'];
    let i = 0;
    for (const k of keys) if (k === want[i]) i++;
    expect(i, keys.join(' > ')).toBe(want.length);
    expect(h.spoken.filter((s) => s.reason === 'thanks')).toHaveLength(1);
  });

  it('同じ入力列は同じ結果になる（再現）', () => {
    const run = (): string => {
      const h = makeWorld('battery_called');
      deliverTo(h, 'lithium_powder', 'battery');
      h.step(JOB_RUN_MS.battery + 32);
      return JSON.stringify({
        state: h.world.stateView(),
        log: h.log.tail().map((e) => `${e.t}|${e.kind}:${e.msg}`),
        spoken: h.spoken,
      });
    };
    expect(run()).toBe(run());
  });

  it('仕事が動いている間は新しい入力を受けない', () => {
    const h = makeWorld('copper_called');
    deliverTo(h, 'copper_scrap', 'wiring');
    const m = h.world.material('strontium_grains');
    h.world.pointerDown(m.x, m.y);
    expect(h.world.stateView().held).toBeNull();
    expect(h.world.stateView().input.rejectReason).toBe('job_animation');
  });

  it('縦横は同じ世界の置き直しで、材料も仕事も保たれる', () => {
    const h = makeWorld('copper_called');
    expect(h.world.layout.orientation).toBe('portrait');
    deliverTo(h, 'copper_scrap', 'wiring');
    h.step(JOB_RUN_MS.wiring + 32);
    const before = h.world.stateView();
    h.world.setLayout(computeLayout(844, 390));
    const after = h.world.stateView();
    expect(h.world.layout.orientation).toBe('landscape');
    expect(after).toEqual(before);
    const m = h.world.material('copper_scrap');
    expect(Math.hypot(m.x - h.world.layout.wireGap.x, m.y - h.world.layout.wireGap.y)).toBeLessThan(
      h.world.layout.touchRadius * 2,
    );
  });
});

describe('World: 困りの循環', () => {
  it('bench_idle は困りなし・炎は青・全材料が台', () => {
    const h = makeWorld('bench_idle');
    h.step(120000);
    const s = h.world.stateView();
    expect(s.jobs.every((j) => j.status === 'waiting')).toBe(true);
    expect(s.flame.element).toBeNull();
    expect(s.materials.every((m) => m.at === 'bench')).toBe(true);
    expect(h.spoken).toHaveLength(0);
  });

  it('two_reds_on_bench は困りなしで、赤2種が台の中央に並ぶ', () => {
    const h = makeWorld('two_reds_on_bench');
    h.step(60000);
    expect(h.spoken).toHaveLength(0);
    const sr = h.world.materialOfElement('strontium');
    const li = h.world.materialOfElement('lithium');
    const b = h.world.layout.bench;
    expect(sr.y).toBeCloseTo(li.y, 6);
    expect(sr.x).toBeGreaterThan(b.x + b.w * 0.5);
    expect(li.x).toBeGreaterThan(sr.x);
    expect(li.x - sr.x).toBeLessThan(b.w * 0.25);
  });

  it('直すと別の困りが起き、3 種すべてが数分以内に一巡する', () => {
    const h = makeWorld('copper_called');
    const doneJobs = new Set<JobId>();
    for (let i = 0; i < 12 && doneJobs.size < 3; i++) {
      const called = h.world.jobs.find((j) => j.status === 'called');
      if (!called) {
        h.step(1000);
        expect(h.world.troubleCount).toBeGreaterThanOrEqual(1);
        continue;
      }
      deliverTo(h, MATERIAL_OF[called.id], called.id);
      h.step(JOB_RUN_MS[called.id] + 32);
      expect(h.world.job(called.id).status).toBe('done');
      doneJobs.add(called.id);
      h.step(DONE_HOLD_MS + 1000);
      expect(h.world.troubleCount).toBeGreaterThanOrEqual(1);
      expect(h.world.troubleCount).toBeLessThanOrEqual(MAX_TROUBLES);
    }
    expect([...doneJobs].sort()).toEqual(['battery', 'flare', 'wiring']);
    // 数分以内
    expect(h.world.timeMs).toBeLessThan(180000);
  });

  it('困りは常に 1〜2 箇所で、同時に 3 箇所にはならない', () => {
    const h = makeWorld('copper_called');
    for (let i = 0; i < 200; i++) {
      h.step(1000);
      expect(h.world.troubleCount).toBeGreaterThanOrEqual(1);
      expect(h.world.troubleCount).toBeLessThanOrEqual(MAX_TROUBLES);
    }
  });

  it('困りの順は seed で固定される', () => {
    const order = (): string[] => {
      const h = makeWorld('copper_called');
      for (let i = 0; i < 8; i++) {
        const called = h.world.jobs.find((j) => j.status === 'called');
        if (called) {
          deliverTo(h, MATERIAL_OF[called.id], called.id);
          h.step(JOB_RUN_MS[called.id] + 32);
        }
        h.step(DONE_HOLD_MS + 2000);
      }
      return h.log
        .tail()
        .filter((e) => e.msg === 'trouble')
        .map((e) => String(e.data?.job));
    };
    const a = order();
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(order()).toEqual(a);
  });
});

describe('World: wrong_delivery', () => {
  it('リチウムを配線に置いても動かず、拾い直して銅を届けられる', () => {
    const h = makeWorld('wrong_delivery');
    expect(h.world.job('wiring').status).toBe('called');
    expect(h.world.stateView().held?.id).toBe('lithium_powder');
    expect(h.world.stateView().phase).toBe('delivering');

    // 通常の入力経路で、配線の上で指を離す
    const gap = h.world.layout.wireGap;
    h.world.pointerMove(gap.x, gap.y);
    h.world.pointerUp(gap.x, gap.y);
    expect(h.world.job('wiring').status).toBe('called');
    const mismatch = h.log.tail().filter((e) => e.msg === 'mismatch').pop()!;
    expect(mismatch.data).toMatchObject({
      job: 'wiring',
      material: 'lithium_powder',
      reason: 'element_mismatch',
      want: 'copper',
      got: 'lithium',
    });
    expect(h.world.stateView().materials.find((m) => m.id === 'lithium_powder')!.at).toBe('site:wiring');

    // 拾い直して台へ戻す
    h.step(32);
    const li = h.world.material('lithium_powder');
    h.world.pointerDown(li.x, li.y);
    expect(h.world.stateView().held?.id).toBe('lithium_powder');
    const free = { x: h.world.layout.bench.x + h.world.layout.bench.w * 0.7, y: h.world.layout.bench.y + h.world.layout.bench.h * 0.75 };
    h.world.pointerMove(free.x, free.y);
    h.world.pointerUp(free.x, free.y);
    expect(h.world.stateView().materials.find((m) => m.id === 'lithium_powder')!.at).toBe('bench');

    // 正しい材料を届ければ動く
    deliverTo(h, 'copper_scrap', 'wiring');
    expect(h.world.job('wiring').status).toBe('job_running');
    h.step(JOB_RUN_MS.wiring + 32);
    expect(h.world.job('wiring').status).toBe('done');
  });
});
