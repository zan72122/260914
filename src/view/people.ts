/**
 * people.ts — 工房と港にいる人。顔は描かない（記号を置かない、PLAN §2-1）。
 *
 * 「何をしているか」は体の形と腕の動きだけで読めるようにする。
 *  - 呼んでいる人 … 腕を高く上げて振る
 *  - 手を差し出す人 … 腕を物の方へ水平に伸ばす
 *  - 済んだ人 … 腕を体の横に下ろす
 *
 * 体（`body`）と腕（`arm`）を別の Graphics に分け、腕だけを肩の位置で回す。
 */
import type { Graphics } from 'pixi.js';
import { shade } from './paint';

/** 呼んでいないときの腕の角度（体の横に下ろす）。 */
export const ARM_REST = 1.35;

export interface PersonSkin {
  skin: number;
  cloth: number;
  /** 沖の船の上など、逆光で影になる人は単色で描く */
  silhouette?: boolean;
}

/**
 * 人を一体組み立てる。u は「頭の大きさ」を決める基準寸法。
 * 原点は足元（立っている面）。
 */
export function buildPerson(body: Graphics, arm: Graphics, u: number, s: PersonSkin): void {
  const skin = s.silhouette ? s.cloth : s.skin;
  const cloth = s.cloth;
  const dark = shade(cloth, -0.35);
  const lit = shade(cloth, 0.14);

  body.clear();
  // 脚（少し開いて立つ）
  body.poly([-u * 0.52, -u * 1.05, -u * 0.08, -u * 1.05, -u * 0.12, 0, -u * 0.5, 0]).fill({ color: dark });
  body.poly([u * 0.08, -u * 1.05, u * 0.52, -u * 1.05, u * 0.5, 0, u * 0.12, 0]).fill({ color: dark });
  // 胴（肩が広く腰が細い）
  body
    .poly([
      -u * 0.72, -u * 2.05,
      u * 0.72, -u * 2.05,
      u * 0.52, -u * 0.95,
      -u * 0.52, -u * 0.95,
    ])
    .fill({ color: cloth });
  // 肩の上面に当たる光（立体に見せる最小限）
  if (!s.silhouette) {
    body.poly([-u * 0.72, -u * 2.05, u * 0.72, -u * 2.05, u * 0.6, -u * 1.78, -u * 0.6, -u * 1.78]).fill({ color: lit });
  }
  // 首と頭
  body.rect(-u * 0.16, -u * 2.28, u * 0.32, u * 0.3).fill({ color: shade(skin, -0.28) });
  body.circle(0, -u * 2.72, u * 0.52).fill({ color: skin });
  if (!s.silhouette) {
    // 髪（頭の上半分。顔の造作は描かない）
    body.circle(0, -u * 2.86, u * 0.5).fill({ color: 0x2b2118, alpha: 0.85 });
  }
  // 反対側の腕（動かさない方）は体に沿って下ろす
  body.poly([-u * 0.66, -u * 1.95, -u * 0.34, -u * 1.95, -u * 0.42, -u * 0.85, -u * 0.72, -u * 0.85]).fill({ color: dark });

  // 動く腕。肩を原点に、右へ伸びた形で描く（回すのは呼び出し側）
  arm.clear();
  arm.poly([0, -u * 0.2, u * 1.25, -u * 0.16, u * 1.25, u * 0.16, 0, u * 0.24]).fill({ color: cloth });
  arm.circle(u * 1.38, 0, u * 0.24).fill({ color: skin });
  arm.position.set(u * 0.6, -u * 1.9);
}

/** 腕を振る角度（上げて左右に振る）。 */
export function waveAngle(phase: number): number {
  return -1.15 + phase * 0.55;
}

/** 物の方へ手を差し出す角度（水平よりわずかに下）。 */
export const ARM_REACH = -0.12;
