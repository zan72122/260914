import { expect, test } from '@playwright/test';
import { expectDeliveryLogOrder, openWorld, playDelivery, type DeliveryOptions } from './scene';
import { JOB_RUN_MS } from '../src/game/world';

test.describe('横画面（iPad landscape）', () => {
  test('同じ世界の置き直しで、copper_called が同じように通る', async ({ page }) => {
    await openWorld(page);
    const layout = await page.evaluate(() => window.__fire.dump('layout'));
    expect(layout.orientation).toBe('landscape');
    expect(layout.width).toBeGreaterThan(layout.height);
    // 横は左に台、右に工房
    expect(layout.bench.x).toBeLessThan(layout.workshop.x);

    const opts: DeliveryOptions = {
      tag: 'landscape-copper',
      scenario: 'copper_called',
      jobId: 'wiring',
      element: 'copper',
      materialKey: 'copper_scrap',
      siteKey: 'wireGap',
      runMs: JOB_RUN_MS.wiring,
      watch: (p, u) => ({ x: p.workLamp.x - u * 2.2, y: p.workLamp.y - u * 1.0, width: u * 4.4, height: u * 4.0 }),
    };
    const run = await playDelivery(page, opts);
    expectDeliveryLogOrder(run.logKeys);
    expect(run.spoken.filter((s) => s.reason === 'thanks').map((s) => s.label)).toEqual(['銅、ありがとう']);
    expect(
      run.watchAfter.luma,
      `作業灯 luma ${run.watchBefore.luma.toFixed(4)} -> ${run.watchAfter.luma.toFixed(4)}`,
    ).toBeGreaterThan(run.watchBefore.luma * 1.5);
    console.log(
      `landscape copper: flame hue=${run.flame.hue!.toFixed(1)}° value=${run.flame.value.toFixed(3)} / ` +
        `lamp luma ${run.watchBefore.luma.toFixed(4)} -> ${run.watchAfter.luma.toFixed(4)}`,
    );
  });
});
