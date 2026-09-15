import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { analyzePng, Finger, type Rect } from './helpers';
import { BASE_FLAME_COLOR, ELEMENT_FLAME_COLORS, hueWithin } from '../src/flame/elementColors';
import { JOB_RUN_MS } from '../src/game/world';

const ARTIFACTS = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fire = any;
declare global {
  interface Window {
    __fire: Fire;
  }
}

const STEP_MS = 16;

async function step(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.__fire.clock.step(m), ms);
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => window.__fire.state());
}

function job(s: any, element: string): any {
  return s.jobs.find((j: any) => j.element === element);
}

async function shot(page: Page, clip: Rect, name: string): Promise<Buffer> {
  const buf = await page.screenshot({ clip });
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(resolve(ARTIFACTS, name), buf);
  return buf;
}

interface RunResult {
  idleFlameHue: number;
  state: any;
  logKeys: string[];
  spoken: { text: string; label: string; reason: string }[];
  flameHue: number;
  lampLumaBefore: number;
  lampLumaAfter: number;
}

/** PLAN 5.6 の 1〜5 を、本来の入力経路（iPhone の実タッチ）だけで通す。 */
async function runCopperScene(page: Page, tag: string): Promise<RunResult> {
  // 1. シナリオを読み込む
  await page.evaluate(() => window.__fire.loadScenario('copper_called'));
  expect(await page.evaluate(() => window.__fire.ready())).toBe('ready');
  await step(page, STEP_MS);

  // 2. 銅の仕事が呼ばれている
  const s0 = await state(page);
  expect(job(s0, 'copper').status).toBe('called');
  expect(s0.phase).toBe('idle');
  expect(s0.flame.element).toBeNull();

  const points = await page.evaluate(() => window.__fire.points());
  const flameRect: Rect = await page.evaluate(() => window.__fire.flameRect());
  const lampRect: Rect = {
    x: points.workLamp.x - 40,
    y: points.workLamp.y - 10,
    width: 80,
    height: 70,
  };

  // 何も入れていない炎は青いまま（色が出るのは子どもが入れた瞬間）
  const idleFlame = analyzePng(await shot(page, flameRect, `${tag}-flame-idle.png`), 0.6, 0.18);
  expect(idleFlame.hue).not.toBeNull();
  expect(
    hueWithin(idleFlame.hue!, BASE_FLAME_COLOR.hue),
    `材料を入れる前の炎の色相 ${idleFlame.hue?.toFixed(1)}° がガス炎の青の範囲に入らない`,
  ).toBe(true);

  const lampBefore = await shot(page, lampRect, `${tag}-lamp-before.png`);
  const lampLumaBefore = analyzePng(lampBefore).luma;

  const finger = await Finger.create(page);

  // 3. 銅線を押さえ、炎まで引きずる（指は離さない）
  await finger.down(points.copper_scrap.x, points.copper_scrap.y);
  await step(page, STEP_MS);
  expect((await state(page)).held?.id).toBe('copper_scrap');

  const legs = 6;
  for (let i = 1; i <= legs; i++) {
    const k = i / legs;
    await finger.move(
      points.copper_scrap.x + (points.flame.x - points.copper_scrap.x) * k,
      points.copper_scrap.y + (points.flame.y - points.copper_scrap.y) * k,
    );
    await step(page, STEP_MS);
  }
  const sFlame = await state(page);
  expect(sFlame.flame.element).toBe('copper');
  expect(sFlame.held.inFlame).toBe(true);
  // 炎の揺らぎを何刻みか進めてから色を見る
  await step(page, STEP_MS * 8);

  const flameShot = await shot(page, flameRect, `${tag}-flame-copper.png`);
  // 炎そのものの色を見る（明るい画素だけ数え、炎の中の材料の地の色を混ぜない）
  const flameColor = analyzePng(flameShot, 0.6, 0.18);
  expect(flameColor.hue, `炎領域に色づいた画素が無い`).not.toBeNull();
  expect(
    hueWithin(flameColor.hue!, ELEMENT_FLAME_COLORS.copper.hue),
    `炎領域の色相 ${flameColor.hue?.toFixed(1)}° が青緑の範囲 ${ELEMENT_FLAME_COLORS.copper.hue.from}–${ELEMENT_FLAME_COLORS.copper.hue.to}° に入らない`,
  ).toBe(true);
  expect(flameColor.coloredRatio).toBeGreaterThan(0.1);

  // 4. 指を離さず配線の隙間へ運び、そこで離す
  for (let i = 1; i <= legs; i++) {
    const k = i / legs;
    await finger.move(
      points.flame.x + (points.wireGap.x - points.flame.x) * k,
      points.flame.y + (points.wireGap.y - points.flame.y) * k,
    );
    await step(page, STEP_MS);
  }
  const sCarry = await state(page);
  expect(sCarry.phase).toBe('delivering');
  expect(sCarry.flame.element).toBeNull();
  // 運搬中も余熱で色を保っている
  expect(sCarry.held.afterglowMs).toBeGreaterThan(0);

  await finger.up();
  await step(page, STEP_MS);
  const sDeliver = await state(page);
  expect(job(sDeliver, 'copper').status).toBe('job_running');
  expect(sDeliver.waitingFor).toBe('job_animation');
  expect(await page.evaluate(() => window.__fire.ready())).toBe('busy');

  // 仕事が終わるまで時計を進める
  await step(page, JOB_RUN_MS + STEP_MS * 4);
  const sDone = await state(page);
  expect(job(sDone, 'copper').status).toBe('done');
  expect(sDone.phase).toBe('idle');
  expect(sDone.materials.find((m: any) => m.element === 'copper').at).toBe('site:wiring');

  const lampAfter = await shot(page, lampRect, `${tag}-lamp-after.png`);
  const lampLumaAfter = analyzePng(lampAfter).luma;
  await shot(
    page,
    { x: 0, y: 0, width: 390, height: 844 },
    `${tag}-copper_called-success.png`,
  );

  // 5. ログの順序と発話
  const logKeys: string[] = await page.evaluate(() =>
    window.__fire.log().map((e: any) => `${e.kind}:${e.msg}`),
  );
  const spoken = await page.evaluate(() => window.__fire.speech.captured());

  return {
    idleFlameHue: idleFlame.hue!,
    state: sDone,
    logKeys,
    spoken: spoken.map((r: any) => ({ text: r.text, label: r.label, reason: r.reason })),
    flameHue: flameColor.hue!,
    lampLumaBefore,
    lampLumaAfter,
  };
}

