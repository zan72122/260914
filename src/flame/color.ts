/**
 * color.ts — 発光線 → CIE 1931 XYZ → 線形 sRGB → 表示 sRGB
 *
 * 全て純関数・依存ゼロ。PixiJS も DOM も使わないので Node 上でそのままテストできる。
 *
 * 方針（PLAN §4「色は実際の発光波長から算出」）:
 *   1. 発光線の集合を CIE 1931 2° 等色関数で積分し XYZ を得る。
 *   2. 色度（= 色相・彩度）は一切いじらない。sRGB 色域外の色は
 *      「同じ輝度の白（D65）へ真っ直ぐ寄せる」ことでのみ色域内に入れる。
 *      これは主波長を保つ操作なので、色相を恣意的にずらさない。
 *   3. 明度（輝度）だけは表示のために正規化する。方針は README に明記。
 *
 * 唯一の import は同じディレクトリの spectra.ts（これも依存ゼロの純データ）。
 */

import {
  BASE_GAS_FLAME_LINES,
  INNER_CONE_LINES,
  blendSpectra,
  getSpectrum,
  type ElementId,
} from './spectra';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface XYZ {
  readonly X: number;
  readonly Y: number;
  readonly Z: number;
}

/** 0..1 の三刺激値。linear = 線形光、encoded = sRGB 伝達関数適用後。 */
export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Chromaticity {
  readonly x: number;
  readonly y: number;
}

export interface HSV {
  /** 色相 [deg]、0=赤, 120=緑, 240=青。 */
  readonly h: number;
  /** 彩度 0..1。 */
  readonly s: number;
  /** 明度 0..1（HSV の V = max(r,g,b)）。 */
  readonly v: number;
}

export interface FlameColor {
  /** 等色関数による積分結果（総放射パワー 1 に正規化したスペクトルに対して）。 */
  readonly xyz: XYZ;
  /** CIE 1931 色度座標。表示の都合で変えていない生の値。 */
  readonly chromaticity: Chromaticity;
  /**
   * 主波長 [nm]（D65 基準）。色相の物理的な指標。
   * 純紫線側に落ちる色では補色主波長を負値で返す。無彩色では NaN。
   */
  readonly dominantWavelengthNm: number;
  /**
   * 相対視感効率 = 単位放射パワーあたりの Y。
   * 555 nm 単色光で 1.0。リチウム深紅が暗い物理的理由がここに出る。
   */
  readonly luminousEfficacy: number;
  /** 表示用に正規化した輝度 0..1（README の輝度正規化方針を適用済み）。 */
  readonly displayLuminance: number;
  /** 色域マッピング・輝度正規化後の線形 sRGB（0..1）。シェーダに渡すのはこれ。 */
  readonly linear: RGB;
  /** sRGB 伝達関数を適用した表示値（0..1）。 */
  readonly srgb: RGB;
  /** '#rrggbb'。 */
  readonly hex: string;
  /** 表示 sRGB の HSV。テストの期待値はこれで書く。 */
  readonly hsv: HSV;
  /** 色域内に入れるために白へ寄せた量 0..1（0 = 色域内、大きいほど彩度を落とした）。 */
  readonly gamutDesaturation: number;
}

// ---------------------------------------------------------------------------
// CIE 1931 2° 等色関数（解析近似）
// ---------------------------------------------------------------------------

