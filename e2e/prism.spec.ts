/**
 * prism.spec.ts — プリズムの縞を実タッチと実描画で確かめる（PLAN §3.5）
 *
 * 見るのは「二つの赤が縞では違う」ことだけ。
 * 帯が出るはずの位置は spectra.ts の発光線と prism.ts の写像 spectrumU() から出す。
 * 描画側の値（WorldView が何色で塗ったか）は読まない。
 *
 * 判定は「プリズムを炎の前に置いた時 − 置いていない時」の差で見る。
 * 壁は一様ではないので、同じ場所の前後差だけが縞の証拠になる。
 */
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { Finger } from './helpers';
import { openWorld, step, shot, state, ARTIFACTS } from './scene';
import { SPECTRUM_MAX_NM, SPECTRUM_MIN_NM, spectrumU, ATOMIC_WIDTH_NM, MOLECULAR_WIDTH_NM } from '../src/flame/prism';
import { getSpectrum } from '../src/flame/spectra';
import type { ElementId } from '../src/flame/elements';

/**
 * 「そこに線がある」と言える画素差。
 * 壁の地の揺れ（同じ場所を二度撮った差）は 0〜2 程度なので、その数倍を取る。
 * これは仕様側の閾値であり、描かれた値から決めていない。通らなくても緩めない。
 */
const PRESENT_DELTA = 8;
/** 「そこに線が無い」と言える画素差。地の揺れの範囲。 */
const ABSENT_DELTA = 3;

interface Rect { x: number; y: number; w: number; h: number }

/** 壁の 1nm ごとの色（波長軸に沿った走査）。 */
type Scan = { r: number; g: number; b: number }[];

async function scanWall(page: import('@playwright/test').Page, wall: Rect, name: string): Promise<Scan> {
  const buf = await page.screenshot({ clip: { x: wall.x, y: wall.y, width: wall.w, height: wall.h } });
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(resolve(ARTIFACTS, name), buf);
  const png = PNG.sync.read(buf);
  const out: Scan = [];
  for (let nm = SPECTRUM_MIN_NM; nm <= SPECTRUM_MAX_NM; nm++) {
    // 位置は仕様の写像だけから出す
    const px = Math.round(spectrumU(nm) * (png.width - 1));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (y * png.width + px) * 4;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n++;
    }
    out.push({ r: r / n, g: g / n, b: b / n });
  }
  return out;
}

const at = (scan: Scan, nm: number) => scan[Math.round(nm) - SPECTRUM_MIN_NM];
const deltaAt = (on: Scan, off: Scan, nm: number, ch: 'r' | 'g' | 'b'): number =>
  at(on, nm)[ch] - at(off, nm)[ch];

