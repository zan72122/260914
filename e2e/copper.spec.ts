import { expect, test } from '@playwright/test';
import { expectDeliveryLogOrder, openWorld, playDelivery, type DeliveryOptions } from './scene';
import { JOB_RUN_MS } from '../src/game/world';

const COPPER: DeliveryOptions = {
  tag: 'copper-run1',
  scenario: 'copper_called',
  jobId: 'wiring',
  element: 'copper',
  materialKey: 'copper_scrap',
  siteKey: 'wireGap',
  runMs: JOB_RUN_MS.wiring,
  // 消えていた作業灯
  watch: (p, u) => ({ x: p.workLamp.x - u * 2.2, y: p.workLamp.y - u * 1.0, width: u * 4.4, height: u * 4.0 }),
};

test.describe('copper_called の通し実証', () => {
  test('銅を炎で見抜いて配線に届けると、灯が点く', async ({ page }) => {
    await openWorld(page);

    const run1 = await playDelivery(page, COPPER);
    expectDeliveryLogOrder(run1.logKeys);
    expect(run1.spoken.map((s) => s.label)).toContain('銅〜');
    expect(run1.spoken.filter((s) => s.reason === 'thanks').map((s) => s.label)).toEqual(['銅、ありがとう']);
    expect(run1.spoken.filter((s) => s.reason === 'thanks')[0].text).toBe('どう、ありがとう');

    // 作業灯の領域が明るくなった
    expect(
      run1.watchAfter.luma,
      `作業灯 luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)}`,
    ).toBeGreaterThan(run1.watchBefore.luma * 1.5);

    // 同じ入力列で再実行し、同じ結果になる
    const run2 = await playDelivery(page, { ...COPPER, tag: 'copper-run2' });
    expect(run2.stateDone).toEqual(run1.stateDone);
    expect(run2.logKeys).toEqual(run1.logKeys);
    expect(run2.spoken).toEqual(run1.spoken);
    expect(Math.abs(run2.flame.hue! - run1.flame.hue!)).toBeLessThan(2);
    expect(Math.abs(run2.flame.value - run1.flame.value)).toBeLessThan(0.02);
    expect(Math.abs(run2.watchAfter.luma - run1.watchAfter.luma)).toBeLessThan(0.02);

    console.log(
      `copper: idle flame hue=${run1.idleFlame.hue!.toFixed(1)}° value=${run1.idleFlame.value.toFixed(3)} / ` +
        `flame hue=${run1.flame.hue!.toFixed(1)}° value=${run1.flame.value.toFixed(3)} (run2 ${run2.flame.hue!.toFixed(1)}°) / ` +
        `lamp luma ${run1.watchBefore.luma.toFixed(4)} -> ${run1.watchAfter.luma.toFixed(4)}`,
    );
  });
});
