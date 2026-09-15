import { expect, test } from '@playwright/test';
import { around, job, measure, openWorld, state, step, STEP_MS } from './scene';
import { Finger } from './helpers';
import { JOB_RUN_MS } from '../src/game/world';

test.describe('wrong_delivery', () => {
  test('リチウムを配線に置いても何も動かず、拾い直して銅を届けられる', async ({ page }) => {
    await openWorld(page);
    await page.evaluate(() => window.__fire.loadScenario('wrong_delivery'));
    expect(await page.evaluate(() => window.__fire.ready())).toBe('ready');
    await step(page, STEP_MS);

    const s0 = await state(page);
    expect(job(s0, 'wiring').status).toBe('called');
    expect(s0.held?.id).toBe('lithium_powder');
    expect(s0.phase).toBe('delivering');

    const points = await page.evaluate(() => window.__fire.points());
    const u: number = (await page.evaluate(() => window.__fire.dump('layout'))).unit;
    const gapRect = around(points.wireGap, u * 4, u * 3);
    const lampRect = {
      x: points.workLamp.x - u * 2.2,
      y: points.workLamp.y - u * 1.0,
      width: u * 4.4,
      height: u * 4.0,
    };
    const before = await measure(page, gapRect, 'wrong-gap-before.png');
    const lampBefore = await measure(page, lampRect, 'wrong-lamp-before.png');

    // 実タッチで、配線の上に持っていって離す
    const finger = await Finger.create(page);
    await finger.down(points.lithium_powder.x, points.lithium_powder.y);
    await step(page, STEP_MS);
    await finger.move(points.wireGap.x, points.wireGap.y);
    await step(page, STEP_MS);
    await finger.up();
    await step(page, STEP_MS * 4);

    // 何も動かない。材料はその場に残る。
    const sAfter = await state(page);
    expect(job(sAfter, 'wiring').status).toBe('called');
    expect(sAfter.phase).toBe('idle');
    expect(sAfter.materials.find((m: { id: string }) => m.id === 'lithium_powder').at).toBe('site:wiring');
    expect(await page.evaluate(() => window.__fire.ready())).toBe('ready');

    // 届け先で受けた不一致の理由がログに残る
    const mismatch = await page.evaluate(() =>
      window.__fire.log().filter((e: { msg: string }) => e.msg === 'mismatch').pop(),
    );
    expect(mismatch.data).toMatchObject({
      job: 'wiring',
      material: 'lithium_powder',
      reason: 'element_mismatch',
      want: 'copper',
      got: 'lithium',
    });

    // 絵でも仕事は動いていない。隙間には置いたリチウムが残っているだけ。
    const after = await measure(page, gapRect, 'wrong-gap-after.png');
    // 作業灯は消えたまま（電流が走っていない）
    const lampStill = await measure(page, lampRect, 'wrong-lamp-still.png');
    expect(Math.abs(lampStill.luma - lampBefore.luma)).toBeLessThan(0.02);

    // 拾い直して台へ戻す
    const p2 = await page.evaluate(() => window.__fire.points());
    await finger.down(p2.lithium_powder.x, p2.lithium_powder.y);
    await step(page, STEP_MS);
    expect((await state(page)).held?.id).toBe('lithium_powder');
    await finger.move(p2.benchFree.x, p2.benchFree.y);
    await step(page, STEP_MS);
    await finger.up();
    await step(page, STEP_MS);
    expect((await state(page)).materials.find((m: { id: string }) => m.id === 'lithium_powder').at).toBe('bench');

    // 正しい材料を、本来の入力経路で届ける
    const p3 = await page.evaluate(() => window.__fire.points());
    await finger.down(p3.copper_scrap.x, p3.copper_scrap.y);
    await step(page, STEP_MS);
    for (let i = 1; i <= 6; i++) {
      const k = i / 6;
      await finger.move(
        p3.copper_scrap.x + (p3.flame.x - p3.copper_scrap.x) * k,
        p3.copper_scrap.y + (p3.flame.y - p3.copper_scrap.y) * k,
      );
      await step(page, STEP_MS);
    }
    expect((await state(page)).flame.element).toBe('copper');
    for (let i = 1; i <= 6; i++) {
      const k = i / 6;
      await finger.move(
        p3.flame.x + (p3.wireGap.x - p3.flame.x) * k,
        p3.flame.y + (p3.wireGap.y - p3.flame.y) * k,
      );
      await step(page, STEP_MS);
    }
    await finger.up();
    await step(page, STEP_MS);
    expect(job(await state(page), 'wiring').status).toBe('job_running');
    await step(page, JOB_RUN_MS.wiring + STEP_MS * 4);
    const sDone = await state(page);
    expect(job(sDone, 'wiring').status).toBe('done');

    // 銅なら作業灯が灯る
    const lampAfter = await measure(page, lampRect, 'wrong-lamp-after.png');
    expect(
      lampAfter.luma,
      `作業灯 luma ${lampBefore.luma.toFixed(4)} -> (不一致) ${lampStill.luma.toFixed(4)} -> (銅) ${lampAfter.luma.toFixed(4)}`,
    ).toBeGreaterThan(lampBefore.luma * 1.5);
    console.log(
      `wrong_delivery: gap luma ${before.luma.toFixed(4)} -> (不一致) ${after.luma.toFixed(4)} / ` +
        `lamp luma ${lampBefore.luma.toFixed(4)} -> (不一致) ${lampStill.luma.toFixed(4)} -> (銅) ${lampAfter.luma.toFixed(4)}`,
    );
  });
});