test.describe('copper_called の通し実証', () => {
  test('銅を炎で見抜いて配線に届けると、灯が点く', async ({ page }) => {
    await page.goto('/?dev=1');
    await page.waitForFunction(() => window.__fire !== undefined);
    await page.evaluate(() => window.__fire.clock.mode('manual'));
    expect(await page.evaluate(() => window.__fire.clock.mode())).toBe('manual');

    const run1 = await runCopperScene(page, 'run1');

    // ログに 入力 → 炎入り → 炎出 → 届け → 成功 → 発話 の順が残る
    const want = ['input:down', 'flame:enter', 'flame:exit', 'input:up', 'deliver:success', 'job:done'];
    let i = 0;
    for (const k of run1.logKeys) if (k === want[i]) i++;
    expect(i, `log=${run1.logKeys.join(' > ')}`).toBe(want.length);

    expect(run1.spoken.map((s) => s.label)).toEqual(['銅〜', '銅、ありがとう']);
    expect(run1.spoken[1].text).toBe('どう、ありがとう');
    expect(run1.spoken[1].reason).toBe('thanks');

    // 作業灯が明るくなった
    expect(
      run1.lampLumaAfter,
      `lamp luma ${run1.lampLumaBefore.toFixed(4)} -> ${run1.lampLumaAfter.toFixed(4)}`,
    ).toBeGreaterThan(run1.lampLumaBefore * 1.5);

    // 6. 同じ入力列で再実行し、同じ結果になる
    const run2 = await runCopperScene(page, 'run2');
    expect(run2.state).toEqual(run1.state);
    expect(run2.logKeys).toEqual(run1.logKeys);
    expect(run2.spoken).toEqual(run1.spoken);
    expect(Math.abs(run2.flameHue - run1.flameHue)).toBeLessThan(2);
    expect(Math.abs(run2.lampLumaAfter - run1.lampLumaAfter)).toBeLessThan(0.02);

    console.log(
      `idle flame hue: ${run1.idleFlameHue.toFixed(1)}° / ` +
      `flame hue: run1=${run1.flameHue.toFixed(1)}° run2=${run2.flameHue.toFixed(1)}° / ` +
        `lamp luma: ${run1.lampLumaBefore.toFixed(4)} -> ${run1.lampLumaAfter.toFixed(4)}`,
    );
  });
});
