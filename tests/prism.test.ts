import { describe, expect, it } from 'vitest';
import { EventLog } from '../src/core/EventLog';
import { Rng } from '../src/core/Rng';
import { computeLayout, type MaterialId } from '../src/game/layout';
import { World, type SpeechRequest } from '../src/game/world';
import { SCENARIOS, type ScenarioName } from '../src/scenarios/scenarios';
import {
  ATOMIC_WIDTH_NM,
  MOLECULAR_WIDTH_NM,
  SPECTRUM_MAX_NM,
  SPECTRUM_MIN_NM,
  bandWidthNm,
  spectrumBands,
  spectrumNm,
  spectrumU,
} from '../src/flame/prism';
import { BASE_GAS_FLAME_LINES, getSpectrum } from '../src/flame/spectra';
import { ELEMENT_IDS } from '../src/flame/elements';

interface Harness {
  world: World;
  log: EventLog;
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
  return { world, log, step };
}

/** 本来の入力経路だけで、材料を金属の輪へ置く一筆書き。 */
function placeOnRing(h: Harness, id: MaterialId): void {
  const m = h.world.material(id);
  const ring = h.world.layout.ring;
  h.world.pointerDown(m.x, m.y);
  const from = { x: m.x, y: m.y };
  for (let i = 1; i <= 6; i++) {
    h.world.pointerMove(
      from.x + (ring.x - from.x) * (i / 6),
      from.y + (ring.y - from.y) * (i / 6),
    );
    h.step(16);
  }
  h.world.pointerUp(ring.x, ring.y);
  h.step(16);
}