/**
 * CIE 1931 2° 標準観測者の等色関数 x̄(λ), ȳ(λ), z̄(λ)。
 * 380–780 nm を 5 nm 刻みで埋め込み（81 点 × 3 = 243 値）、間は線形補間する。
 *
 * 出典: CIE 1931 2-deg XYZ CMFs（CIE 15:2004 の標準表）。
 *       数値は colour-science/colour の
 *       colour/colorimetry/datasets/cmfs.py, "CIE 1931 2 Degree Standard Observer"
 *       （CIE 公表値の 1 nm 表）から 5 nm 刻みで抜き出したもの。
 *
 * ★解析近似を使わない理由（README にも記載）★
 *  Wyman–Sloan–Shirley (JCGT 2013) の多ローブ・ガウス近似も検討したが、
 *  650–700 nm の裾で ȳ の相対誤差が 40% を超え、リチウム 670.8 nm 単色の
 *  色度が x=0.69 と算出されてしまう（正しくは x≈0.73）。
 *  本作の要は「二つの赤の区別」なので、この誤差は許容できない。実表を採る。
 *
 * 精度の限界:
 *  - 5 nm 刻みの線形補間。単色線に対する色度の誤差は概ね 0.002 以下、
 *    色相角にして 1° 未満（CMF は 5 nm スケールで滑らかなため）。
 *  - 380 nm 未満 / 780 nm 超は 0 とする。Cu I 324.8/327.4 nm などの紫外線は
 *    色に寄与しない（実際、人の目にも見えない）。
 */
export const CMF_MIN_NM = 380;
export const CMF_MAX_NM = 780;
export const CMF_STEP_NM = 5;

/** [x̄, ȳ, z̄] を 380 nm から 5 nm 刻みで平坦化したもの。 */
const CMF_TABLE: readonly number[] = [
  0.001368, 0.000039, 0.00645, 0.002236, 0.000064, 0.01055, 0.004243, 0.00012, 0.02005,
  0.00765, 0.000217, 0.03621, 0.01431, 0.000396, 0.06785, 0.02319, 0.00064, 0.1102,
  0.04351, 0.00121, 0.2074, 0.07763, 0.00218, 0.3713, 0.13438, 0.004, 0.6456,
  0.21477, 0.0073, 1.03905, 0.2839, 0.0116, 1.3856, 0.3285, 0.01684, 1.62296,
  0.34828, 0.023, 1.74706, 0.34806, 0.0298, 1.7826, 0.3362, 0.038, 1.77211,
  0.3187, 0.048, 1.7441, 0.2908, 0.06, 1.6692, 0.2511, 0.0739, 1.5281,
  0.19536, 0.09098, 1.28764, 0.1421, 0.1126, 1.0419, 0.09564, 0.13902, 0.81295,
  0.05795, 0.1693, 0.6162, 0.03201, 0.20802, 0.46518, 0.0147, 0.2586, 0.3533,
  0.0049, 0.323, 0.272, 0.0024, 0.4073, 0.2123, 0.0093, 0.503, 0.1582,
  0.0291, 0.6082, 0.1117, 0.06327, 0.71, 0.07825, 0.1096, 0.7932, 0.05725,
  0.1655, 0.862, 0.04216, 0.22575, 0.91485, 0.02984, 0.2904, 0.954, 0.0203,
  0.3597, 0.9803, 0.0134, 0.43345, 0.99495, 0.00875, 0.51205, 1.0, 0.00575,
  0.5945, 0.995, 0.0039, 0.6784, 0.9786, 0.00275, 0.7621, 0.952, 0.0021,
  0.8425, 0.9154, 0.0018, 0.9163, 0.87, 0.00165, 0.9786, 0.8163, 0.0014,
  1.0263, 0.757, 0.0011, 1.0567, 0.6949, 0.001, 1.0622, 0.631, 0.0008,
  1.0456, 0.5668, 0.0006, 1.0026, 0.503, 0.00034, 0.9384, 0.4412, 0.00024,
  0.85445, 0.381, 0.00019, 0.7514, 0.321, 0.0001, 0.6424, 0.265, 0.00005,
  0.5419, 0.217, 0.00003, 0.4479, 0.175, 0.00002, 0.3608, 0.1382, 0.00001,
  0.2835, 0.107, 0, 0.2187, 0.0816, 0, 0.1649, 0.061, 0,
  0.1212, 0.04458, 0, 0.0874, 0.032, 0, 0.0636, 0.0232, 0,
  0.04677, 0.017, 0, 0.0329, 0.01192, 0, 0.0227, 0.00821, 0,
  0.01584, 0.005723, 0, 0.011359, 0.004102, 0, 0.008111, 0.002929, 0,
  0.00579, 0.002091, 0, 0.004109, 0.001484, 0, 0.002899, 0.001047, 0,
  0.002049, 0.00074, 0, 0.00144, 0.00052, 0, 0.001, 0.000361, 0,
  0.00069, 0.000249, 0, 0.000476, 0.000172, 0, 0.000332, 0.00012, 0,
  0.000235, 0.000085, 0, 0.000166, 0.00006, 0, 0.000117, 0.000042, 0,
  0.000083, 0.00003, 0, 0.000059, 0.000021, 0, 0.000042, 0.000015, 0,
];

