/**
 * spectra.ts — 炎色反応の発光スペクトル・データ（依存ゼロの純データ + 純関数）
 *
 * 目的: PLAN.md §3.2 の「主な発光線」を、色算出（color.ts）が使える形で持つ。
 *
 * 出典（値の根拠）:
 *  [NIST]  NIST Atomic Spectra Database, Lines Form (ASD v5.x)。
 *          原子線の空気中波長と "Relative Intensity"（アーク/放電での観測強度）。
 *          https://physics.nist.gov/asd — 掲載の persistent lines を採用。
 *  [PYRO]  花火化学の標準的記述（Conkling & Mocella, "Chemistry of Pyrotechnics";
 *          Shimizu, "Fireworks: The Art, Science and Technique"）。
 *          炎色の実体が原子線ではなく一水酸化物・塩化物の分子バンドである点、
 *          および各バンドの中心波長帯。
 *  [FLAME] 炎光分析（flame emission spectroscopy）の教科書的な帯域値。
 *
 * ★重要な但し書き（README にも記載）★
 *  - 炎の中で実際に光っているものの多くは「原子線」ではなく「分子バンド」である。
 *    バンドは本来 1 本の線ではなく数 nm〜数十 nm 幅の構造を持つ。ここでは
 *    バンドを代表波長の「線」に離散化している。色度への影響は小さいが、
 *    プリズム表示（M3）では線に見えすぎる点に注意。
 *  - Relative intensity は光源条件（温度・酸化還元・ハロゲン供与体の有無）に強く依存する。
 *    ここでの値は「その元素の炎色として一般に観測される見え方」を再現するための
 *    出典値ベースの代表値であり、特定の実測スペクトルの複製ではない。
 *  - 強度は同一元素内での相対値。元素間の明るさの差は color.ts が
 *    「総放射パワーを 1 に正規化した上での視感効率」として算出する。
 *
 * ★炎温度での補正（アーク値をそのまま使わない理由）★
 *  NIST の Relative Intensity はアーク・放電（数千〜1万 K）での観測値で、
 *  炎（バーナー約 2000 K、赤い信号炎でも約 2400 K）とは励起分布が全く違う。
 *  上準位のエネルギー E に対し占有数は exp(−E/kT) で効くため、
 *  高い準位から出る線は炎では桁違いに弱い。kT は 2000 K で約 0.172 eV。
 *
 *   - Li 670.8 nm は上準位 2p（1.85 eV）の共鳴線 → 炎でよく光る。
 *     Li 610.4 nm は上準位 3d（3.88 eV）。差 2.03 eV は exp(−11.8) ≈ 1e−5 に相当し、
 *     アークでの比（約 0.15）をそのまま使うと橙が過剰になり、
 *     色度が x≈0.66 まで橙側に寄って「深紅」でなくなる。ここでは 0.008 に落とす。
 *   - Sr I 460.7 nm も上準位 2.69 eV で炎では本来ごく弱い。ただし
 *     赤い信号炎の実測スペクトルには弱いながら確かに現れ、PLAN §3.2 も明示しているので
 *     「弱い可視の特徴」として 0.03 を与える（赤バンド合計の約 1%）。
 *   - Cu I 510.6/515.3/521.8 nm も上準位 3.8 eV 級で、炎の緑の主因は本来 CuOH バンド。
 *     両者を併記し、合計として「青緑」になるようにしてある。
 *  この補正は色相を好みで動かす操作ではなく、光源条件を炎に合わせる操作である。
 */

/** 発光の起源。色の「本物らしさ」を後から検証できるように必ず記録する。 */
export type EmitterKind =
  | 'atomic' // 中性原子の線スペクトル（例: Li I 670.8 nm）
  | 'molecular'; // 分子バンド（例: SrCl, CuOH, C2 Swan）を代表波長に離散化したもの

export interface EmissionLine {
  /** 空気中波長 [nm]。 */
  readonly wavelengthNm: number;
  /** 同一元素内での相対強度（任意単位、正）。 */
  readonly relativeIntensity: number;
  readonly kind: EmitterKind;
  /** 発光種（'Li I', 'SrCl', 'C2 Swan' など）。 */
  readonly species: string;
  /** 根拠メモ。 */
  readonly note: string;
}

/** v1 必須は copper / strontium / lithium。sodium / barium は v2 用に用意だけする（PLAN §8）。 */
export type ElementId = 'copper' | 'strontium' | 'lithium' | 'sodium' | 'barium';

export interface ElementSpectrum {
  readonly id: ElementId;
  /** 日本語表示名（画面には出さない。ログ・テスト用）。 */
  readonly labelJa: string;
  /** 発話用のかな（PLAN §3.6）。色算出では使わない。 */
  readonly speechKana: string;
  readonly lines: readonly EmissionLine[];
}