describe('縞のデータ（spectra.ts との一致）', () => {
  it('波長 → 波長軸の写像は端点で 0 と 1 になり、単調で、逆写像と往復する', () => {
    expect(spectrumU(SPECTRUM_MIN_NM)).toBeCloseTo(0, 12);
    expect(spectrumU(SPECTRUM_MAX_NM)).toBeCloseTo(1, 12);
    let prev = -Infinity;
    for (let nm = SPECTRUM_MIN_NM; nm <= SPECTRUM_MAX_NM; nm += 7) {
      const u = spectrumU(nm);
      expect(u).toBeGreaterThan(prev);
      expect(spectrumNm(u)).toBeCloseTo(nm, 10);
      prev = u;
    }
  });

  it('帯の幅は発光の起源で決まる（分子バンドは原子線より太い）', () => {
    expect(bandWidthNm('atomic')).toBe(ATOMIC_WIDTH_NM);
    expect(bandWidthNm('molecular')).toBe(MOLECULAR_WIDTH_NM);
    expect(MOLECULAR_WIDTH_NM).toBeGreaterThan(ATOMIC_WIDTH_NM);
  });

  it.each([...ELEMENT_IDS])('%s: 帯の波長・幅・起源が spectra.ts の発光線と一致する', (id) => {
    const lines = getSpectrum(id).lines.filter(
      (l) => l.wavelengthNm >= SPECTRUM_MIN_NM && l.wavelengthNm <= SPECTRUM_MAX_NM,
    );
    const bands = spectrumBands(id);
    // 可視域の線のうち、暗すぎて描かれないものだけが落ちる
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.length).toBeLessThanOrEqual(lines.length);
    for (const b of bands) {
      const line = lines.find((l) => l.wavelengthNm === b.wavelengthNm);
      expect(line, `${b.wavelengthNm}nm の帯に対応する発光線が spectra.ts に無い`).toBeDefined();
      expect(b.kind).toBe(line!.kind);
      expect(b.species).toBe(line!.species);
      expect(b.widthNm).toBe(bandWidthNm(line!.kind));
      expect(b.u).toBeCloseTo(spectrumU(line!.wavelengthNm), 12);
      expect(b.uWidth).toBeCloseTo(b.widthNm / (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM), 12);
    }
  });

  it('可視域の外の線は映らない（Cu I 324.8 / 327.4 nm の紫外線）', () => {
    const cu = spectrumBands('copper');
    expect(getSpectrum('copper').lines.some((l) => l.wavelengthNm < SPECTRUM_MIN_NM)).toBe(true);
    for (const b of cu) {
      expect(b.wavelengthNm).toBeGreaterThanOrEqual(SPECTRUM_MIN_NM);
      expect(b.wavelengthNm).toBeLessThanOrEqual(SPECTRUM_MAX_NM);
    }
  });

  it('素の炎（元素なし）はガス炎の発光線を映す', () => {
    const base = spectrumBands(null);
    expect(base.length).toBeGreaterThan(0);
    for (const b of base) {
      expect(BASE_GAS_FLAME_LINES.some((l) => l.wavelengthNm === b.wavelengthNm)).toBe(true);
    }
    // C2 Swan と CH*。青〜青緑に寄る
    expect(base.every((b) => b.kind === 'molecular')).toBe(true);
  });

  it('リチウムは赤の一本が最も明るく、青の線は暗すぎて映らない', () => {
    const li = spectrumBands('lithium');
    const brightest = li.reduce((a, b) => (b.level > a.level ? b : a));
    expect(brightest.wavelengthNm).toBeCloseTo(670.784, 3);
    expect(brightest.level).toBe(1);
    // 460.29 nm は spectra.ts にあるが、炎温度では励起されずほぼ光らない
    expect(getSpectrum('lithium').lines.some((l) => l.wavelengthNm < 500)).toBe(true);
    expect(li.some((b) => b.wavelengthNm < 500)).toBe(false);
  });

  it('ストロンチウムは赤〜橙の複数の帯と、弱いが映る青の線を持つ', () => {
    const sr = spectrumBands('strontium');
    const blue = sr.filter((b) => b.wavelengthNm < 500);
    expect(blue.length).toBe(1);
    expect(blue[0].wavelengthNm).toBeCloseTo(460.733, 3);
    // 弱い。赤〜橙の最も明るい帯よりはるかに暗い
    expect(blue[0].level).toBeGreaterThan(0);
    expect(blue[0].level).toBeLessThan(0.05);
    const red = sr.filter((b) => b.wavelengthNm >= 590);
    expect(red.length).toBeGreaterThanOrEqual(4);
    expect(red.some((b) => b.level === 1)).toBe(true);
  });

  it('銅は緑〜青緑側に複数の帯を持つ', () => {
    const cu = spectrumBands('copper');
    const green = cu.filter((b) => b.wavelengthNm >= 500 && b.wavelengthNm <= 560);
    expect(green.length).toBeGreaterThanOrEqual(4);
    expect(green.some((b) => b.level === 1)).toBe(true);
    // 赤い帯は持たない（銅の炎が赤く見えないことに対応）
    expect(cu.some((b) => b.wavelengthNm >= 600 && b.level > 0.3)).toBe(false);
  });

  it('赤2種は縞の形で決定的に見分けられる（同じ色相でも並びが違う）', () => {
    const sr = spectrumBands('strontium');
    const li = spectrumBands('lithium');
    // Sr は青の線を持ち、Li は持たない
    expect(sr.some((b) => b.wavelengthNm < 500)).toBe(true);
    expect(li.some((b) => b.wavelengthNm < 500)).toBe(false);
    // Sr の赤は分子バンド（太い）、Li の赤は原子線（細い）
    const srRed = sr.filter((b) => b.wavelengthNm >= 590 && b.level > 0.25);
    const liRed = li.filter((b) => b.wavelengthNm >= 590 && b.level > 0.25);
    expect(srRed.every((b) => b.kind === 'molecular')).toBe(true);
    expect(liRed.every((b) => b.kind === 'atomic')).toBe(true);
    expect(srRed.length).toBeGreaterThan(liRed.length);
  });

  it('同じ元素を何度呼んでも同じ帯が返る（純関数）', () => {
    const a = spectrumBands('strontium');
    const b = spectrumBands('strontium');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('金属の輪（材料を置いたままにする）', () => {
  it('輪の上で離すと材料はそこに残り、炎はその色を保つ', () => {
    const h = makeWorld('two_reds_on_bench');
    expect(h.world.flameElement).toBeNull();
    placeOnRing(h, 'strontium_grains');
    expect(h.world.material('strontium_grains').at).toBe('ring');
    expect(h.world.flameElement).toBe('strontium');
    // 指を離しても色は続く（余熱ではなく、炎そのものの色）
    h.step(5000);
    expect(h.world.flameElement).toBe('strontium');
    expect(h.world.stateView().flame.element).toBe('strontium');
    expect(h.world.stateView().held).toBeNull();
  });

  it('輪から拾えば炎は素の色に戻る', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'strontium_grains');
    const ring = h.world.layout.ring;
    h.world.pointerDown(ring.x, ring.y);
    expect(h.world.stateView().held?.id).toBe('strontium_grains');
    // 炎の外へ運ぶ
    const bench = h.world.layout.bench;
    h.world.pointerMove(bench.x + bench.w * 0.75, bench.y + bench.h * 0.8);
    h.step(16);
    expect(h.world.flameElement).toBeNull();
    h.world.pointerUp(bench.x + bench.w * 0.75, bench.y + bench.h * 0.8);
    expect(h.world.material('strontium_grains').at).toBe('bench');
    expect(h.world.flameElement).toBeNull();
  });

  it('輪に置けるのは 1 つ。2 個目はその場に落ちて拾い直せる', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'strontium_grains');
    placeOnRing(h, 'lithium_powder');
    expect(h.world.material('strontium_grains').at).toBe('ring');
    expect(h.world.material('lithium_powder').at).toBe('bench');
    expect(h.world.ringMaterial()?.id).toBe('strontium_grains');
    // 炎は先に置いた方の色のまま
    expect(h.world.flameElement).toBe('strontium');
    // 落ちた方は拾い直せる
    const li = h.world.material('lithium_powder');
    h.world.pointerDown(li.x, li.y);
    expect(h.world.stateView().held?.id).toBe('lithium_powder');
  });

  it('手に持って炎に入れている材料の色が、輪の材料より優先される', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'lithium_powder');
    expect(h.world.flameElement).toBe('lithium');
    const cu = h.world.material('copper_scrap');
    h.world.pointerDown(cu.x, cu.y);
    const f = h.world.layout.flame;
    h.world.pointerMove(f.x, f.y - f.h * 0.75);
    h.step(16);
    expect(h.world.flameElement).toBe('copper');
    // 炎から出せば、輪の材料の色へ戻る
    h.world.pointerMove(f.x, f.y + f.h * 0.9);
    h.step(16);
    expect(h.world.flameElement).toBe('lithium');
  });

  it('輪に置いても届け先の判定と困りの循環は変わらない', () => {
    const h = makeWorld('flare_called');
    expect(h.world.job('flare').status).toBe('called');
    placeOnRing(h, 'strontium_grains');
    h.step(3000);
    // 置いただけでは仕事は動かない
    expect(h.world.job('flare').status).toBe('called');
    // 拾い直して受け口へ届ければ、いつもどおり動く
    const ring = h.world.layout.ring;
    h.world.pointerDown(ring.x, ring.y);
    const site = World.siteOf(h.world.layout, 'flare');
    for (let i = 1; i <= 6; i++) {
      h.world.pointerMove(
        ring.x + (site.x - ring.x) * (i / 6),
        ring.y + (site.y - ring.y) * (i / 6),
      );
      h.step(16);
    }
    h.world.pointerUp(site.x, site.y);
    expect(h.world.job('flare').status).toBe('job_running');
    expect(h.world.flameElement).toBeNull();
  });

  it('画面を回しても、輪に置いた材料は輪の上に残る', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'strontium_grains');
    h.world.setLayout(computeLayout(844, 390));
    const m = h.world.material('strontium_grains');
    expect(m.at).toBe('ring');
    expect(m.x).toBeCloseTo(h.world.layout.ring.x, 6);
    expect(m.y).toBeCloseTo(h.world.layout.ring.y, 6);
    expect(h.world.flameElement).toBe('strontium');
  });
});

