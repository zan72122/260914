/** レベル形式ごとの差を閉じ込める共通 interface と土台。 */
import { Group, Mesh, BoxGeometry, Vector3, Box3, Object3D, ShapeGeometry, Shape, CircleGeometry } from 'three';
import type { Layer, Placement, LevelKind } from '../../app/state';
import type { Path } from '../path';
import { mat, glow } from '../materials';
import type { Theme } from '../themes';
import { Tunnel } from '../builders/tunnel';
import { buildInstrument, applyBounce } from '../builders/instruments';
import { makeHit } from '../picker';

export interface DropTarget { slot: number; pitch: number; pos: Vector3 }

export type HitFn = (slot: number, pitch: number) => number;

export const key = (slot: number, pitch: number) => `${slot}:${pitch}`;

export abstract class LevelView {
  readonly root = new Group();
  abstract readonly kind: LevelKind;
  /** 汽車の経路(ループ or 側線) */
  abstract readonly path: Path;
  /** 側線での停車位置(弧長)。汽車ループでは未使用 */
  parkS = 0;
  /** トンネルの位置(弧長)。汽車がここに達すると次へ */
  tunnelS = 0;
  tunnel: Tunnel;
  /** 持ち運び中の楽器を浮かべる高さ */
  dragY = 1.2;
  /** 汽車ループだけ true(棒で音程を変える) */
  allowsPitchDrag = false;
  protected placed = new Map<string, { group: Group; hit: Mesh; p: Placement }>();
  protected markers = new Map<string, Mesh>();
  protected hits = new Group();
  layer!: Layer;

  constructor(readonly theme: Theme) {
    this.tunnel = new Tunnel(theme.boardSide);
    this.root.add(this.hits);
  }

  /** 台(木の板)。上面が y=0 */
  private boardBox = new Box3(new Vector3(-5, -1, -4), new Vector3(5, 3, 4));

  protected board(w: number, d: number, color = this.theme.board, side = this.theme.boardSide): Mesh {
    this.boardBox = new Box3(new Vector3(-w / 2, -0.9, -d / 2), new Vector3(w / 2, 2.6, d / 2));
    const top = new Mesh(new BoxGeometry(w, 0.25, d), mat(color));
    top.position.y = -0.125;
    top.receiveShadow = true;
    const base = new Mesh(new BoxGeometry(w, 0.6, d), mat(side));
    base.position.y = -0.55;
    base.receiveShadow = true;
    top.add(base);
    this.root.add(top);
    return top;
  }

  /** 空き置き先の印(薄い円)。持ち上げ中に脈打たせる */
  protected marker(slot: number, pitch: number, pos: Vector3, r = 0.42, normal?: Vector3): Mesh {
    const m = new Mesh(new CircleGeometry(r, 20), glow('#fff6c8', 0.0));
    m.position.copy(pos);
    if (normal) m.lookAt(pos.clone().add(normal)); else m.rotation.x = -Math.PI / 2;
    this.root.add(m);
    this.markers.set(key(slot, pitch), m);
    return m;
  }

