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
import type { RegionColor } from './helpers';

test.describe('battery_called の通し実証', () => {
  test('リチウムを受け口へ届けると、装置が動いて電池が出て、リモコンのランプが点く', async ({ page }) => {
    await openWorld(page);

    // 受け口のあたりと、リモコンのあたりを、仕事の間ずっと見る
    const outlet: RegionColor[] = [];
    const remote: RegionColor[] = [];
    const base: DeliveryOptions = {
      tag: 'battery-run1',
      scenario: 'battery_called',
      jobId: 'battery',
      element: 'lithium',
      materialKey: 'lithium_powder',
      siteKey: 'batteryFactory',
      runMs: JOB_RUN_MS.battery,
      // 電池室が空で消えているリモコンのランプ
      watch: (p, u) => around(p.remoteLamp, u * 3.5),
      onStep: async (pg, p, u, i) => {
        outlet.push(await measure(pg, around(p.batteryOutlet, u * 2.2, u * 1.6), `battery-outlet-${i}.png`));
        remote.push(await measure(pg, around(p.remoteLamp, u * 3.5), `battery-remote-${i}.png`));
      },
    };

    const run1 = await playDelivery(page, base);
    expectDeliveryLogOrder(run1.logKeys);
    expect(run1.spoken.map((s) => s.label)).toContain('リチウム〜');
    expect(run1.spoken.filter((s) => s.reason === 'thanks').map((s) => s.label)).toEqual([
      'リチウム、ありがとう',
    ]);
    expect(run1.spoken.filter((s) => s.reason === 'thanks')[0].text).toBe('りちうむ、ありがとう');

    expect(outlet).toHaveLength(RUN_SAMPLES);
    // 受け口で装置が動いて電池が出てから、リモコンの側が明るくなる（順序が絵で見える）
    const peak = (a: RegionColor[]): number => a.reduce((b, c, i) => (c.luma > a[b].luma ? i : b), 0);
    const outletPeak = peak(outlet);
    const remotePeak = peak(remote);
    expect(
      outletPeak,
      `受け口の山 ${outletPeak} がリモコンの山 ${remotePeak} より後になっている: ` +
        `outlet=[${outlet.map((r) => r.luma.toFixed(3)).join(',')}] remote=[${remote.map((r) => r.luma.toFixed(3)).join(',')}]`,
    ).toBeLessThan(remotePeak);

    // リモコンのランプが点いた
    expect(
      run1.watchAfter.luma,
      `リモコン luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)}`,
    ).toBeGreaterThan(run1.watchBefore.luma * 1.3);

    const run2 = await playDelivery(page, { ...base, tag: 'battery-run2', onStep: undefined });
    expect(run2.stateDone).toEqual(run1.stateDone);
    expect(run2.logKeys).toEqual(run1.logKeys);
    expect(run2.spoken).toEqual(run1.spoken);
    expect(Math.abs(run2.flame.hue! - run1.flame.hue!)).toBeLessThan(2);
    expect(Math.abs(run2.flame.value - run1.flame.value)).toBeLessThan(0.02);

    console.log(
      `lithium: flame hue=${run1.flame.hue!.toFixed(1)}° value=${run1.flame.value.toFixed(3)} / ` +
        `remote luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)} / ` +
        `outlet peak=${outletPeak} remote peak=${remotePeak}`,
    );
  });
});
