import { expect, test } from '@playwright/test';
import {
  around,
  expectDeliveryLogOrder,
  measure,
  openWorld,
  playDelivery,
  RUN_SAMPLES,
  type DeliveryOptions,
} from './scene';
import { JOB_RUN_MS } from '../src/game/world';
import { ELEMENT_FLAME_COLORS, hueWithin } from '../src/flame/elementColors';
import type { RegionColor } from './helpers';

test.describe('flare_called の通し実証', () => {
  test('ストロンチウムを桟橋の発射台へ届けると、信号炎が上がり沖が赤く照らされ、救助船の光が近づく', async ({
    page,
  }) => {
    await openWorld(page);

    // 沖の海面を仕事の間ずっと見る
    const sea: RegionColor[] = [];
    let seaBefore: RegionColor | null = null;
    const base: DeliveryOptions = {
      tag: 'flare-run1',
      scenario: 'flare_called',
      jobId: 'flare',
      element: 'strontium',
      materialKey: 'strontium_grains',
      siteKey: 'flareLauncher',
      runMs: JOB_RUN_MS.flare,
      // 救助船の光が近づいて止まる場所（はじめは暗い海）
      watch: (p, u) => around(p.rescueLight, u * 2.2),
      onStep: async (pg, p, u, i) => {
        const rect = around(p.ship, u * 7, u * 4);
        if (seaBefore === null) seaBefore = await measure(pg, rect, 'flare-sea-start.png');
        sea.push(await measure(pg, rect, `flare-sea-${i}.png`));
      },
    };

    const run1 = await playDelivery(page, base);
    expectDeliveryLogOrder(run1.logKeys);
    expect(run1.spoken.map((s) => s.label)).toContain('ストロンチウム〜');
    expect(run1.spoken.filter((s) => s.reason === 'thanks').map((s) => s.label)).toEqual([
      'ストロンチウム、ありがとう',
    ]);
    expect(run1.spoken.filter((s) => s.reason === 'thanks')[0].text).toBe('すとろんちうむ、ありがとう');

    // 沖が赤く照らされる（赤は輝度が低いので、赤成分と色相で見る）
    expect(sea).toHaveLength(RUN_SAMPLES);
    const start = sea[0];
    const peakIdx = sea.reduce((b, c, i) => (c.rgbMean[0] > sea[b].rgbMean[0] ? i : b), 0);
    const peak = sea[peakIdx];
    expect(
      peak.rgbMean[0],
      `沖の赤成分 ${start.rgbMean[0].toFixed(1)} -> ${peak.rgbMean[0].toFixed(1)}（山は ${peakIdx} 番目）`,
    ).toBeGreaterThan(start.rgbMean[0] * 1.5);
    expect(peak.hue, '沖に色づいた画素が無い').not.toBeNull();
    expect(
      hueWithin(peak.hue!, ELEMENT_FLAME_COLORS.strontium.hue),
      `照らされた沖の色相 ${peak.hue?.toFixed(1)}° が赤の範囲 ` +
        `${ELEMENT_FLAME_COLORS.strontium.hue.from}–${ELEMENT_FLAME_COLORS.strontium.hue.to}° に入らない`,
    ).toBe(true);
    // 信号炎が上がってから照らされる（打ち上げの後に山が来る）
    expect(peakIdx).toBeGreaterThan(1);

    // 救助船の光が近づいて、暗かった海面が明るくなる
    expect(
      run1.watchAfter.luma,
      `救助船の光 luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)}`,
    ).toBeGreaterThan(run1.watchBefore.luma * 1.5);

    const run2 = await playDelivery(page, { ...base, tag: 'flare-run2', onStep: undefined });
    expect(run2.stateDone).toEqual(run1.stateDone);
    expect(run2.logKeys).toEqual(run1.logKeys);
    expect(run2.spoken).toEqual(run1.spoken);
    expect(Math.abs(run2.flame.hue! - run1.flame.hue!)).toBeLessThan(2);
    expect(Math.abs(run2.flame.value - run1.flame.value)).toBeLessThan(0.02);
    expect(Math.abs(run2.watchAfter.luma - run1.watchAfter.luma)).toBeLessThan(0.02);

    console.log(
      `strontium: flame hue=${run1.flame.hue!.toFixed(1)}° value=${run1.flame.value.toFixed(3)} / ` +
        `sea red ${start.rgbMean[0].toFixed(1)} -> ${peak.rgbMean[0].toFixed(1)} hue=${peak.hue!.toFixed(1)}° (sample ${peakIdx}) / ` +
        `rescue luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)}`,
    );
  });
});