/** しきい値を超えて赤くなっている、連続した波長の幅の最大値 [nm]。 */
function widestRedRunNm(on: Scan, off: Scan, fromNm: number, threshold: number): number {
  let best = 0;
  let run = 0;
  for (let nm = fromNm; nm <= SPECTRUM_MAX_NM; nm++) {
    if (deltaAt(on, off, nm, 'r') >= threshold) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

function peakRedDelta(on: Scan, off: Scan, fromNm: number): number {
  let best = 0;
  for (let nm = fromNm; nm <= SPECTRUM_MAX_NM; nm++) best = Math.max(best, deltaAt(on, off, nm, 'r'));
  return best;
}

async function drag(
  finger: Finger,
  from: { x: number; y: number },
  to: { x: number; y: number },
  page: import('@playwright/test').Page,
  legs = 8,
): Promise<void> {
  for (let i = 1; i <= legs; i++) {
    const k = i / legs;
    await finger.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await step(page, 16);
  }
}

test.describe('プリズム（two_reds_on_bench）', () => {
  test('二つの赤は炎の色では紛らわしいが、縞では決定的に違う', async ({ page }) => {
    await openWorld(page);
    await page.evaluate(() => window.__fire.loadScenario('two_reds_on_bench'));
    expect(await page.evaluate(() => window.__fire.ready())).toBe('ready');
    await step(page, 16 * 10);

    const finger = await Finger.create(page);
    const readings: Record<string, { blue: number; redRun: number; redPeak: number }> = {};

    for (const element of ['strontium', 'lithium'] as const) {
      const materialKey =
        element === 'strontium' ? 'strontium_grains' : 'lithium_powder';

      // --- 材料を金属の輪へ置く（実タッチ。一本指なので材料とプリズムは同時に持てない）
      let pts = await page.evaluate(() => window.__fire.points());
      await finger.down(pts[materialKey].x, pts[materialKey].y);
      await step(page, 16);
      await drag(finger, pts[materialKey], pts.ring, page);
      await finger.up();
      await step(page, 16 * 10);

      const sRing = await state(page);
      expect(
        sRing.materials.find((m: { id: string }) => m.id === materialKey).at,
        `${element} が輪に載っていない`,
      ).toBe('ring');
      expect(sRing.flame.element, '輪に置いた材料の色を炎が保っていない').toBe(element);
      expect(sRing.held, '指を離したのに持ったままになっている').toBeNull();
      expect(sRing.prism).toEqual({ at: 'bench', projecting: null });

      // --- プリズムを置いた状態の壁（これが地）
      const wall: Rect = (await page.evaluate(() => window.__fire.dump('prism'))).wall;
      const off = await scanWall(page, wall, `prism-${element}-wall-off.png`);

      // --- プリズムを炎の前へ（指は離さない）
      pts = await page.evaluate(() => window.__fire.points());
      await finger.down(pts.prism.x, pts.prism.y);
      await step(page, 16);
      await drag(finger, pts.prism, { x: pts.flame.x, y: pts.flame.y }, page);
      await step(page, 16 * 6);

      const sProj = await state(page);
      expect(sProj.prism, 'プリズムが炎の前で映していない').toEqual({
        at: 'held',
        projecting: element,
      });

      const on = await scanWall(page, wall, `prism-${element}-wall-on.png`);
      await shot(page, { x: 0, y: 0, width: wall.x * 2 + wall.w, height: wall.y + wall.h + 40 }, `prism-${element}-scene.png`);

      // --- 判定（位置は spectra.ts の発光線 + spectrumU から出す）
      const lines = getSpectrum(element as ElementId).lines;
      const blueLine = lines.find((l) => l.wavelengthNm >= 400 && l.wavelengthNm < 500);
      expect(blueLine, `${element} の青の線が spectra.ts に無い`).toBeDefined();
      const blue = deltaAt(on, off, blueLine!.wavelengthNm, 'b');

      const redPeak = peakRedDelta(on, off, 590);
      const redRun = widestRedRunNm(on, off, 590, redPeak * 0.25);
      readings[element] = { blue, redRun, redPeak };

      // --- プリズムを離すと台に戻り、縞は消える
      await finger.up();
      await step(page, 16 * 6);
      const sBack = await state(page);
      expect(sBack.prism).toEqual({ at: 'bench', projecting: null });
      const back = await scanWall(page, wall, `prism-${element}-wall-back.png`);
      expect(
        Math.abs(at(back, blueLine!.wavelengthNm).b - at(off, blueLine!.wavelengthNm).b),
        'プリズムを戻したのに縞が残っている',
      ).toBeLessThanOrEqual(ABSENT_DELTA);

      // --- 材料を輪から拾って台へ戻す（次の元素のため）
      pts = await page.evaluate(() => window.__fire.points());
      await finger.down(pts.ring.x, pts.ring.y);
      await step(page, 16);
      await drag(finger, pts.ring, pts.benchFree, page);
      await finger.up();
      await step(page, 16 * 6);
      expect((await state(page)).flame.element, '輪から拾ったのに炎の色が残っている').toBeNull();
    }

    const sr = readings.strontium;
    const li = readings.lithium;
    console.log(
      `prism: Sr blue=${sr.blue.toFixed(1)} redRun=${sr.redRun}nm redPeak=${sr.redPeak.toFixed(1)} / ` +
        `Li blue=${li.blue.toFixed(1)} redRun=${li.redRun}nm redPeak=${li.redPeak.toFixed(1)}`,
    );

    // ストロンチウム: 赤の帯があり、かつ青の弱い線がある（PLAN §3.2 の 460.7 nm）
    expect(sr.redPeak, `Sr の赤が出ていない (${sr.redPeak.toFixed(1)})`).toBeGreaterThan(PRESENT_DELTA * 4);
    expect(
      sr.redRun,
      `Sr の赤が帯になっていない (${sr.redRun}nm。分子バンドの幅 ${MOLECULAR_WIDTH_NM}nm 以上を期待)`,
    ).toBeGreaterThanOrEqual(MOLECULAR_WIDTH_NM);
    expect(
      sr.blue,
      `Sr の青の弱い線が見えない (Δb=${sr.blue.toFixed(1)})`,
    ).toBeGreaterThanOrEqual(PRESENT_DELTA);

    // リチウム: 赤の一本だけで、青の線は無い
    expect(li.redPeak, `Li の赤が出ていない (${li.redPeak.toFixed(1)})`).toBeGreaterThan(PRESENT_DELTA * 4);
    expect(
      li.redRun,
      `Li の赤が一本になっていない (${li.redRun}nm。原子線の幅 ${ATOMIC_WIDTH_NM}nm の 1.6 倍以内を期待)`,
    ).toBeLessThanOrEqual(Math.round(ATOMIC_WIDTH_NM * 1.6));
    expect(li.blue, `Li に無いはずの青の線が見える (Δb=${li.blue.toFixed(1)})`).toBeLessThanOrEqual(ABSENT_DELTA);

    // 二つの赤は、縞では決定的に違う
    expect(sr.redRun).toBeGreaterThan(li.redRun * 2);
  });
});
