import { expect, test } from '@playwright/test';
import { Finger } from './helpers';
import { job, openWorld, state, step, STEP_MS } from './scene';
import { JOB_RUN_MS } from '../src/game/world';

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function layout(page: import('@playwright/test').Page): Promise<any> {
  return page.evaluate(() => window.__fire.dump('layout'));
}

async function rotate(
  page: import('@playwright/test').Page,
  size: { width: number; height: number },
  want: 'portrait' | 'landscape',
): Promise<void> {
  await page.setViewportSize(size);
  await page.waitForFunction((o) => window.__fire.dump('layout').orientation === o, want);
}

test.describe('回転・リサイズ', () => {
  test('材料を持ったまま縦→横に変えても、持ったまま届けが成立する', async ({ page }) => {
    await openWorld(page);
    await rotate(page, PORTRAIT, 'portrait');
    await page.evaluate(() => window.__fire.loadScenario('copper_called'));
    await step(page, STEP_MS);
    expect(job(await state(page), 'wiring').status).toBe('called');

    const p0 = await page.evaluate(() => window.__fire.points());
    const finger = await Finger.create(page);

    // 銅線を押さえ、炎まで引きずる（指は離さない）
    await finger.down(p0.copper_scrap.x, p0.copper_scrap.y);
    await step(page, STEP_MS);
    const legs = 6;
    for (let i = 1; i <= legs; i++) {
      const k = i / legs;
      await finger.move(
        p0.copper_scrap.x + (p0.flame.x - p0.copper_scrap.x) * k,
        p0.copper_scrap.y + (p0.flame.y - p0.copper_scrap.y) * k,
      );
      await step(page, STEP_MS);
    }
    const inFlame = await state(page);
    expect(inFlame.held.element).toBe('copper');
    expect(inFlame.flame.element).toBe('copper');

    // 炎から出して運ぶ途中で、縦から横へ回す
    const mid = { x: p0.flame.x, y: p0.flame.y - 120 };
    await finger.move(mid.x, mid.y);
    await step(page, STEP_MS);
    const before = await state(page);
    expect(before.phase).toBe('delivering');
    expect(before.held.afterglowMs).toBeGreaterThan(0);

    await rotate(page, LANDSCAPE, 'landscape');
    expect((await layout(page)).orientation).toBe('landscape');

    // 回したあとも、持っている材料も余熱の色も仕事の進行も失われていない
    const after = await state(page);
    expect(after.held?.id).toBe('copper_scrap');
    expect(after.held.element).toBe('copper');
    expect(after.held.afterglowMs).toBe(before.held.afterglowMs);
    expect(after.phase).toBe('delivering');
    expect(job(after, 'wiring').status).toBe('called');
    expect(after.materials).toEqual(before.materials);

    // 横画面の新しい置き場所へ運んで離す（判定は通常の入力経路を通る）
    const p1 = await page.evaluate(() => window.__fire.points());
    expect(p1.wireGap.x).not.toBeCloseTo(p0.wireGap.x, 0);
    for (let i = 1; i <= legs; i++) {
      const k = i / legs;
      await finger.move(mid.x + (p1.wireGap.x - mid.x) * k, mid.y + (p1.wireGap.y - mid.y) * k);
      await step(page, STEP_MS);
    }
    await finger.up();
    await step(page, STEP_MS);

    const delivered = await state(page);
    expect(job(delivered, 'wiring').status).toBe('job_running');
    await step(page, JOB_RUN_MS.wiring + STEP_MS * 4);
    const done = await state(page);
    expect(job(done, 'wiring').status).toBe('done');
    expect(done.materials.find((m: any) => m.id === 'copper_scrap').at).toBe('site:wiring');

    // 鳴らす予定の音の列（dev では実再生せず記録だけ）
    const audio = await page.evaluate(() => window.__fire.dump('audio'));
    const keys = (audio as any[]).map((r) => `${r.cue}:${r.action}`);
    expect(keys.slice(0, 2)).toEqual(['burner:start', 'waves:start']);
    // 切れた線は呼ばれている間だけ火花を鳴らし、直ったところで止まる
    expect(keys.filter((k) => k.startsWith('sparks'))).toEqual(['sparks:start', 'sparks:stop']);
    // 炎に入った瞬間の音と、炎の音の色が銅に変わったこと
    const enter = (audio as any[]).find((r) => r.cue === 'material_enter');
    expect(enter.data.element).toBe('copper');
    expect((audio as any[]).filter((r) => r.cue === 'burner' && r.action === 'change').map((r) => r.data.element)).toEqual(
      ['copper', null],
    );
    // 銅の仕事の物理音は「電流が走る」で、他の二つは鳴らない
    const played = (audio as any[]).filter((r) => r.action === 'play').map((r) => r.cue);
    expect(played).toContain('current');
    expect(played).not.toContain('flare_launch');
    expect(played).not.toContain('battery_machine');
    // 時刻はすべてゲーム内時計
    expect((audio as any[]).every((r) => typeof r.t === 'number')).toBe(true);
  });

  test('横→縦に戻しても、進行中の仕事は途切れない', async ({ page }) => {
    await openWorld(page);
    await rotate(page, LANDSCAPE, 'landscape');
    await page.evaluate(() => window.__fire.loadScenario('copper_called'));
    await step(page, STEP_MS);

    const p = await page.evaluate(() => window.__fire.points());
    const finger = await Finger.create(page);
    await finger.down(p.copper_scrap.x, p.copper_scrap.y);
    await step(page, STEP_MS);
    await finger.move(p.flame.x, p.flame.y);
    await step(page, STEP_MS * 4);
    await finger.move(p.wireGap.x, p.wireGap.y);
    await step(page, STEP_MS);
    await finger.up();
    await step(page, Math.round(JOB_RUN_MS.wiring / 2));

    const midJob = job(await state(page), 'wiring');
    expect(midJob.status).toBe('job_running');

    await rotate(page, PORTRAIT, 'portrait');
    expect(job(await state(page), 'wiring').status).toBe('job_running');

    await step(page, JOB_RUN_MS.wiring / 2 + STEP_MS * 4);
    expect(job(await state(page), 'wiring').status).toBe('done');

    // 縦に戻した木箱の定位置へ材料が返る
    await step(page, 3200);
    const pos = await page.evaluate(() => window.__fire.dump('materials'));
    const l = await page.evaluate(() => window.__fire.dump('layout'));
    expect(l.orientation).toBe('portrait');
    const copper = (pos as any[]).find((m) => m.id === 'copper_scrap');
    expect(copper.at).toBe('bench');
    expect(copper.y).toBeGreaterThan(l.bench.y);
  });

  test('高さだけ変わっても（Safari のバーの出入り）世界は作り直されない', async ({ page }) => {
    await openWorld(page);
    await rotate(page, PORTRAIT, 'portrait');
    await page.evaluate(() => window.__fire.loadScenario('battery_called'));
    await step(page, 480);
    const before = await state(page);
    const logBefore = await page.evaluate(() => window.__fire.log().length);

    await page.setViewportSize({ width: 390, height: 790 });
    await page.waitForFunction(() => window.__fire.dump('layout').height === 790);

    expect(await state(page)).toEqual(before);
    // 読み直しは起きていない（ログが増えも減りもしない）
    expect(await page.evaluate(() => window.__fire.log().length)).toBe(logBefore);
  });
});
