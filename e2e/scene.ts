import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { analyzePng, Finger, type Rect, type RegionColor } from './helpers';
import {
  BASE_FLAME_COLOR,
  ELEMENT_FLAME_COLORS,
  flameColorMatches,
} from '../src/flame/elementColors';
import type { ElementId } from '../src/flame/elements';

export const ARTIFACTS = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts');

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __fire: any;
  }
}

export const STEP_MS = 16;

export async function step(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.__fire.clock.step(m), ms);
}

export async function state(page: Page): Promise<any> {
  return page.evaluate(() => window.__fire.state());
}

export function job(s: any, id: string): any {
  return s.jobs.find((j: any) => j.id === id);
}

export async function shot(page: Page, clip: Rect, name: string): Promise<Buffer> {
  const buf = await page.screenshot({ clip });
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(resolve(ARTIFACTS, name), buf);
  return buf;
}

export async function measure(page: Page, clip: Rect, name: string, minValue = 0.2): Promise<RegionColor> {
  return analyzePng(await shot(page, clip, name), minValue);
}

export function around(p: { x: number; y: number }, w: number, h = w): Rect {
  return { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h };
}

/** 開発サーバを開き、時計を manual にする。 */
export async function openWorld(page: Page): Promise<void> {
  await page.goto('/?dev=1');
  await page.waitForFunction(() => window.__fire !== undefined);
  await page.evaluate(() => window.__fire.clock.mode('manual'));
  expect(await page.evaluate(() => window.__fire.clock.mode())).toBe('manual');
}

export interface DeliveryOptions {
  tag: string;
  scenario: string;
  jobId: string;
  element: ElementId;
  /** points() の材料の名前 */
  materialKey: string;
  /** points() の受け口の名前 */
  siteKey: string;
  /** 仕事が動く時間（ms） */
  runMs: number;
  /** 仕事の結果が見える領域 */
  watch: (points: Record<string, { x: number; y: number }>, u: number) => Rect;
  /** 仕事が動いている間、刻みごとに呼ばれる（絵の順序を見るため） */
  onStep?: (
    page: Page,
    points: Record<string, { x: number; y: number }>,
    u: number,
    index: number,
  ) => Promise<void>;
}

/** 仕事が動いている間に絵を見る刻みの数。 */
export const RUN_SAMPLES = 12;

export interface DeliveryResult {
  idleFlame: RegionColor;
  flame: RegionColor;
  watchBefore: RegionColor;
  watchAfter: RegionColor;
  stateDone: any;
  logKeys: string[];
  spoken: { text: string; label: string; reason: string }[];
}

/**
 * PLAN 5.6 と同じ構成を、材料と受け口を替えて通す。
 * 操作はすべて実タッチ（CDP の touchStart/Move/End）で、状態の直接代入はしない。
 */
