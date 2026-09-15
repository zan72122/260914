import * as THREE from 'three';
import type { Tool, Vec2 } from '../core/types';
import { topYOf } from './tileMesh';
import { iconTexture } from './textures';

/** アイコンの当たり判定は見た目の 1.4 倍(5.2) */
export const HIT_SCALE = 1.4;
/**
 * アイコンの大きさ(タイル幅に対する割合)。
 * 下にあるカーブの形が読めるよう、タイル幅の 45% 程度に留める。
 */
const ICON_SIZE = 0.52;
/** アイコンの下に敷く円盤。岩や模様の上でもアイコンが読めるようにする(7.6) */
const PAD_SIZE = ICON_SIZE * 1.34;
/**
 * 当たり判定の板の一辺(タイル幅に対する割合)。アイコンより大きく取りたいので下限を 0.7 にする(5.2)。
 * 1.0 を超えると隣のタイルのツールと板が重なるため、ここは必ず 1 未満に保つ。
 */
export const HIT_SIZE = Math.max(ICON_SIZE * HIT_SCALE, 0.7);
/** 板を範囲の外周からどれだけ内側に留めるか。これが隣のツールとの隙間になる */
const HIT_INSET = (1 - HIT_SIZE) / 2;
/** 半透明オーバーレイの基準不透明度。道の向きが透けて見える濃さにする */
export const OVERLAY_OPACITY = 0.15;

interface Follower {
  readonly mesh: THREE.Mesh;
  /** タイル上面からの持ち上げ量 */
  readonly dy: number;
  /** 追従するセル。undefined なら範囲全体の最大高さに追従する */
  readonly cell?: Vec2;
}

export interface ToolOverlay {
  readonly group: THREE.Group;
  /** Raycaster の当たり判定に使う見えない板。ツール番号を userData に持つ */
  readonly hitPlanes: THREE.Mesh[];
  /** 押し込みアニメの対象(アイコン) */
  readonly icons: THREE.Mesh[];
  readonly overlayMats: THREE.MeshBasicMaterial[];
  /** ツールの中心(ワールド座標)。デバッグ用のタップ位置計算に使う */
  readonly center: THREE.Vector3;
  /** タイルの上下アニメに追従させる。liftAt はセルの現在の高さ(0..1) */
  syncHeights(liftAt: (cell: Vec2) => number): void;
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
const padGeo = new THREE.CircleGeometry(0.5, 24);

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
 *
 * - 範囲内の各タイルに半透明の暗いオーバーレイと白いアイコン
 * - 範囲「全体」を 1 つの白い点線枠で囲み、四隅に黒い丸(本家 2.5)
 * - 当たり判定は範囲全体(どのタイルを押しても効く)
 */
export function createToolOverlay(
  tool: Tool,
  toolIndex: number,
  liftAt: (cell: Vec2) => number,
): ToolOverlay {
  const group = new THREE.Group();
  const hitPlanes: THREE.Mesh[] = [];
  const icons: THREE.Mesh[] = [];
  const overlayMats: THREE.MeshBasicMaterial[] = [];
  const followers: Follower[] = [];

  const iconMap = iconTexture(tool.kind);

  for (const c of tool.cells) {
    // 半透明の暗いオーバーレイ
    const omat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: OVERLAY_OPACITY,
      depthWrite: false,
    });
    overlayMats.push(omat);
    const overlay = new THREE.Mesh(planeGeo, omat);
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(c.x, 0, c.y);
    overlay.renderOrder = 2;
    group.add(overlay);
    followers.push({ mesh: overlay, dy: 0.012, cell: c });

