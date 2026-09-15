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
/** 地図画面の余白。島を大きく見せたいので盤面より詰める */
export const MAP_MARGIN = 0.08;

/**
 * 固定アイソメの視線方向(5.3)。カメラは必ずこの向きから見る。
 */
export const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();
/**
 * 画面の右方向・上方向に対応するワールドのベクトル。
 * カメラの向きが固定なので定数でよい。
 *
 *   画面右 = (x - z) / √2
 *   画面上 = (-x + 2y - z) / √6
 *
 * 「ワールド座標を EX / EY 方向へ動かすと、画面上を真横 / 真上に同じ長さだけ動く」
 * という性質を使って、画面の形に合わせた配置を組み立てる(地図画面の縦横切り替え)。
 */
export const ISO_EX = new THREE.Vector3(1, 0, -1).normalize();
export const ISO_EY = new THREE.Vector3(-1, 2, -1).normalize();

/**
 * カメラに収めたい範囲。
 * 中心はワールド座標、広さは「画面に投影したときの」半径(横 / 縦)で持つ。
 *
 * ワールドの直方体で持つと、アイソメでは枠の縦横比が必ず √3 : 1 に固定されてしまい、
 * 縦長の画面で上下が大きく余る。投影後の広さで持てば、縦に並べた配置は縦長の枠になる。
 */
export interface Frame {
  readonly center: THREE.Vector3;
  readonly halfX: number;
  readonly halfY: number;
}

const V = new THREE.Vector3();

/** 画面上の位置(横, 縦)。origin からの相対で測る */
function screenOf(p: THREE.Vector3, origin: THREE.Vector3): { sx: number; sy: number } {
  V.copy(p).sub(origin);
  return { sx: V.dot(ISO_EX), sy: V.dot(ISO_EY) };
}

/** 点群がちょうど収まる枠 */
export function frameFromPoints(points: readonly THREE.Vector3[]): Frame {
  const origin = points[0] ?? new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const s = screenOf(p, origin);
    minX = Math.min(minX, s.sx);
    maxX = Math.max(maxX, s.sx);
    minY = Math.min(minY, s.sy);
    maxY = Math.max(maxY, s.sy);
  }
  if (!Number.isFinite(minX)) return { center: origin.clone(), halfX: 1, halfY: 1 };
  const center = origin
    .clone()
    .addScaledVector(ISO_EX, (minX + maxX) / 2)
    .addScaledVector(ISO_EY, (minY + maxY) / 2);
  return {
    center,
    halfX: Math.max(1e-3, (maxX - minX) / 2),
    halfY: Math.max(1e-3, (maxY - minY) / 2),
  };
}

const CORNER = new THREE.Vector3();

/** 直方体がちょうど収まる枠(盤面はこちらで指定する) */
export function frameFromBox(box: THREE.Box3): Frame {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    CORNER.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    pts.push(CORNER.clone());
  }
  return frameFromPoints(pts);
}

/** 枠を a から b へ補間する(カメラ移動のトゥイーン) */
export function lerpFrame(a: Frame, b: Frame, t: number): Frame {
  return {
    center: a.center.clone().lerp(b.center, t),
    halfX: a.halfX + (b.halfX - a.halfX) * t,
    halfY: a.halfY + (b.halfY - a.halfY) * t,
  };
}

/** 枠を一回り広げる(地図へ引くときなど) */
export function expandFrame(frame: Frame, scale: number): Frame {
  return { center: frame.center.clone(), halfX: frame.halfX * scale, halfY: frame.halfY * scale };
}

export interface FitTarget {
  readonly frame: Frame;
  readonly width: number;
  readonly height: number;
  readonly insets: SafeInsets;
  /** 対象の外に残す余白の割合。既定は 15%(5.3) */
  readonly margin?: number;
}

/**
 * 正射影カメラを、対象が縦横どちらでも収まるように合わせる(5.3)。
 * - 余白は margin(既定 15%、地図画面は 8%)
 * - safe area のインセット内側にだけ対象が来るよう、視錐台の中心をずらす
 */
export function fitOrthographic(camera: THREE.OrthographicCamera, target: FitTarget): void {
  const { frame, insets } = target;
  const width = Math.max(1, target.width);
  const height = Math.max(1, target.height);
  const margin = target.margin ?? MIN_MARGIN;

  const radius = Math.max(frame.halfX, frame.halfY, 1);
  camera.position.copy(frame.center).addScaledVector(ISO_DIR, radius * 4 + 20);
  camera.up.set(0, 1, 0);
  camera.lookAt(frame.center);
  camera.updateMatrixWorld(true);

  // 基準視錐台: 高さ半分を 1、幅はアスペクト比ぶん
  const halfH = 1;
  const halfW = width / height;

  // safe area を除いた使用可能領域の割合(5.4)
  const usableW = Math.max(0.2, (width - insets.left - insets.right) / width);
  const usableH = Math.max(0.2, (height - insets.top - insets.bottom) / height);

  const zoom = Math.min((halfW * usableW) / frame.halfX, (halfH * usableH) / frame.halfY) / (1 + margin);
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
  camera.far = radius * 12 + 200;
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
