/**
 * 月の大きさ → 海面の高さ。
 * 月が小さいほど潮が引く。柱(底 0.2, 先端 0.55)は
 * 初期状態(月=1.0 → 海面 0.74)では隠れていて、月 ≈0.5 以下で全部出る。
 */
export const SEA_MIN = 0.25;
export const SEA_MAX = 1.4;

export function seaLevelFor(moonScale: number): number {
  const t = (moonScale - 0.4) / 1.6;
  return SEA_MIN + (SEA_MAX - SEA_MIN) * t;
}