// ---------------------------------------------------------------------------
// 銅 — 青緑
// ---------------------------------------------------------------------------
// [NIST] Cu I persistent lines: 324.754 (rel 5000), 327.396 (2500) は紫外で
//        等色関数がほぼ 0 のため色には寄与しないが、記録として残す。
//        可視域は 510.554 (2000), 515.324 (400), 521.820 (1500), 578.213 (500)。
// [PYRO] 塩素供与体があると CuCl バンド（428–452 nm、青）が立ち、
//        水蒸気中では CuOH バンド（約 525–555 nm、緑）が出る。
//        両者の重なりが「銅の青緑」の実体。PLAN §3.2 の「他に青の線群」に対応。
const COPPER: ElementSpectrum = {
  id: 'copper',
  labelJa: '銅',
  speechKana: 'どう',
  lines: [
    { wavelengthNm: 324.754, relativeIntensity: 1.0, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 5000。紫外、視覚寄与なし' },
    { wavelengthNm: 327.396, relativeIntensity: 0.5, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 2500。紫外、視覚寄与なし' },
    { wavelengthNm: 427.51, relativeIntensity: 0.1, kind: 'atomic', species: 'Cu I', note: '[NIST] 弱い青線' },
    { wavelengthNm: 435.4, relativeIntensity: 0.34, kind: 'molecular', species: 'CuCl', note: '[PYRO] CuCl 青バンド 428–452 nm の主頭' },
    { wavelengthNm: 443.4, relativeIntensity: 0.3, kind: 'molecular', species: 'CuCl', note: '[PYRO] 同バンド' },
    { wavelengthNm: 452.8, relativeIntensity: 0.2, kind: 'molecular', species: 'CuCl', note: '[PYRO] 同バンド長波長端' },
    { wavelengthNm: 510.554, relativeIntensity: 0.4, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 2000。緑の主線' },
    { wavelengthNm: 515.324, relativeIntensity: 0.08, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 400' },
    { wavelengthNm: 521.82, relativeIntensity: 0.3, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 1500' },
    { wavelengthNm: 535.0, relativeIntensity: 0.3, kind: 'molecular', species: 'CuOH', note: '[PYRO] CuOH 緑バンド 525–555 nm' },
    { wavelengthNm: 548.0, relativeIntensity: 0.22, kind: 'molecular', species: 'CuOH', note: '[PYRO] 同バンド' },
    { wavelengthNm: 578.213, relativeIntensity: 0.06, kind: 'atomic', species: 'Cu I', note: '[NIST] rel 500。弱い黄' },
  ],
};

// ---------------------------------------------------------------------------
// ストロンチウム — 緋（明るい赤）
// ---------------------------------------------------------------------------
// [NIST] Sr I 460.733 nm（5s² ¹S0 – 5s5p ¹P1、共鳴線、rel 1000）が唯一の強い可視原子線。
//        689.259 / 707.0 nm は弱い。
// [PYRO] 赤い信号炎の色は SrCl（約 620–675 nm）と SrOH（約 605–682 nm）のバンド。
//        PLAN §3.2 の「460.7 nm 青 / 606 nm 付近 橙 / 650–690 nm 帯 赤」に一致。
//        青の共鳴線は赤バンドに比べ炎中では弱く、強度比を 0.10 程度に置く。
const STRONTIUM: ElementSpectrum = {
  id: 'strontium',
  labelJa: 'ストロンチウム',
  speechKana: 'ストロンチウム',
  lines: [
    { wavelengthNm: 460.733, relativeIntensity: 0.03, kind: 'atomic', species: 'Sr I', note: '[NIST] rel 1000 の共鳴線。炎中では赤バンドよりはるかに弱い（下記補正）' },
    { wavelengthNm: 605.0, relativeIntensity: 0.45, kind: 'molecular', species: 'SrOH', note: '[PYRO] 橙バンド（PLAN の「606 nm 付近」）' },
    { wavelengthNm: 623.9, relativeIntensity: 0.55, kind: 'molecular', species: 'SrCl', note: '[PYRO] SrCl 赤バンド' },
    { wavelengthNm: 636.0, relativeIntensity: 0.6, kind: 'molecular', species: 'SrCl', note: '[PYRO] SrCl 赤バンド' },
    { wavelengthNm: 661.9, relativeIntensity: 0.9, kind: 'molecular', species: 'SrCl', note: '[PYRO] 650–690 nm 帯の主頭' },
    { wavelengthNm: 674.5, relativeIntensity: 1.0, kind: 'molecular', species: 'SrCl', note: '[PYRO] 650–690 nm 帯の最強頭' },
    { wavelengthNm: 682.0, relativeIntensity: 0.5, kind: 'molecular', species: 'SrOH', note: '[PYRO] 650–690 nm 帯の長波長側' },
    { wavelengthNm: 689.259, relativeIntensity: 0.08, kind: 'atomic', species: 'Sr I', note: '[NIST] 弱い赤線' },
  ],
};

// ---------------------------------------------------------------------------
// リチウム — 深紅
// ---------------------------------------------------------------------------
// [NIST] Li I 670.776 / 670.791 nm 二重線（2s ²S – 2p ²P°、共鳴線、rel 3000）。
//        分離 0.015 nm は表示上ひとつの線として扱う。
//        610.365 nm（2p ²P° – 3d ²D）は桁違いに弱い。460.29 nm はさらに弱い。
// PLAN §3.2 の「670.8 nm（赤・強）、610.4 nm（橙・弱）」に一致。
// 深紅に見える物理的理由: 670.8 nm は視感度 V(λ) が 0.03 程度しかなく、
// 同じ放射パワーでも Sr の 600–680 nm 帯よりはるかに暗く、かつ極めて高彩度。
const LITHIUM: ElementSpectrum = {
  id: 'lithium',
  labelJa: 'リチウム',
  speechKana: 'リチウム',
  lines: [
    { wavelengthNm: 460.29, relativeIntensity: 0.0005, kind: 'atomic', species: 'Li I', note: '[NIST] 非常に弱い青線。炎温度ではほぼ励起されない' },
    { wavelengthNm: 610.365, relativeIntensity: 0.008, kind: 'atomic', species: 'Li I', note: '[NIST] 橙。下の「炎温度での補正」参照' },
    { wavelengthNm: 670.784, relativeIntensity: 1.0, kind: 'atomic', species: 'Li I', note: '[NIST] 670.776/670.791 二重線。共鳴線、rel 3000' },
    { wavelengthNm: 680.0, relativeIntensity: 0.03, kind: 'molecular', species: 'LiOH', note: '[PYRO] 弱い LiOH 帯' },
  ],
};

// ---------------------------------------------------------------------------
// ナトリウム — 黄（v2 用。PLAN §8）
// ---------------------------------------------------------------------------
// [NIST] Na I D2 588.995 nm / D1 589.592 nm。統計重率から強度比は約 2:1。
const SODIUM: ElementSpectrum = {
  id: 'sodium',
  labelJa: 'ナトリウム',
  speechKana: 'ナトリウム',
  lines: [
    { wavelengthNm: 588.995, relativeIntensity: 1.0, kind: 'atomic', species: 'Na I', note: '[NIST] D2 線' },
    { wavelengthNm: 589.592, relativeIntensity: 0.5, kind: 'atomic', species: 'Na I', note: '[NIST] D1 線。D2 の約 1/2' },
    { wavelengthNm: 568.82, relativeIntensity: 0.01, kind: 'atomic', species: 'Na I', note: '[NIST] 弱い緑' },
    { wavelengthNm: 615.42, relativeIntensity: 0.01, kind: 'atomic', species: 'Na I', note: '[NIST] 弱い橙' },
  ],
};

// ---------------------------------------------------------------------------
// バリウム — 緑（v2 用。PLAN §8）
// ---------------------------------------------------------------------------
// [NIST] Ba I 553.548 nm（rel 1000）が可視の主線。
// [PYRO] 緑花火の色は BaCl バンド（513–532 nm）。BaOH は 487 / 512 nm。
const BARIUM: ElementSpectrum = {
  id: 'barium',
  labelJa: 'バリウム',
  speechKana: 'バリウム',
  lines: [
    { wavelengthNm: 487.0, relativeIntensity: 0.2, kind: 'molecular', species: 'BaOH', note: '[PYRO] 青緑バンド' },
    { wavelengthNm: 513.9, relativeIntensity: 0.85, kind: 'molecular', species: 'BaCl', note: '[PYRO] 緑バンド主頭' },
    { wavelengthNm: 524.1, relativeIntensity: 1.0, kind: 'molecular', species: 'BaCl', note: '[PYRO] 緑バンド最強頭' },
    { wavelengthNm: 532.1, relativeIntensity: 0.7, kind: 'molecular', species: 'BaCl', note: '[PYRO] 緑バンド' },
    { wavelengthNm: 553.548, relativeIntensity: 0.4, kind: 'atomic', species: 'Ba I', note: '[NIST] rel 1000。緑の主原子線' },
  ],
};

/**
 * バーナーの素の炎（元素を入れていない状態）— 青。
 *
 * 予混合炭化水素炎の青は「熱放射」ではなく化学発光（chemiluminescence）:
 * [FLAME] CH* (A²Δ–X²Π) 431.4 nm が最強、CH* (B²Σ–X²Π) 390.0 nm、
 *         C2 Swan バンド Δv=+1 473.7 nm / Δv=0 516.5 nm / Δv=−1 563.5 nm。
 * これを基底色とする（PLAN §3.2「バーナーの素の炎は青（ガス炎）」）。
 */
export const BASE_GAS_FLAME_LINES: readonly EmissionLine[] = [
  { wavelengthNm: 390.0, relativeIntensity: 0.3, kind: 'molecular', species: 'CH* B–X', note: '[FLAME] 紫。視覚寄与は小さい' },
  { wavelengthNm: 431.4, relativeIntensity: 1.0, kind: 'molecular', species: 'CH* A–X', note: '[FLAME] 予混合炎の青の主因' },
  { wavelengthNm: 473.7, relativeIntensity: 0.35, kind: 'molecular', species: 'C2 Swan dv=+1', note: '[FLAME] 青緑' },
  { wavelengthNm: 516.5, relativeIntensity: 0.3, kind: 'molecular', species: 'C2 Swan dv=0', note: '[FLAME] 緑。内炎の緑がかりの原因' },
  { wavelengthNm: 563.5, relativeIntensity: 0.12, kind: 'molecular', species: 'C2 Swan dv=-1', note: '[FLAME] 黄緑、弱い' },
];

/**
 * 内炎（還元炎）の代表スペクトル。
 *
 * 予混合炎の内側の円錐は燃料過剰の還元帯で、C2 Swan バンドが相対的に強く、
 * CH* より緑〜青緑に寄って見える。BASE_GAS_FLAME_LINES と同じ発光種で、
 * 重みだけを Swan 側に寄せたもの。
 */
export const INNER_CONE_LINES: readonly EmissionLine[] = [
  { wavelengthNm: 431.4, relativeIntensity: 0.55, kind: 'molecular', species: 'CH* A-X', note: '[FLAME] 内炎でも存在するが相対的に弱い' },
  { wavelengthNm: 473.7, relativeIntensity: 0.8, kind: 'molecular', species: 'C2 Swan dv=+1', note: '[FLAME] 還元帯で強い' },
  { wavelengthNm: 516.5, relativeIntensity: 1.0, kind: 'molecular', species: 'C2 Swan dv=0', note: '[FLAME] 内炎の緑の主因' },
  { wavelengthNm: 563.5, relativeIntensity: 0.3, kind: 'molecular', species: 'C2 Swan dv=-1', note: '[FLAME] 黄緑' },
];

export const ELEMENT_SPECTRA: Readonly<Record<ElementId, ElementSpectrum>> = {
  copper: COPPER,
  strontium: STRONTIUM,
  lithium: LITHIUM,
  sodium: SODIUM,
  barium: BARIUM,
};

/** v1 で台に転がる材料（PLAN §3.2）。 */
export const V1_ELEMENTS: readonly ElementId[] = ['copper', 'strontium', 'lithium'];

export function getSpectrum(id: ElementId): ElementSpectrum {
  const s = ELEMENT_SPECTRA[id];
  if (!s) throw new Error(`unknown element: ${id}`);
  return s;
}

/** 総相対強度（= 総放射パワーの代理）。 */
export function totalIntensity(lines: readonly EmissionLine[]): number {
  let sum = 0;
  for (const l of lines) sum += l.relativeIntensity;
  return sum;
}

/** 総放射パワーが 1 になるように強度を正規化した線の配列を返す（純関数）。 */
export function normalizedLines(lines: readonly EmissionLine[]): EmissionLine[] {
  const total = totalIntensity(lines);
  if (!(total > 0)) throw new Error('spectrum has no radiant power');
  return lines.map((l) => ({ ...l, relativeIntensity: l.relativeIntensity / total }));
}

/**
 * 2 つのスペクトルを放射パワー空間で混合する（純関数）。
 *
 * 炎に元素を入れる現象は「ガス炎の発光に元素の発光が加算される」ことなので、
 * 色空間ではなくスペクトル空間で足すのが物理的に正しい。
 * 双方を総パワー 1 に正規化してから (1-mix) : mix で足す。
 *
 * @param mix 0 = a のみ, 1 = b のみ。範囲外は [0,1] にクランプ。
 */
export function blendSpectra(
  a: readonly EmissionLine[],
  b: readonly EmissionLine[],
  mix: number,
): EmissionLine[] {
  const t = Math.min(1, Math.max(0, mix));
  const out: EmissionLine[] = [];
  if (t < 1) {
    for (const l of normalizedLines(a)) {
      out.push({ ...l, relativeIntensity: l.relativeIntensity * (1 - t) });
    }
  }
  if (t > 0) {
    for (const l of normalizedLines(b)) {
      out.push({ ...l, relativeIntensity: l.relativeIntensity * t });
    }
  }
  return out;
}