describe('プリズム', () => {
  it('台から拾って炎の前へ持っていくと、いまの炎の色の縞を映す', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'strontium_grains');
    expect(h.world.stateView().prism).toEqual({ at: 'bench', projecting: null });

    const p = h.world.prismPos;
    h.world.pointerDown(p.x, p.y);
    expect(h.world.stateView().prism.at).toBe('held');
    const f = h.world.layout.flame;
    h.world.pointerMove(f.x, f.y - f.h * 0.4);
    h.step(16);
    expect(h.world.prismInFrontOfFlame()).toBe(true);
    expect(h.world.stateView().prism).toEqual({ at: 'held', projecting: 'strontium' });
  });

  it('炎の前から外れれば映らない', () => {
    const h = makeWorld('two_reds_on_bench');
    placeOnRing(h, 'strontium_grains');
    const p = h.world.prismPos;
    h.world.pointerDown(p.x, p.y);
    const bench = h.world.layout.bench;
    h.world.pointerMove(bench.x + bench.w * 0.92, bench.y + bench.h * 0.9);
    h.step(16);
    expect(h.world.stateView().prism.projecting).toBeNull();
  });

  it('離せば台に戻る', () => {
    const h = makeWorld('two_reds_on_bench');
    const p = { ...h.world.layout.prism };
    h.world.pointerDown(p.x, p.y);
    const f = h.world.layout.flame;
    h.world.pointerMove(f.x, f.y - f.h * 0.4);
    h.step(16);
    h.world.pointerUp(f.x, f.y - f.h * 0.4);
    expect(h.world.stateView().prism).toEqual({ at: 'bench', projecting: null });
    expect(h.world.prismPos.x).toBeCloseTo(p.x, 6);
    expect(h.world.prismPos.y).toBeCloseTo(p.y, 6);
  });

  it('素の炎の前ではガス炎の帯を映す', () => {
    const h = makeWorld('two_reds_on_bench');
    const p = h.world.prismPos;
    h.world.pointerDown(p.x, p.y);
    const f = h.world.layout.flame;
    h.world.pointerMove(f.x, f.y - f.h * 0.4);
    h.step(16);
    expect(h.world.prismInFrontOfFlame()).toBe(true);
    // projecting は「元素」なので素の炎では null。映る帯は BASE_GAS_FLAME_LINES
    expect(h.world.stateView().prism.projecting).toBeNull();
    expect(spectrumBands(h.world.flameElement).length).toBe(spectrumBands(null).length);
  });

  it('余熱の色は映さない（炎に入っていない材料の色は縞にならない）', () => {
    const h = makeWorld('two_reds_on_bench');
    // 炎に入れてから外へ出す → 余熱は残るが炎は素の色
    const m = h.world.material('strontium_grains');
    h.world.pointerDown(m.x, m.y);
    const f = h.world.layout.flame;
    h.world.pointerMove(f.x, f.y - f.h * 0.5);
    h.step(16);
    expect(h.world.flameElement).toBe('strontium');
    const bench = h.world.layout.bench;
    h.world.pointerMove(bench.x + bench.w * 0.75, bench.y + bench.h * 0.85);
    h.step(16);
    h.world.pointerUp(bench.x + bench.w * 0.75, bench.y + bench.h * 0.85);
    expect(h.world.stateView().materials.find((x) => x.id === 'strontium_grains')!.at).toBe('bench');
    expect(h.world.flameElement).toBeNull();

    const p = h.world.prismPos;
    h.world.pointerDown(p.x, p.y);
    h.world.pointerMove(f.x, f.y - f.h * 0.4);
    h.step(16);
    expect(h.world.stateView().prism.projecting).toBeNull();
  });

  it('材料を持っている間はプリズムを持てない（一本指）', () => {
    const h = makeWorld('two_reds_on_bench');
    const m = h.world.material('strontium_grains');
    h.world.pointerDown(m.x, m.y);
    const p = h.world.prismPos;
    h.world.pointerMove(p.x, p.y);
    h.step(16);
    expect(h.world.stateView().prism.at).toBe('bench');
    expect(h.world.stateView().held?.id).toBe('strontium_grains');
  });
});
