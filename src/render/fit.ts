import * as THREE from 'three';

export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** CSS の env(safe-area-inset-*) を読む。取得できなければ 0 */
export function readSafeInsets(): SafeInsets {
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string): number => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const out: SafeInsets = {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
    probe.remove();
    return out;
  } catch {
    return NO_INSETS;
  }
}

/** 盤面の外に必ず残す余白の割合(5.3: 最低 15%) */
export const MIN_MARGIN = 0.15;

export interface FitTarget {
  /** 収めたい対象のバウンディングボックス(世界座標) */
  readonly box: THREE.Box3;
  readonly width: number;
  readonly height: number;
  readonly insets: SafeInsets;
}

const CORNER = new THREE.Vector3();

/**
 * 正射影カメラを、対象が縦横どちらでも収まるように合わせる(5.3)。
 * - 余白は最低 15%
 * - safe area のインセット内側にだけ対象が来るよう、視錐台の中心をずらす
 */
export function fitOrthographic(camera: THREE.OrthographicCamera, target: FitTarget): void {
  const { box, insets } = target;
  const width = Math.max(1, target.width);
  const height = Math.max(1, target.height);

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length(), 1);

  // 固定アイソメ方向。距離は視野の外に出ないよう十分に取る
  const dir = new THREE.Vector3(1, 1, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, radius * 4);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  // 基準視錐台: 高さ半分を 1、幅はアスペクト比ぶん
  const halfH = 1;
  const halfW = width / height;

  // バウンディングボックスの 8 頂点をカメラ空間へ落として必要な範囲を測る
  let maxX = 1e-4;
  let maxY = 1e-4;
  const inv = camera.matrixWorldInverse;
  for (let i = 0; i < 8; i++) {
    CORNER.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    // カメラは center を見ているので、カメラ空間での center は (0, 0, -d)。
    // よって頂点の x / y の絶対値がそのまま必要な半径になる。
    CORNER.applyMatrix4(inv);
    maxX = Math.max(maxX, Math.abs(CORNER.x));
    maxY = Math.max(maxY, Math.abs(CORNER.y));
  }

  // safe area を除いた使用可能領域の割合
  const usableW = Math.max(0.2, (width - insets.left - insets.right) / width);
  const usableH = Math.max(0.2, (height - insets.top - insets.bottom) / height);

  const zoom = Math.min((halfW * usableW) / maxX, (halfH * usableH) / maxY) / (1 + MIN_MARGIN);
  camera.zoom = zoom;

  // 使用可能領域の中心へ寄せる(視錐台の中心を逆方向へずらす)
  const fx = (insets.left - insets.right) / 2 / width;
  const fy = (insets.top - insets.bottom) / 2 / height;
  const cx = (-fx * 2 * halfW) / zoom;
  const cy = (fy * 2 * halfH) / zoom;

  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.near = 0.01;
  camera.far = radius * 12;
  camera.updateProjectionMatrix();
}

/** resize / orientationchange を 150ms デバウンスして呼ぶ(5.3) */
export function onViewportChange(handler: () => void, delayMs = 150): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(handler, delayMs);
  };
  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('resize', fire);
    window.removeEventListener('orientationchange', fire);
  };
}