    // アイコンの下敷き(暗い円盤)。破壊アイコンが瓦礫に紛れないように
    const pad = new THREE.Mesh(
      padGeo,
      new THREE.MeshBasicMaterial({
        color: 0x14100c,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.scale.setScalar(PAD_SIZE);
    pad.position.set(c.x, 0, c.y);
    pad.renderOrder = 3;
    group.add(pad);
    followers.push({ mesh: pad, dy: 0.045, cell: c });

    // 白いアイコン
    const imat = new THREE.MeshBasicMaterial({ map: iconMap, transparent: true, depthWrite: false, depthTest: false });
    const icon = new THREE.Mesh(planeGeo, imat);
    icon.rotation.x = -Math.PI / 2;
    icon.scale.setScalar(ICON_SIZE);
    icon.position.set(c.x, 0, c.y);
    icon.renderOrder = 5;
    icons.push(icon);
    group.add(icon);
    // 瓦礫の上でも読めるのは depthTest を切っているため。
    // 位置はタイル中央のまま動かさない(3.3-(4) タップした場所 = 変化する場所)
    followers.push({ mesh: icon, dy: 0.05, cell: c });

  }

  // 範囲全体を 1 つの点線枠で囲み、四隅に黒い丸(本家 2.5)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of tool.cells) {
    minX = Math.min(minX, c.x - 0.5);
    maxX = Math.max(maxX, c.x + 0.5);
    minY = Math.min(minY, c.y - 0.5);
    maxY = Math.max(maxY, c.y + 0.5);
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
      if (horizontal) d.position.set(cx + pos, 0, cy + offset);
      else {
        d.rotation.z = Math.PI / 2;
        d.position.set(cx + offset, 0, cy + pos);
      }
      d.renderOrder = 3;
      group.add(d);
      followers.push({ mesh: d, dy: 0.03 });
    }
  };
  addDashedEdge(w, true, -(h / 2 - inset));
  addDashedEdge(w, true, h / 2 - inset);
  addDashedEdge(h, false, -(w / 2 - inset));
  addDashedEdge(h, false, w / 2 - inset);

  /**
   * 当たり判定の板(5.2)。範囲«全体»を 1 枚で覆う。
   *
   * タイルごとに置くと、2 タイル範囲の «まんなか»(タイルとタイルの境目)が
   * どちらの板にも入らない穴になる。1 枚で覆えば穴が無くなり、
   * 外周は 1 タイルの端から HIT_INSET だけ内側に留まるので、
   * 隣のタイルに載った別のツールの板とは重ならない。
   */
  const hit = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ visible: false }));
  hit.rotation.x = -Math.PI / 2;
  hit.scale.set(Math.max(0.2, w - HIT_INSET * 2), Math.max(0.2, h - HIT_INSET * 2), 1);
  hit.position.set(cx, 0, cy);
  hit.userData['toolIndex'] = toolIndex;
  hitPlanes.push(hit);
  group.add(hit);
  followers.push({ mesh: hit, dy: 0.06 });

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
    dot.position.set(cx + sx * (w / 2 - inset), 0, cy + sy * (h / 2 - inset));
    dot.renderOrder = 3;
    group.add(dot);
    followers.push({ mesh: dot, dy: 0.035 });
  }

  const cells = tool.cells;
  function syncHeights(fn: (cell: Vec2) => number): void {
    let maxLift = 0;
    for (const c of cells) maxLift = Math.max(maxLift, fn(c));
    const frameY = topYOf(maxLift);
    for (const f of followers) {
      f.mesh.position.y = (f.cell ? topYOf(fn(f.cell)) : frameY) + f.dy;
    }
  }
  syncHeights(liftAt);

  return {
    group,
    hitPlanes,
    icons,
    overlayMats,
    center: new THREE.Vector3(cx, 0, cy),
    syncHeights,
  };
}

/** 未使用ツールの明滅(1.5 秒周期の sine、7.4) */
export function pulseOverlay(ov: ToolOverlay, t: number, active: boolean): void {
  const base = OVERLAY_OPACITY;
  if (!active) {
    for (const m of ov.overlayMats) m.opacity = base;
    for (const icon of ov.icons) {
      const mat = icon.material as THREE.MeshBasicMaterial;
      mat.opacity = 1;
    }
    return;
  }
  const s = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
  for (const m of ov.overlayMats) m.opacity = base + s * 0.12;
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
