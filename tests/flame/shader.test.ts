/**
 * shader.test.ts — シェーダの「契約」の検査
 *
 * GPU が無いので絵は検証できない（未検証範囲として報告する）。
 * ここで見るのは、差し込み側とシェーダの取り決めが守られているかどうか:
 *   - 必要な uniform が宣言されている
 *   - 色を GLSL の中で作っていない（色の権限は color.ts にある）
 *   - 時間源が uTime だけである（壁時計・フレーム番号を使っていない）
 * さらに、シェーダが線形光で行う合成が、スペクトル合成とほぼ一致することを
 * TypeScript 側で確かめる。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  baseFlameColor,
  chromaticityOf,
  elementFlameColor,
  flameColor,
  hueDistance,
  linearToSRGB,
  rgbToHSV,
  xyzToLinearSRGB,
  xyzFromChromaticity,
} from '../../src/flame/color.js';

const here = dirname(fileURLToPath(import.meta.url));
const flameDir = join(here, '..', '..', 'src', 'flame');
const frag = readFileSync(join(flameDir, 'flame.frag.glsl'), 'utf8');
const vert = readFileSync(join(flameDir, 'flame.vert.glsl'), 'utf8');

describe('フラグメントシェーダの契約', () => {
  it.each([
    'uTime',
    'uElementColor',
    'uBaseColor',
    'uInnerColor',
    'uSootColor',
    'uMix',
    'uIntensity',
    'uResolution',
    'uSeed',
  ])('uniform %s を宣言している', (name) => {
    expect(frag).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`));
  });

  it('WebGL2 / GLSL ES 3.00 で、出力を 1 本だけ持つ', () => {
    expect(frag.startsWith('#version 300 es')).toBe(true);
    expect(vert.startsWith('#version 300 es')).toBe(true);
    expect(frag.match(/^out\s+vec4\s+\w+\s*;/m)).not.toBeNull();
  });

  it('壁時計・フレーム番号を使っていない（時間源は uTime だけ。PLAN §4）', () => {
    expect(frag).not.toMatch(/\bgl_FragCoord\.w\b/);
    expect(frag).not.toMatch(/\buFrame\b/);
    expect(frag).not.toMatch(/\bdate\b/i);
  });

  it('色リテラルを作っていない（色の権限は color.ts にある）', () => {
    // vec3(...) のうち、0 以外の数値を 3 つ並べたもの = 色の直書き。
    const literals = frag.match(/vec3\s*\(\s*[^)]*\)/g) ?? [];
    for (const lit of literals) {
      const args = lit.slice(lit.indexOf('(') + 1);
      const nums = args.match(/-?\d+\.?\d*/g) ?? [];
      const nonZero = nums.filter((n) => Number(n) !== 0);
      // vec3(0.0) だけを許す。
      expect(nonZero.length).toBe(0);
    }
  });

  it('炎の形が内炎と外炎に分かれている（PLAN §3.2 のバーナー描写）', () => {
    expect(frag).toMatch(/outerWidth/);
    expect(frag).toMatch(/innerWidth/);
  });

  it('ノイズ・煤の輝点がある', () => {
    expect(frag).toMatch(/fbm/);
    expect(frag).toMatch(/spark/);
  });

  it('uMix と uIntensity をクランプしている', () => {
    expect(frag).toMatch(/clamp\s*\(\s*uMix/);
    expect(frag).toMatch(/max\s*\(\s*0\.0\s*,\s*uIntensity\s*\)/);
  });
});

describe('頂点シェーダの契約（PixiJS v8 Filter 規約）', () => {
  it.each(['uInputSize', 'uOutputFrame', 'uOutputTexture'])('uniform %s を宣言している', (n) => {
    expect(vert).toMatch(new RegExp(`uniform\\s+vec4\\s+${n}\\s*;`));
  });

  it('aPosition を受け取り vTextureCoord を渡す', () => {
    expect(vert).toMatch(/in\s+vec2\s+aPosition\s*;/);
    expect(vert).toMatch(/out\s+vec2\s+vTextureCoord\s*;/);
    expect(frag).toMatch(/in\s+vec2\s+vTextureCoord\s*;/);
  });
});

describe('シェーダの線形合成とスペクトル合成の一致', () => {
  // シェーダは mix(uBaseColor, uElementColor, uMix) を線形光で行う。
  // これは「二つの光を足す」操作であり物理的に正しいが、
  // color.ts の flameColor() は放射スペクトルを混ぜてから表示正規化をかけるので、
  // 明るさの扱いだけが違う。色相が一致することを確かめる。
  const shaderMixHue = (element: 'copper' | 'strontium' | 'lithium', m: number) => {
    const a = baseFlameColor().linear;
    const b = elementFlameColor(element).linear;
    const lin = {
      r: a.r + (b.r - a.r) * m,
      g: a.g + (b.g - a.g) * m,
      b: a.b + (b.b - a.b) * m,
    };
    return rgbToHSV(linearToSRGB(lin)).h;
  };

  it.each(['copper', 'strontium', 'lithium'] as const)(
    '%s: 全ての mix で色相差が 12° 以内',
    (element) => {
      for (let m = 0; m <= 1.0001; m += 0.1) {
        const spectral = flameColor(element, m).hsv.h;
        expect(hueDistance(spectral, shaderMixHue(element, m))).toBeLessThan(12);
      }
    },
  );

  it('端点は完全に一致する', () => {
    for (const e of ['copper', 'strontium', 'lithium'] as const) {
      expect(hueDistance(flameColor(e, 0).hsv.h, shaderMixHue(e, 0))).toBeLessThan(1e-6);
      expect(hueDistance(flameColor(e, 1).hsv.h, shaderMixHue(e, 1))).toBeLessThan(1e-6);
    }
  });

  it('シェーダに渡す色は全て 0..1 の線形 sRGB', () => {
    const colors = [baseFlameColor(), elementFlameColor('copper'), elementFlameColor('lithium')];
    for (const c of colors) {
      for (const v of [c.linear.r, c.linear.g, c.linear.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('色度から線形 sRGB への往復が壊れていない', () => {
    const c = elementFlameColor('strontium');
    const back = chromaticityOf({
      X: xyzFromChromaticity(c.chromaticity, 1).X,
      Y: 1,
      Z: xyzFromChromaticity(c.chromaticity, 1).Z,
    });
    expect(back.x).toBeCloseTo(c.chromaticity.x, 10);
    expect(xyzToLinearSRGB(xyzFromChromaticity(c.chromaticity, 1)).r).toBeGreaterThan(0);
  });
});