export const CMF_SAMPLE_COUNT = CMF_TABLE.length / 3;

/** CIE 1931 2° 等色関数を線形補間で評価する。 */
export function sampleCMF(wavelengthNm: number): XYZ {
  if (!(wavelengthNm >= CMF_MIN_NM) || wavelengthNm > CMF_MAX_NM) {
    return { X: 0, Y: 0, Z: 0 };
  }
  const pos = (wavelengthNm - CMF_MIN_NM) / CMF_STEP_NM;
  const i0 = Math.min(CMF_SAMPLE_COUNT - 1, Math.floor(pos));
  const i1 = Math.min(CMF_SAMPLE_COUNT - 1, i0 + 1);
  const f = pos - i0;
  const a = i0 * 3;
  const b = i1 * 3;
  return {
    X: CMF_TABLE[a] + f * (CMF_TABLE[b] - CMF_TABLE[a]),
    Y: CMF_TABLE[a + 1] + f * (CMF_TABLE[b + 1] - CMF_TABLE[a + 1]),
    Z: CMF_TABLE[a + 2] + f * (CMF_TABLE[b + 2] - CMF_TABLE[a + 2]),
  };
}

// ---------------------------------------------------------------------------
// スペクトル → XYZ
// ---------------------------------------------------------------------------

export interface SpectralSample {
  readonly wavelengthNm: number;
  readonly relativeIntensity: number;
}

/**
 * 発光線（離散）の集合を等色関数で積分して XYZ を得る。
 * 入力の相対強度は放射パワー。総パワーで割ってから積分するので、
 * 返る Y は「単位放射パワーあたりの視感効率」になる（555 nm 単色光で 1.0）。
 */
export function spectrumToXYZ(lines: readonly SpectralSample[]): XYZ {
  let total = 0;
  for (const l of lines) total += l.relativeIntensity;
  if (!(total > 0)) return { X: 0, Y: 0, Z: 0 };
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (const l of lines) {
    const w = l.relativeIntensity / total;
    const c = sampleCMF(l.wavelengthNm);
    X += w * c.X;
    Y += w * c.Y;
    Z += w * c.Z;
  }
  return { X, Y, Z };
}

export function chromaticityOf(xyz: XYZ): Chromaticity {
  const sum = xyz.X + xyz.Y + xyz.Z;
  if (!(sum > 0)) return { x: 0, y: 0 };
  return { x: xyz.X / sum, y: xyz.Y / sum };
}

/** 色度 + 輝度 から XYZ を作り直す。 */
export function xyzFromChromaticity(c: Chromaticity, luminance: number): XYZ {
  if (!(c.y > 0)) return { X: 0, Y: 0, Z: 0 };
  const X = (luminance / c.y) * c.x;
  const Z = (luminance / c.y) * (1 - c.x - c.y);
  return { X, Y: luminance, Z };
}

// ---------------------------------------------------------------------------
// XYZ → 線形 sRGB（D65）
// ---------------------------------------------------------------------------

/** IEC 61966-2-1 / sRGB 原色・D65 白色点の XYZ→RGB 行列。 */
const XYZ_TO_LINEAR_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

/** 色域外では負の成分が出る。クリップしないのでここでは色度が保たれている。 */
export function xyzToLinearSRGB(xyz: XYZ): RGB {
  const m = XYZ_TO_LINEAR_SRGB;
  return {
    r: m[0][0] * xyz.X + m[0][1] * xyz.Y + m[0][2] * xyz.Z,
    g: m[1][0] * xyz.X + m[1][1] * xyz.Y + m[1][2] * xyz.Z,
    b: m[2][0] * xyz.X + m[2][1] * xyz.Y + m[2][2] * xyz.Z,
  };
}

