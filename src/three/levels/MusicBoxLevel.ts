/** オルゴール台: 回転する円筒にピンを差す。上端の櫛で鍵盤が沈み、後ろのパイプが光る。 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, Vector3 } from 'three';
import { type Layer, type Placement, STEPS, PITCHES, type LevelKind } from '../../app/state';
import { LinePath } from '../path';
import { LevelView, type HitFn, key } from './LevelView';
import { mat, PALETTE } from '../materials';

const RADIUS = 1.7, LEN = 7.4, AXIS_Y = 2.5;
const KEY_X0 = -(PITCHES - 1) / 2 * 1.4;
const SIDING_Z = 4.6;

/** ピン i(列)のローカル角。φ = π/2 - (i+0.5)/STEPS · 2π。回転 −phase·2π で上端(π/2)に来る */
function localAngle(slot: number): number { return Math.PI / 2 - ((slot + 0.5) / STEPS) * Math.PI * 2; }

export class MusicBoxLevel extends LevelView {
  readonly kind: LevelKind = 'musicbox';
  readonly path = new LinePath(-7.5, 5.2, SIDING_Z, 0.12);
  parkS = 6.5;
  dragY = 3.2;
  private drum = new Group();
  private keys: Mesh[] = [];
  private pipes: Mesh[] = [];
  private phase = 0;

  build(layer: Layer): void {
    this.layer = layer;
    this.board(11.5, 9.6);
    // 円筒(軸は x)
    const cyl = new Mesh(new CylinderGeometry(RADIUS, RADIUS, LEN, 32), mat(PALETTE.orange));
    cyl.rotation.z = Math.PI / 2;
    cyl.castShadow = true; cyl.receiveShadow = true;
    this.drum.add(cyl);
    // 穴
    for (let i = 0; i < STEPS; i++) {
      for (let p = 0; p < PITCHES; p++) {
        const hole = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 10), mat('#2b1d12', { flat: false }));
        const a = localAngle(i);
        hole.position.set(KEY_X0 + p * 1.4, Math.sin(a) * RADIUS, Math.cos(a) * RADIUS);
        hole.lookAt(0, 0, 0);
        hole.rotateX(Math.PI / 2);
        this.drum.add(hole);
        const m = this.marker(i, p, new Vector3(), 0.32);
        this.root.remove(m);
        this.drum.add(m);
        m.position.copy(hole.position).multiplyScalar(1.03);
        m.lookAt(hole.position.clone().multiplyScalar(2));
      }
    }
    this.drum.position.set(0, AXIS_Y, 0);
    this.root.add(this.drum);
    // 支柱
    for (const x of [-LEN / 2 - 0.35, LEN / 2 + 0.35]) {
      const post = new Mesh(new BoxGeometry(0.5, AXIS_Y + 0.3, 1.0), mat(this.theme.boardSide));
      post.position.set(x, (AXIS_Y + 0.3) / 2, 0);
      post.castShadow = true;
      this.root.add(post);
    }
    // 櫛(上端の後ろ側)
    const comb = new Mesh(new BoxGeometry(LEN, 0.12, 0.5), mat('#8fa0b3'));
    comb.position.set(0, AXIS_Y + RADIUS + 0.12, -0.5);
    this.root.add(comb);
    // 鍵盤(手前の低い位置)と パイプ(後ろ)
    for (let p = 0; p < PITCHES; p++) {
      const x = KEY_X0 + p * 1.4;
      const k = new Mesh(new BoxGeometry(1.1, 0.25, 1.2), mat(p % 2 ? PALETTE.blue : PALETTE.cream));
      k.position.set(x, 0.3, RADIUS + 1.3);
      k.castShadow = true; k.receiveShadow = true;
      this.root.add(k); this.keys.push(k);
      const h = 3.4 - p * 0.35;
      const pipe = new Mesh(new CylinderGeometry(0.32, 0.36, h, 12), mat('#9aa7b4'));
      pipe.position.set(x, h / 2, -RADIUS - 1.2);
      pipe.castShadow = true;
      this.root.add(pipe); this.pipes.push(pipe);
      const mouth = new Mesh(new BoxGeometry(0.5, 0.12, 0.2), mat('#3a3a3a'));
      mouth.position.set(x, h * 0.35, -RADIUS - 1.2 + 0.3);
      this.root.add(mouth);
    }
    this.drawStraightTrack(-7.5, 5.2, SIDING_Z, 0);
    this.placeTunnel(this.path.length - 0.9);
    this.syncPlacements(layer);
  }

  allTargets() {
    const out: { slot: number; pitch: number }[] = [];
    for (let i = 0; i < STEPS; i++) for (let p = 0; p < PITCHES; p++) out.push({ slot: i, pitch: p });
    return out;
  }

  protected override canPlace(): boolean { return this.layer.placements.length < 12; }

  /** ワールド角: 手前 = 0, 上 = π/2, 奥 = π */
  private worldAngle(slot: number): number {
    const a = localAngle(slot) + this.phase * Math.PI * 2;
    return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  override targetVisible(slot: number): boolean {
    const a = this.worldAngle(slot);
    // 手前下(−0.35π)から上端を少し過ぎたところ(0.6π)まで
    return a < 0.6 * Math.PI || a > 1.65 * Math.PI;
  }

  targetPos(slot: number, pitch: number): Vector3 {
    const a = this.worldAngle(slot);
    return this.root.localToWorld(new Vector3(KEY_X0 + pitch * 1.4, AXIS_Y + Math.sin(a) * RADIUS, Math.cos(a) * RADIUS));
  }

  override targetUp(slot: number): Vector3 {
    const a = this.worldAngle(slot);
    return new Vector3(0, Math.sin(a), Math.cos(a));
  }

  protected override instrumentScale(): number { return 0.5; }

  /** ピンは円筒の子にして一緒に回す */
  protected override positionPlacement(group: Group, hit: Mesh, p: Placement): void {
    const a = localAngle(p.slot);
    const up = new Vector3(0, Math.sin(a), Math.cos(a));
    this.root.remove(group); this.drum.add(group);
    this.hits.remove(hit); this.drum.add(hit);
    hit.layers.set(1);
    group.position.set(KEY_X0 + p.pitch * 1.4, Math.sin(a) * RADIUS, Math.cos(a) * RADIUS);
    group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    hit.position.copy(group.position).addScaledVector(up, 0.3);
    hit.scale.setScalar(0.75);
  }

  override syncPlacements(layer: Layer): void {
    for (const { group, hit } of this.placed.values()) { this.drum.remove(group, hit); }
    super.syncPlacements(layer);
  }

  override hitRoots() { return [this.hits, this.drum, this.tunnel.group]; }

  protected updateKind(phase: number, _time: number, hit: HitFn): void {
    this.phase = phase;
    this.drum.rotation.x = -phase * Math.PI * 2;
    for (let p = 0; p < PITCHES; p++) {
      let best = 1;
      for (let i = 0; i < STEPS; i++) if (this.placed.has(key(i, p))) best = Math.min(best, hit(i, p));
      const press = best < 1 ? (1 - best) : 0;
      this.keys[p].position.y = 0.3 - press * 0.15;
      const m = this.pipes[p].material;
      // パイプの光: 共有マテリアルを汚さないよう、スケールで表現
      this.pipes[p].scale.x = this.pipes[p].scale.z = 1 + press * 0.12;
      void m;
    }
  }
}
