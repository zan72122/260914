/** 駅(フィナーレ): 汽車が停まるホーム。手前の側線に空の青い汽車が待つ。 */
import { Mesh, BoxGeometry, CylinderGeometry, Vector3, Group } from 'three';
import { type Layer, type LevelKind } from '../../app/state';
import { LinePath } from '../path';
import { LevelView, type HitFn } from './LevelView';
import { mat, glow, PALETTE } from '../materials';
import { buildLoco } from '../builders/train';
import { buildTree } from '../builders/decor';
import { makeHit } from '../picker';

const MAIN_Z = 0.6, SIDING_Z = 3.4;

export class StationLevel extends LevelView {
  readonly kind: LevelKind = 'train';
  readonly path = new LinePath(-9, 9, MAIN_Z, 0.12);
  parkS = 9 + 3.2;   // 機関車がホームの右寄りに停まる(貨車が並ぶ)
  newTrain = new Group();
  private windows: Mesh[] = [];

  build(layer: Layer): void {
    this.layer = layer;
    this.board(12, 8);
    this.drawStraightTrack(-9, 9, MAIN_Z);
    this.drawStraightTrack(-6, 6, SIDING_Z);
    // ホーム
    const plat = new Mesh(new BoxGeometry(9, 0.35, 1.6), mat('#e0cfae'));
    plat.position.set(0, 0.17, MAIN_Z - 1.6); plat.receiveShadow = true; plat.castShadow = true;
    this.root.add(plat);
    const roof = new Mesh(new BoxGeometry(7, 0.16, 2.0), mat(this.theme.roof));
    roof.position.set(0, 2.2, MAIN_Z - 1.8); roof.castShadow = true;
    this.root.add(roof);
    for (const x of [-2.8, 2.8]) {
      const post = new Mesh(new CylinderGeometry(0.08, 0.08, 1.9, 8), mat(PALETTE.woodDark));
      post.position.set(x, 1.3, MAIN_Z - 2.3);
      this.root.add(post);
    }
    for (let i = -2; i <= 2; i++) {
      const w = new Mesh(new BoxGeometry(0.3, 0.3, 0.05), glow('#ffe9a0', 0.9));
      w.position.set(i * 1.2, 1.6, MAIN_Z - 2.7);
      this.root.add(w); this.windows.push(w);
    }
    for (const [x, z] of [[-5, -2.8], [5.2, -2.6]]) {
      const t = buildTree(this.theme); t.position.set(x, 0, z); this.root.add(t);
    }
    // 新しい汽車(青)。側線で待つ
    const loco = buildLoco(PALETTE.blue);
    this.newTrain.add(loco.group);
    this.newTrain.position.set(-1.5, 0.12, SIDING_Z);
    this.newTrain.add(makeHit(1.6, { kind: 'newTrain' }, 0, 0.6, 0));
    this.root.add(this.newTrain);
    this.placeTunnel(this.path.length - 0.8);
    this.tunnel.group.visible = false; // 駅では扉は使わない
  }

  allTargets() { return []; }
  targetPos(): Vector3 { return new Vector3(); }
  override hitRoots() { return [this.hits, this.newTrain]; }

  newTrainChimney(): Vector3 {
    return this.newTrain.localToWorld(new Vector3(0.48, 1.45, 0));
  }

  protected updateKind(_phase: number, time: number, _hit: HitFn): void {
    const blink = 0.5 + 0.5 * Math.max(0, Math.sin(time * 8));
    this.windows.forEach((w, i) => { (w.material as { opacity: number }).opacity = 0.4 + blink * 0.6 * ((i + Math.floor(time * 4)) % 2); });
    this.newTrain.position.y = 0.12 + Math.sin(time * 6) * 0.02;
  }
}