export async function playDelivery(page: Page, o: DeliveryOptions): Promise<DeliveryResult> {
  // 1. シナリオを読み込む
  await page.evaluate((s) => window.__fire.loadScenario(s), o.scenario);
  expect(await page.evaluate(() => window.__fire.ready())).toBe('ready');
  await step(page, STEP_MS);

  // 2. その仕事が呼ばれている
  const s0 = await state(page);
  expect(job(s0, o.jobId).status).toBe('called');
  expect(s0.flame.element).toBeNull();

  const points = await page.evaluate(() => window.__fire.points());
  const flameRect: Rect = await page.evaluate(() => window.__fire.flameRect());
  const u: number = (await page.evaluate(() => window.__fire.dump('layout'))).unit;

  // 何も入れていない炎は青いまま（色が出るのは子どもが入れた瞬間）
  const idleFlame = await measure(page, flameRect, `${o.tag}-flame-idle.png`);
  expect(idleFlame.hue).not.toBeNull();
  expect(
    flameColorMatches(idleFlame.hue!, idleFlame.value, BASE_FLAME_COLOR),
    `材料を入れる前の炎 hue=${idleFlame.hue?.toFixed(1)}° value=${idleFlame.value.toFixed(3)} がガス炎の青の領域に入らない`,
  ).toBe(true);

  const watchRect = o.watch(points, u);
  const watchBefore = await measure(page, watchRect, `${o.tag}-watch-before.png`);

  const finger = await Finger.create(page);

  // 3. 材料を押さえ、炎まで引きずる（指は離さない）
  await finger.down(points[o.materialKey].x, points[o.materialKey].y);
  await step(page, STEP_MS);
  expect((await state(page)).held?.element).toBe(o.element);

  const legs = 6;
  const from = points[o.materialKey];
  for (let i = 1; i <= legs; i++) {
    const k = i / legs;
    await finger.move(from.x + (points.flame.x - from.x) * k, from.y + (points.flame.y - from.y) * k);
    await step(page, STEP_MS);
  }
  const sFlame = await state(page);
  expect(sFlame.flame.element).toBe(o.element);
  expect(sFlame.held.inFlame).toBe(true);
  await step(page, STEP_MS * 8);

  // 炎の色を 2 軸（色相 × 明度）で見る
  const want = ELEMENT_FLAME_COLORS[o.element];
  const flame = await measure(page, flameRect, `${o.tag}-flame-${o.element}.png`);
  expect(flame.hue, '炎の芯に色づいた画素が無い').not.toBeNull();
  expect(
    flameColorMatches(flame.hue!, flame.value, want),
    `炎の芯 hue=${flame.hue?.toFixed(1)}° value=${flame.value.toFixed(3)} が ${want.name} の領域 ` +
      `(hue ${want.hue.from}–${want.hue.to}°, value ${want.value.from}–${want.value.to}) に入らない`,
  ).toBe(true);
  expect(flame.coloredRatio).toBeGreaterThan(0.5);

  // 4. 指を離さず受け口へ運び、そこで離す
  const site = points[o.siteKey];
  for (let i = 1; i <= legs; i++) {
    const k = i / legs;
    await finger.move(points.flame.x + (site.x - points.flame.x) * k, points.flame.y + (site.y - points.flame.y) * k);
    await step(page, STEP_MS);
  }
  const sCarry = await state(page);
  expect(sCarry.phase).toBe('delivering');
  expect(sCarry.flame.element).toBeNull();
  expect(sCarry.held.afterglowMs).toBeGreaterThan(0);

  await finger.up();
  await step(page, STEP_MS);
  const sDeliver = await state(page);
  expect(job(sDeliver, o.jobId).status).toBe('job_running');
  expect(sDeliver.waitingFor).toBe('job_animation');
  expect(await page.evaluate(() => window.__fire.ready())).toBe('busy');

  if (o.onStep) {
    const slice = Math.round(o.runMs / RUN_SAMPLES / STEP_MS) * STEP_MS;
    for (let i = 0; i < RUN_SAMPLES; i++) {
      await step(page, slice);
      await o.onStep(page, points, u, i);
    }
    await step(page, o.runMs + STEP_MS * 4 - slice * RUN_SAMPLES);
  } else {
    await step(page, o.runMs + STEP_MS * 4);
  }
  const stateDone = await state(page);
  expect(job(stateDone, o.jobId).status).toBe('done');
  expect(stateDone.phase).toBe('idle');
  expect(stateDone.materials.find((m: any) => m.element === o.element).at).toBe(`site:${o.jobId}`);

  const watchAfter = await measure(page, watchRect, `${o.tag}-watch-after.png`);
  const vp = page.viewportSize();
  if (vp) await shot(page, { x: 0, y: 0, width: vp.width, height: vp.height }, `${o.tag}-success.png`);

  const logKeys: string[] = await page.evaluate(() =>
    window.__fire.log().map((e: any) => `${e.kind}:${e.msg}`),
  );
  const spoken = await page.evaluate(() => window.__fire.speech.captured());

  return {
    idleFlame,
    flame,
    watchBefore,
    watchAfter,
    stateDone,
    logKeys,
    spoken: spoken.map((r: any) => ({ text: r.text, label: r.label, reason: r.reason })),
  };
}

/** ログに 入力 → 炎入り → 炎出 → 届け → 成功 → 仕事完了 の順が残ることを確かめる。 */
export function expectDeliveryLogOrder(logKeys: string[]): void {
  const want = ['input:down', 'flame:enter', 'flame:exit', 'input:up', 'deliver:success', 'job:done'];
  let i = 0;
  for (const k of logKeys) if (k === want[i]) i++;
  expect(i, `log=${logKeys.join(' > ')}`).toBe(want.length);
}
