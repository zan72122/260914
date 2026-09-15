import * as THREE from 'three';
import type { Tile, Tool, Vec2 } from '../core/types';
import { STEP_HEIGHT, TILE_THICKNESS } from './tileMesh';
import { iconTexture } from './textures';

/** アイコンの当たり判定は見た目の 1.4 倍(5.2) */
export const HIT_SCALE = 1.4;
const ICON_SIZE = 0.62;

export interface ToolOverlay {
  readonly group: THREE.Group;
  /** Raycaster の当たり判定に使う見えない板。ツール番号を userData に持つ */
  readonly hitPlanes: THREE.Mesh[];
  /** 押し込みアニメの対象(アイコン) */
  readonly icons: THREE.Mesh[];
  readonly overlayMats: THREE.MeshBasicMaterial[];
}

const planeGeo = new THREE.PlaneGeometry(1, 1);

function cellTopY(tile: Tile | undefined): number {
  return (tile?.height ?? 0) * STEP_HEIGHT + TILE_THICKNESS;
}

/** 点線枠の破線 1 本分 */
function dash(len: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(len, 0.045);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * ツール範囲の表示(4.2 共通表示 / G3)。
 * 半透明の暗いオーバーレイ 0.25 + 白い点線枠 + 四隅の黒い丸 + 中央の白いアイコン。
 */
export function createToolOverlay(tool: Tool, toolIndex: number, tileAtFn: (p: Vec2) => Tile | undefined): ToolOverlay {
  const group = new THREE.Group();
  const hitPlanes: THREE.Mesh[] = [];
  const icons: THREE.Mesh[] = [];
  const overlayMats: THREE.MeshBasicMaterial[] = [];

  const iconMap = iconTexture(tool.kind);

  for (const c of tool.cells) {
    const y = cellTopY(tileAtFn(c));

    // 半透明の暗いオーバーレイ
    const omat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    overlayMats.push(omat);
    const overlay = new THREE.Mesh(planeGeo, omat);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(c.x, y + 0.012, c.y);
    overlay.renderOrder = 2;
    group.add(overlay);

    // 白いアイコン
    const imat = new THREE.MeshBasicMaterial({ map: iconMap, transparent: true, depthWrite: false, depthTest: false });
    const icon = new THREE.Mesh(planeGeo, imat);
    icon.rotation.x = -Math.PI / 2;
    icon.scale.setScalar(ICON_SIZE);
    icon.position.set(c.x, y + 0.05, c.y);
    icon.renderOrder = 4;
    icons.push(icon);
    group.add(icon);

    // 当たり判定用の見えない板(5.2)
    const hit = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.x = -Math.PI / 2;
    hit.scale.setScalar(ICON_SIZE * HIT_SCALE);
    hit.position.set(c.x, y + 0.06, c.y);
    hit.userData['toolIndex'] = toolIndex;
    hitPlanes.push(hit);
    group.add(hit);
  }

  // 範囲の外周に白い点線枠 + 四隅の黒い丸
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let frameY = 0;
  for (const c of tool.cells) {
    minX = Math.min(minX, c.x - 0.5);
    maxX = Math.max(maxX, c.x + 0.5);
    minY = Math.min(minY, c.y - 0.5);
    maxY = Math.max(maxY, c.y + 0.5);
    frameY = Math.max(frameY, cellTopY(tileAtFn(c)));
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const inset = 0.06;

  const addDashedEdge = (len: number, horizontal: boolean, offset: number): void => {
    const dashLen = 0.12;
    const gap = 0.09;
    const usable = len - inset * 2;
    const n = Math.max(2, Math.round(usable / (dashLen + gap)));
    const step = usable / n;
    for (let i = 0; i < n; i++) {
      const pos = -usable / 2 + step * (i + 0.5);
      const d = dash(Math.min(dashLen, step * 0.7));
      if (horizontal) d.position.set(cx + pos, frameY + 0.03, cy + offset);
      else {
        d.rotation.z = Math.PI / 2;
        d.position.set(cx + offset, frameY + 0.03, cy + pos);
      }
      d.renderOrder = 3;
      group.add(d);
    }
  };
  addDashedEdge(w, true, -(h / 2 - inset));
  addDashedEdge(w, true, h / 2 - inset);
  addDashedEdge(h, false, -(w / 2 - inset));
  addDashedEdge(h, false, w / 2 - inset);

  const dotGeo = new THREE.CircleGeometry(0.075, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x14100c, depthWrite: false });
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(cx + sx * (w / 2 - inset), frameY + 0.035, cy + sy * (h / 2 - inset));
    dot.renderOrder = 3;
    group.add(dot);
  }

  return { group, hitPlanes, icons, overlayMats };
}

/** 未使用ツールの明滅(1.5 秒周期の sine、7.4) */
export function pulseOverlay(ov: ToolOverlay, t: number, active: boolean): void {
  const base = 0.25;
  if (!active) {
    for (const m of ov.overlayMats) m.opacity = base;
    return;
  }
  const s = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
  for (const m of ov.overlayMats) m.opacity = base + s * 0.18;
  for (const icon of ov.icons) {
    const mat = icon.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.75 + s * 0.25;
    mat.transparent = true;
  }
}

/** タップ時の押し込みアニメ(3.3-(6): 100ms 以内に必ず動く) */
export function pressOverlay(ov: ToolOverlay, amount: number): void {
  for (const icon of ov.icons) icon.scale.setScalar(ICON_SIZE * (1 - 0.18 * amount));
}