/** 線形 sRGB の相対輝度 Y（Rec.709 係数 = sRGB 行列の Y 行）。 */
export function relativeLuminance(linear: RGB): number {
  return 0.2126729 * linear.r + 0.7151522 * linear.g + 0.072175 * linear.b;
}

// ---------------------------------------------------------------------------
// 色域マッピング
// ---------------------------------------------------------------------------

export interface GamutMapResult {
  readonly rgb: RGB;
  /** 白へ寄せた割合 0..1。 */
  readonly desaturation: number;
}

/**
 * sRGB 色域外の線形 RGB を色域内に入れる。
 *
 * 方法: 輝度を保ったまま、同じ輝度の無彩色（D65 白）へ直線的に寄せる。
 * これは CIE xy 平面で「色度点 → 白色点」の直線上を動く操作であり、
 * 主波長（= 物理的な色相）を保つ。成分をクリップする方式は色相を曲げるので採らない。
 *
 * 単色光はどれも sRGB 色域外なので、この彩度低下は避けられない。
 * 「本物の色を表示装置で表せる範囲に落とす」以上のことはしていない。
 */
export function gamutMapLinear(linear: RGB): GamutMapResult {
  const y = relativeLuminance(linear);
  if (y <= 0) return { rgb: { r: 0, g: 0, b: 0 }, desaturation: 0 };

  // c + t*(y - c) >= 0 を全チャンネルで満たす最小の t を求める。
  let t = 0;
  for (const c of [linear.r, linear.g, linear.b]) {
    if (c >= 0) continue;
    const denom = y - c; // c < 0 <= y なので必ず正
    const need = -c / denom;
    if (need > t) t = need;
  }
  if (t > 1) t = 1;
  const mixed: RGB = {
    r: linear.r + t * (y - linear.r),
    g: linear.g + t * (y - linear.g),
    b: linear.b + t * (y - linear.b),
  };
  // 丸め誤差で残る微小な負値を落とす。
  return {
    rgb: { r: Math.max(0, mixed.r), g: Math.max(0, mixed.g), b: Math.max(0, mixed.b) },
    desaturation: t,
  };
}

/** 輝度を保ったまま最大成分が 1 を超えないよう全体を縮める。 */
export function scaleIntoUnitRange(linear: RGB): RGB {
  const max = Math.max(linear.r, linear.g, linear.b);
  if (max <= 1) return linear;
  return { r: linear.r / max, g: linear.g / max, b: linear.b / max };
}

// ---------------------------------------------------------------------------
// 伝達関数
// ---------------------------------------------------------------------------