  /** 角丸長方形の平面(芝生など) */
  protected roundedPlane(w: number, d: number, r: number, color: string, y: number, x = 0, z = 0): Mesh {
    const s = new Shape();
    const hw = w / 2, hd = d / 2;
    s.moveTo(-hw + r, -hd);
    s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
    s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
    s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r);
    s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const m = new Mesh(new ShapeGeometry(s, 6), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  /** レベルの内容を作る(台・置き先・トンネル)。派生クラスで実装 */
  abstract build(layer: Layer): void;

  /** 置き先の位置(ワールド)。派生クラスで実装 */
  abstract targetPos(slot: number, pitch: number): Vector3;
  /** 置き先の姿勢(楽器の up 方向)。既定は上向き */
  targetUp(_slot: number, _pitch: number): Vector3 { return new Vector3(0, 1, 0); }
  /** 置き先が今見えていて置けるか(オルゴールの裏側など) */
  targetVisible(_slot: number, _pitch: number): boolean { return true; }
  /** 全置き先の列挙 */
  abstract allTargets(): { slot: number; pitch: number }[];

  /** 空いている置き先 */
  dropTargets(): DropTarget[] {
    return this.allTargets()
      .filter(({ slot, pitch }) => !this.placed.has(key(slot, pitch)) && this.targetVisible(slot, pitch) && this.canPlace(slot, pitch))
      .map(({ slot, pitch }) => ({ slot, pitch, pos: this.targetPos(slot, pitch) }));
  }

  protected canPlace(_slot: number, _pitch: number): boolean { return true; }

  /** 楽器の配置を反映する(差分ではなく作り直し。配置数は少ない) */
  syncPlacements(layer: Layer): void {
    this.layer = layer;
    for (const { group, hit } of this.placed.values()) { this.root.remove(group); this.hits.remove(hit); }
    this.placed.clear();
    for (const p of layer.placements) {
      const group = buildInstrument(p.inst);
      group.scale.setScalar(this.instrumentScale());
      this.root.add(group);
      const hit = makeHit(0.65, { kind: 'placement', slot: p.slot, pitch: p.pitch });
      this.hits.add(hit);
      this.placed.set(key(p.slot, p.pitch), { group, hit, p });
      this.positionPlacement(group, hit, p);
    }
  }

  protected instrumentScale(): number { return 1; }

  /** 楽器を置き先に座らせる(派生で棒などを足す) */
  protected positionPlacement(group: Group, hit: Mesh, p: Placement): void {
    const pos = this.targetPos(p.slot, p.pitch);
    const up = this.targetUp(p.slot, p.pitch);
    group.position.copy(this.root.worldToLocal(pos.clone()));
    group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    hit.position.copy(group.position).addScaledVector(up, 0.45 * this.instrumentScale());
  }

  /** 配置済み楽器のワールド位置(飛び乗り演出・試し鳴らしの出発点) */
  placementWorldPos(p: Placement): Vector3 {
    const e = this.placed.get(key(p.slot, p.pitch));
    return e ? e.group.getWorldPosition(new Vector3()) : this.targetPos(p.slot, p.pitch);
  }

  /** 毎フレーム: 拍の見える化と跳ね。highlight は持ち上げ中の最寄り置き先 */
  update(phase: number, time: number, hit: HitFn, dragging: boolean, highlight: DropTarget | null, landing: (slot: number, pitch: number) => number): void {
    for (const e of this.placed.values()) {
      const land = landing(e.p.slot, e.p.pitch);
      applyBounce(e.group, land < 1 ? land : hit(e.p.slot, e.p.pitch), this.instrumentScale());
    }
    const free = new Set(this.dropTargets().map((t) => key(t.slot, t.pitch)));
    for (const [k, m] of this.markers) {
      const mat = m.material as { opacity: number };
      if (!dragging || !free.has(k)) { mat.opacity = 0; continue; }
      const strong = highlight && key(highlight.slot, highlight.pitch) === k;
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      mat.opacity = strong ? 0.85 : 0.18 + pulse * 0.25;
      m.scale.setScalar(strong ? 1.1 + pulse * 0.15 : 1);
    }
    this.updateKind(phase, time, hit);
  }

  protected abstract updateKind(phase: number, time: number, hit: HitFn): void;

  /** 当たり判定の根 */
  hitRoots(): Object3D[] { return [this.hits, this.tunnel.group]; }

  /** カメラ合わせ用の枠。側線の張り出しやトンネルは含めない(端が少し切れてもよい) */
  bounds(): Box3 { return this.boardBox.clone(); }

  /** トンネルを経路上の弧長 s に置く */
  protected placeTunnel(s: number): void {
    this.tunnelS = s;
    const p = this.path.pointAtLength(s);
    this.tunnel.group.position.copy(p.pos);
    this.tunnel.group.lookAt(p.pos.clone().add(p.tan));
    this.tunnel.group.add(makeHit(1.4, { kind: 'door' }, 0, 0.6, 0));
    this.root.add(this.tunnel.group);
  }

  /** 側線(直線の線路)を描く */
  protected drawStraightTrack(x0: number, x1: number, z: number, y = 0): void {
    const len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    // 台の外に出る分も支える木の桟橋
    const plank = new Mesh(new BoxGeometry(len, 0.3, 1.3), mat(this.theme.boardSide));
    plank.position.set(cx, y - 0.15, z); plank.receiveShadow = true; plank.castShadow = true;
    this.root.add(plank);
    const bed = new Mesh(new BoxGeometry(len, 0.08, 0.9), mat('#d9c39a'));
    bed.position.set(cx, y + 0.04, z); bed.receiveShadow = true;
    this.root.add(bed);
    const ties = Math.floor(len / 0.5);
    for (let i = 0; i < ties; i++) {
      const t = new Mesh(new BoxGeometry(0.16, 0.06, 0.7), mat('#a9835a'));
      t.position.set(x0 + (i + 0.5) * (len / ties) * Math.sign(x1 - x0), y + 0.1, z);
      this.root.add(t);
    }
    for (const side of [-0.22, 0.22]) {
      const rail = new Mesh(new BoxGeometry(len, 0.06, 0.06), mat('#5c3a1a'));
      rail.position.set(cx, y + 0.15, z + side);
      this.root.add(rail);
    }
  }
}
