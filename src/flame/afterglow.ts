/**
 * afterglow.ts — 材料が炎から出た後の余熱発光（純関数のみ、依存ゼロ）
 *
 * PLAN §3.3 / §7:
 *   「材料は炎から出た後も約 3 秒、その色で余熱発光する
 *     （許容した乖離。運搬中に色を見せるため）」
 *
 * 現実との関係:
 *   本物の炎色反応は、材料が炎から離れれば数十 ms で消える。発光の原因は
 *   炎の熱で励起された原子・分子であり、材料自体は光らない。
 *   ここでの余熱発光は「運んでいる間も何を持っているか色で分かる」ために
 *   意図的に入れた乖離であり、ユーザー承認済み（PLAN §7）。
 *   ただし乖離を最小にするため、
 *     - 色相は炎の中と同じ（= その元素の本物の色）を保ち、
 *     - 明るさだけを単調に落として 3.0 秒でちょうど 0 にする。
 *   色を作り変えることはしない。
 *
 * 減衰モデル:
 *   小さな粒の冷却はニュートン冷却に近く、放射は指数的に弱まる。
 *   そこで指数減衰 exp(-t/τ) を使い、τ = duration / 2 = 1.5 秒とする。
 *   そのままだと 3 秒でちょうど 0 にならない（exp(-2) ≈ 0.135 が残る）ので、
 *   末尾の値を引いて [0,1] に貼り直す。
 *   結果は t=0 で 1、t=duration でちょうど 0、その間は常に単調減少。
 *   半減期は約 0.98 秒。運びながら色を確かめるには十分な長さで、
 *   かつ「消えていく」ことが目に見える速さになっている。
 */

/** PLAN §3.3 の「約 3 秒」。 */
export const AFTERGLOW_DURATION_SECONDS = 3.0;

/** 時定数は継続時間の 1/2。t=duration の生値 exp(-2) ≈ 0.135 を差し引いて 0 に合わせる。 */
export const AFTERGLOW_TAU_RATIO = 0.5;

/**
 * 余熱発光の強さ 0..1。
 *
 * - elapsedSeconds <= 0 → 1（炎から出た瞬間）
 * - elapsedSeconds >= duration → 0（ちょうど 0。にじみ残りを作らない）
 * - その間は狭義単調減少
 *
 * 純関数。時間は必ず GameClock 由来の秒を渡すこと（壁時計は使わない。PLAN §4）。
 */
export function afterglowIntensity(
  elapsedSeconds: number,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): number {
  if (!Number.isFinite(elapsedSeconds)) return 0;
  if (!(durationSeconds > 0)) return 0;
  if (elapsedSeconds <= 0) return 1;
  if (elapsedSeconds >= durationSeconds) return 0;

  const tau = durationSeconds * AFTERGLOW_TAU_RATIO;
  const tail = Math.exp(-durationSeconds / tau);
  const raw = Math.exp(-elapsedSeconds / tau);
  const value = (raw - tail) / (1 - tail);
  return Math.min(1, Math.max(0, value));
}

/** 強さが 0.5 を切るまでの秒数（テスト・調整用）。 */
export function afterglowHalfLifeSeconds(
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): number {
  const tau = durationSeconds * AFTERGLOW_TAU_RATIO;
  const tail = Math.exp(-durationSeconds / tau);
  // (exp(-t/τ) - tail) / (1 - tail) = 0.5
  return -tau * Math.log(0.5 * (1 - tail) + tail);
}

/** 余熱発光中かどうか。 */
export function isAfterglowing(
  elapsedSeconds: number,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): boolean {
  return afterglowIntensity(elapsedSeconds, durationSeconds) > 0;
}

/**
 * 余熱発光の残り時間 [ms]。__fire.state() の held.afterglowMs（PLAN §5.2）に渡す想定。
 * 炎の中にいる間は呼ばない（呼ぶ側が inFlame を見て分岐する）。
 */
export function afterglowRemainingMs(
  elapsedSeconds: number,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): number {
  const remaining = durationSeconds - Math.max(0, elapsedSeconds);
  return Math.max(0, Math.round(remaining * 1000));
}

/**
 * 余熱発光の状態。小さな不変オブジェクト。保持は呼び出し側の責任。
 * element が null なら何も光っていない。
 */
export interface AfterglowState<TElement extends string = string> {
  readonly element: TElement | null;
  /** 炎から出てからの経過秒。 */
  readonly elapsedSeconds: number;
  /** 0..1。 */
  readonly intensity: number;
}

export const NO_AFTERGLOW: AfterglowState = { element: null, elapsedSeconds: 0, intensity: 0 };

/** 材料が炎から出た瞬間の状態を作る。 */
export function startAfterglow<TElement extends string>(
  element: TElement,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): AfterglowState<TElement> {
  return { element, elapsedSeconds: 0, intensity: afterglowIntensity(0, durationSeconds) };
}

/**
 * dt 秒進める。強さが 0 になったら element を null に落として掃除する。
 * 純関数（新しいオブジェクトを返す）。
 */
export function advanceAfterglow<TElement extends string>(
  state: AfterglowState<TElement>,
  dtSeconds: number,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): AfterglowState<TElement> {
  if (state.element === null) return state;
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
  const elapsed = state.elapsedSeconds + dt;
  const intensity = afterglowIntensity(elapsed, durationSeconds);
  if (intensity <= 0) {
    return NO_AFTERGLOW as AfterglowState<TElement>;
  }
  return { element: state.element, elapsedSeconds: elapsed, intensity };
}

/**
 * 余熱発光の線形 sRGB。色相は炎の中と同一、明るさだけ落とす。
 * elementLinearRGB には color.ts の FlameColor.linear を渡す。
 */
export function afterglowLinearRGB(
  elementLinearRGB: readonly [number, number, number],
  elapsedSeconds: number,
  durationSeconds: number = AFTERGLOW_DURATION_SECONDS,
): [number, number, number] {
  const k = afterglowIntensity(elapsedSeconds, durationSeconds);
  return [elementLinearRGB[0] * k, elementLinearRGB[1] * k, elementLinearRGB[2] * k];
}