export function linearToSRGBComponent(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function srgbToLinearComponent(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSRGB(linear: RGB): RGB {
  return {
    r: linearToSRGBComponent(linear.r),
    g: linearToSRGBComponent(linear.g),
    b: linearToSRGBComponent(linear.b),
  };
}

export function srgbToLinear(srgb: RGB): RGB {
  return {
    r: srgbToLinearComponent(srgb.r),
    g: srgbToLinearComponent(srgb.g),
    b: srgbToLinearComponent(srgb.b),
  };
}

export function toHex(srgb: RGB): string {
  const q = (c: number) => {
    const v = Math.round(Math.min(1, Math.max(0, c)) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return `#${q(srgb.r)}${q(srgb.g)}${q(srgb.b)}`;
}

/** 0xRRGGBB の整数（PixiJS の tint / uniform 用に使うことがある）。 */
export function toRGBInt(srgb: RGB): number {
  const q = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return (q(srgb.r) << 16) | (q(srgb.g) << 8) | q(srgb.b);
}

/** sRGB → HSV。h は [0,360)。 */
export function rgbToHSV(rgb: RGB): HSV {
  const r = Math.min(1, Math.max(0, rgb.r));
  const g = Math.min(1, Math.max(0, rgb.g));
  const b = Math.min(1, Math.max(0, rgb.b));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** 色相差を [-180, 180] の最短角で返す。 */
export function hueDifference(a: number, b: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** 色相の絶対差 [0,180]。 */
export function hueDistance(a: number, b: number): number {
  return Math.abs(hueDifference(a, b));
}

// ---------------------------------------------------------------------------
// 輝度正規化の方針
// ---------------------------------------------------------------------------

/**
 * 表示用の明るさ正規化。README の「近似と限界」に対応する、色に関する唯一の意図的操作。
 *
 * 色度（色相・彩度）は触らない。触るのは明るさだけ。
 *
 * 1. 単位放射パワーあたりの Y（= 相対視感効率、555 nm 単色で 1.0）を出す。
 *    リチウム 670.8 nm は V(λ) ≈ 0.031 しかないので、Sr の 600–680 nm 帯より
 *    4〜5 倍暗い。これは物理であり、「リチウムは深紅（暗い赤）」の理由そのもの。
 *    この比は潰したくないので、レンジ圧縮（sqrt 等）はかけず比例のままにする。
 * 2. REFERENCE_EFFICACY で割って 0..1 に載せる（これを超える元素は 1 に飽和）。
 *    0.45 はガス炎（0.17）・銅（0.28）・ストロンチウム（0.16）が中庸に収まり、
 *    ナトリウム（0.77）が飽和する値として選んだ。
 * 3. MIN_DISPLAY_SCALE の床を設け、最も暗いリチウムでも炎が確実に見えるようにする。
 *    床を入れた分だけ Sr : Li の比は 4.7 : 1 から約 2.5 : 1 に緩む。これが唯一の圧縮。
 *
 * 「見栄えのために色相をずらす」ことは一切していない（PLAN 厳守事項）。
 */
export const REFERENCE_EFFICACY = 0.45;
/** 1.0 = 視感効率に比例（圧縮なし）。0.5 にすると sqrt 圧縮になる。 */
export const LUMINANCE_EXPONENT = 1.0;
export const MIN_DISPLAY_SCALE = 0.1;
export const MAX_DISPLAY_SCALE = 1.0;

/** 視感効率 → 線形 sRGB に掛ける表示スケール 0..1。 */
export function normalizeDisplayLuminance(luminousEfficacy: number): number {
  if (!(luminousEfficacy > 0)) return 0;
  const ratio = Math.min(1, luminousEfficacy / REFERENCE_EFFICACY);
  const compressed = LUMINANCE_EXPONENT === 1 ? ratio : Math.pow(ratio, LUMINANCE_EXPONENT);
  return Math.min(
    MAX_DISPLAY_SCALE,
    MIN_DISPLAY_SCALE + (MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE) * compressed,
  );
}

// ---------------------------------------------------------------------------
// 主波長（色相の物理的な指標）
// ---------------------------------------------------------------------------

/** CIE 1931 における D65 白色点。 */
export const D65_CHROMATICITY: Chromaticity = { x: 0.3127, y: 0.329 };

/**
 * 主波長 [nm]。白色点から色度点へ引いた半直線がスペクトル軌跡と交わる波長。
 *
 * HSV の色相角より物理的に意味がはっきりしており、
 * 「二つの赤」の区別や M3 のプリズム表示との突き合わせに使える。
 * 紫の線（純紫）側に落ちる場合は補色主波長の負値を返す。
 */
export function dominantWavelengthNm(c: Chromaticity, allowComplement = true): number {
  const wx = D65_CHROMATICITY.x;
  const wy = D65_CHROMATICITY.y;
  const dx = c.x - wx;
  const dy = c.y - wy;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return NaN; // 無彩色

  const locus = (nm: number): Chromaticity => chromaticityOf(sampleCMF(nm));
  // 半直線 (白 → 色) に対する外積の符号が変わり、かつ同じ向きにある区間を探す。
  const cross = (p: Chromaticity) => dx * (p.y - wy) - dy * (p.x - wx);
  const forward = (p: Chromaticity) => dx * (p.x - wx) + dy * (p.y - wy) > 0;

  const step = 1;
  let prev = locus(CMF_MIN_NM);
  let prevCross = cross(prev);
  for (let nm = CMF_MIN_NM + step; nm <= CMF_MAX_NM; nm += step) {
    const cur = locus(nm);
    const curCross = cross(cur);
    if (prevCross === 0 && forward(prev)) return nm - step;
    if (prevCross * curCross < 0) {
      const t = prevCross / (prevCross - curCross);
      const hit: Chromaticity = {
        x: prev.x + t * (cur.x - prev.x),
        y: prev.y + t * (cur.y - prev.y),
      };
      if (forward(hit)) return nm - step + t * step;
    }
    prev = cur;
    prevCross = curCross;
  }
  // 純紫線上: 反対方向（補色主波長）を負値で返す。
  if (!allowComplement) return NaN;
  const opposite: Chromaticity = { x: wx - dx, y: wy - dy };
  const negative = dominantWavelengthNm(opposite, false);
  return Number.isNaN(negative) ? NaN : -negative;
}

// ---------------------------------------------------------------------------
// 総合: スペクトル → 表示色
// ---------------------------------------------------------------------------

export interface SpectrumColorOptions {
  /**
   * true（既定）: 上記の輝度正規化を適用する。
   * false: 物理的な相対輝度をそのまま使う（検証・比較用）。
   */
  readonly normalizeLuminance?: boolean;
  /** さらに全体の明るさを掛ける（炎の強さ uIntensity 相当）。既定 1。 */
  readonly intensity?: number;
}

export function spectrumToFlameColor(
  lines: readonly SpectralSample[],
  options: SpectrumColorOptions = {},
): FlameColor {
  const normalize = options.normalizeLuminance !== false;
  const intensity = options.intensity ?? 1;

  const xyz = spectrumToXYZ(lines);
  const chromaticity = chromaticityOf(xyz);
  const luminousEfficacy = xyz.Y;

  if (!(luminousEfficacy > 0)) {
    const black: RGB = { r: 0, g: 0, b: 0 };
    return {
      xyz,
      chromaticity,
      dominantWavelengthNm: NaN,
      luminousEfficacy: 0,
      displayLuminance: 0,
      linear: black,
      srgb: black,
      hex: '#000000',
      hsv: { h: 0, s: 0, v: 0 },
      gamutDesaturation: 0,
    };
  }

  // 1. その色度で sRGB が出せる最も明るい色を作る（最大成分 = 1）。
  //    ここまでで色度（色相・彩度）は色域マッピング以外いじっていない。
  const mapped = gamutMapLinear(xyzToLinearSRGB(xyzFromChromaticity(chromaticity, 1)));
  const peakMax = Math.max(mapped.rgb.r, mapped.rgb.g, mapped.rgb.b);
  const peak: RGB =
    peakMax > 0
      ? { r: mapped.rgb.r / peakMax, g: mapped.rgb.g / peakMax, b: mapped.rgb.b / peakMax }
      : { r: 0, g: 0, b: 0 };

  // 2. 明るさだけを掛ける。飽和色は輝度 Y をそのまま指定できない
  //    （純赤の Y は最大でも 0.2126）ので、輝度ではなく「表示スケール」で正規化する。
  const scale = Math.min(
    1,
    Math.max(0, (normalize ? normalizeDisplayLuminance(luminousEfficacy) : luminousEfficacy) * Math.max(0, intensity)),
  );

  const linear: RGB = { r: peak.r * scale, g: peak.g * scale, b: peak.b * scale };
  const srgb = linearToSRGB(linear);

  return {
    xyz,
    chromaticity,
    dominantWavelengthNm: dominantWavelengthNm(chromaticity),
    luminousEfficacy,
    displayLuminance: relativeLuminance(linear),
    linear,
    srgb,
    hex: toHex(srgb),
    hsv: rgbToHSV(srgb),
    gamutDesaturation: mapped.desaturation,
  };
}

// ---------------------------------------------------------------------------
// 元素・ガス炎との合成
// ---------------------------------------------------------------------------

/**
 * 素の青いガス炎の色。何も入れていないバーナーはこの色（PLAN §3.2）。
 */
export function baseFlameColor(options: SpectrumColorOptions = {}): FlameColor {
  return spectrumToFlameColor(BASE_GAS_FLAME_LINES, options);
}

/** 元素単体の炎色（ガス炎の寄与を含まない、mix = 1 の極限）。 */
export function elementFlameColor(
  element: ElementId,
  options: SpectrumColorOptions = {},
): FlameColor {
  return spectrumToFlameColor(getSpectrum(element).lines, options);
}

/**
 * 炎の色。element が null なら素の青いガス炎。
 *
 * mix は PLAN の uMix と同じ意味: 0 = 素の青いガス炎, 1 = 元素色が支配。
 * 合成は色空間ではなく「放射スペクトルの加算」で行う（blendSpectra）。
 * 実際の炎でも元素の発光はガス炎の発光に重なるので、これが物理的に正しい。
 */
export function flameColor(
  element: ElementId | null,
  mix: number,
  options: SpectrumColorOptions = {},
): FlameColor {
  if (element === null) return baseFlameColor(options);
  const lines = blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum(element).lines, mix);
  return spectrumToFlameColor(lines, options);
}

/** 内炎（還元炎）の色。C2 Swan が強く、外炎より緑寄りの青緑になる。 */
export function innerConeColor(options: SpectrumColorOptions = {}): FlameColor {
  return spectrumToFlameColor(INNER_CONE_LINES, options);
}

// ---------------------------------------------------------------------------
// 煤の輝点 — 黒体放射（プランクの法則）
// ---------------------------------------------------------------------------

/**
 * 温度 T [K] の黒体の分光放射輝度（プランクの法則）。比例定数は省く（色度にしか使わない）。
 * L(λ) ∝ 1 / (λ^5 (exp(hc / (λ k T)) − 1))
 */
export function planckRadiance(wavelengthNm: number, temperatureK: number): number {
  const lambda = wavelengthNm * 1e-9;
  const h = 6.62607015e-34;
  const c = 2.99792458e8;
  const k = 1.380649e-23;
  const exponent = (h * c) / (lambda * k * temperatureK);
  if (exponent > 700) return 0; // 数値的にゼロ
  return 1 / (Math.pow(lambda, 5) * (Math.expm1(exponent)));
}

/**
 * 煤（すす）の輝点の色。炎の中で赤熱した炭素粒の熱放射で、炎色反応とは別の現象。
 * 1600 K 前後で橙、1900 K を超えると黄に寄る。既定は 1700 K。
 *
 * 限界: 煤は灰色体（emissivity がほぼ波長に依らない）として扱っている。
 *       実際の煤は短波長側でわずかに放射率が高く、実測はもう少し白っぽい。
 *       また可視域（380–780 nm）だけを取って正規化しているので、
 *       luminousEfficacy は「可視放射あたりの効率」であり、
 *       黒体全体の発光効率（大半は赤外）ではない。明るさはシェーダ側が決める。
 */
export function blackBodyColor(
  temperatureK: number,
  options: SpectrumColorOptions = {},
): FlameColor {
  const samples: SpectralSample[] = [];
  for (let nm = CMF_MIN_NM; nm <= CMF_MAX_NM; nm += CMF_STEP_NM) {
    samples.push({ wavelengthNm: nm, relativeIntensity: planckRadiance(nm, temperatureK) });
  }
  return spectrumToFlameColor(samples, options);
}

/** 炎の中の煤の輝点の代表温度 [K]。 */
export const SOOT_TEMPERATURE_K = 1700;

export function sootColor(options: SpectrumColorOptions = {}): FlameColor {
  return blackBodyColor(SOOT_TEMPERATURE_K, options);
}

/** シェーダの uElementColor に渡す線形 sRGB 三成分。 */
export function flameColorToUniform(color: FlameColor): [number, number, number] {
  return [color.linear.r, color.linear.g, color.linear.b];
}
