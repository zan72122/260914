/** 汽車ループ: 角丸の線路、8 つのソケット、棒の上の楽器、トンネル。 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, Vector3, TubeGeometry, CatmullRomCurve3 } from 'three';
import { type Layer, type Placement, STEPS, PITCHES, INSTRUMENT_KIND, type LevelKind } from '../../app/state';
import { RoundedLoop } from '../path';
import { LevelView, type HitFn } from './LevelView';
import { mat } from '../materials';
import { buildTree, buildHouse, buildSnowman } from '../builders/decor';

const HW = 4.2, HD = 2.9, R = 1.6;
const SOCKET_OFFSET = 0.95;

export function slotS(loopLen: number, i: number): number { return ((i + 0.5) / STEPS) * loopLen; }

export class TrainLevel extends LevelView {
  readonly kind: LevelKind = 'train';
  readonly path = new RoundedLoop(0, 0, HW, HD, R, 0.12);
  allowsPitchDrag = true;
  private poles = new Map<string, Mesh>();

  build(layer: Layer): void {
    this.layer = layer;
    this.board(HW * 2 + 3.6, HD * 2 + 3.6);
    this.roundedPlane(HW * 2 - 0.9, HD * 2 - 0.9, R - 0.45, this.theme.lawn, 0.01);
    this.drawLoop();
    // ソケット
    for (let i = 0; i < STEPS; i++) {
      const p = this.socketPos(i);
      const socket = new Mesh(new CylinderGeometry(0.4, 0.4, 0.1, 16), mat(this.theme.boardSide));
      socket.position.set(p.x, 0.0, p.z);
      socket.receiveShadow = true;
      this.root.add(socket);
      const hole = new Mesh(new CylinderGeometry(0.22, 0.22, 0.12, 12), mat('#2b1d12', { flat: false }));
      hole.position.set(p.x, 0.02, p.z);
      this.root.add(hole);
      this.marker(i, 0, new Vector3(p.x, 0.09, p.z), 0.5);
    }
    // 飾り
    const spots: [number, number][] = [[-2.2, -1.4], [1.8, -0.9], [-1.5, 1.2], [2.3, 1.4]];
    spots.forEach(([x, z], i) => {
      const d = i === 1 ? buildHouse(this.theme) : this.theme.snow && i === 3 ? buildSnowman() : buildTree(this.theme, 0.9 + (i % 2) * 0.2);
      d.position.set(x, 0.02, z);
      this.root.add(d);
    });
    this.placeTunnel(0);
    this.syncPlacements(layer);
  }

  private drawLoop(): void {
    const pts: Vector3[] = [];
    for (let i = 0; i < 96; i++) pts.push(this.path.pointAt(i / 96).pos);
    const curve = new CatmullRomCurve3(pts, true);
    const bed = new Mesh(new TubeGeometry(curve, 128, 0.45, 6, true), mat('#d9c39a'));
    bed.scale.y = 0.15; bed.position.y = 0.0; bed.receiveShadow = true;
    this.root.add(bed);
    for (const off of [-0.22, 0.22]) {
      const rp: Vector3[] = [];
      for (let i = 0; i < 96; i++) { const p = this.path.pointAt(i / 96); rp.push(p.pos.clone().addScaledVector(p.normal, off)); }
      const rail = new Mesh(new TubeGeometry(new CatmullRomCurve3(rp, true), 128, 0.04, 5, true), mat('#5c3a1a'));
      rail.position.y = 0.04;
      this.root.add(rail);
    }
    const nTies = STEPS * 4;
    for (let i = 0; i < nTies; i++) {
      const p = this.path.pointAt((i + 0.5) / nTies);
      const tie = new Mesh(new BoxGeometry(0.16, 0.06, 0.7), mat('#a9835a'));
      tie.position.copy(p.pos).setY(0.03);
      tie.rotation.y = Math.atan2(-p.tan.z, p.tan.x);
      this.root.add(tie);
    }
    // 太い枕木(拍の目印)
    for (let i = 0; i < STEPS; i++) {
      const p = this.path.pointAtLength(slotS(this.path.length, i));
      const tie = new Mesh(new BoxGeometry(0.26, 0.09, 0.9), mat('#8b5a2b'));
      tie.position.copy(p.pos).setY(0.03);
      tie.rotation.y = Math.atan2(-p.tan.z, p.tan.x);
      this.root.add(tie);
    }
  }

  private socketPos(i: number): Vector3 {
    const p = this.path.pointAtLength(slotS(this.path.length, i));
    return p.pos.clone().addScaledVector(p.normal, SOCKET_OFFSET).setY(0);
  }

  allTargets() { return Array.from({ length: STEPS }, (_, i) => ({ slot: i, pitch: 0 })); }

  /** 置き先はソケット。pitch は棒の高さに変換される */
  targetPos(slot: number, pitch: number): Vector3 {
    const p = this.socketPos(slot);
    const local = new Vector3(p.x, this.topY(pitch, 'melody'), p.z);
    return this.root.localToWorld(local);
  }

  private topY(pitch: number, kind: 'perc' | 'melody'): number {
    return kind === 'perc' ? 0.08 : 0.35 + pitch * 0.32;
  }

  protected override positionPlacement(group: Group, hit: Mesh, p: Placement): void {
    const s = this.socketPos(p.slot);
    const kind = INSTRUMENT_KIND[p.inst];
    const y = this.topY(p.pitch, kind);
    group.position.set(s.x, y, s.z);
    hit.position.set(s.x, y + 0.45, s.z);
    const k = `${p.slot}:${p.pitch}`;
    if (kind === 'melody') {
      const pole = new Mesh(new CylinderGeometry(0.06, 0.07, y, 8), mat('#b08a5c'));
      pole.position.set(s.x, y / 2, s.z);
      pole.castShadow = true;
      this.root.add(pole);
      this.poles.set(k, pole);
      // 目盛り(上に行けることを示す)
      for (let q = p.pitch + 1; q < PITCHES; q++) {
        const dot = new Mesh(new CylinderGeometry(0.09, 0.09, 0.04, 8), mat('#8b5a2b'));
        dot.position.set(s.x, this.topY(q, 'melody'), s.z);
        pole.attach(dot);
      }
    }
  }

  override syncPlacements(layer: Layer): void {
    for (const pole of this.poles.values()) this.root.remove(pole);
    this.poles.clear();
    super.syncPlacements(layer);
  }

  protected updateKind(_phase: number, _time: number, _hit: HitFn): void { /* 汽車自体が拍の見える化 */ }
}
