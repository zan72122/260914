/** 格子の島: 8 列 × 5 行の段になったタイル。光の棒が左から右へ進む。 */
import { Mesh, BoxGeometry, Vector3 } from 'three';
import { type Layer, STEPS, PITCHES, type LevelKind } from '../../app/state';
import { LinePath } from '../path';
import { LevelView, type HitFn, key } from './LevelView';
import { mat, glow } from '../materials';

const TILE = 1.0, STEP_H = 0.22;
const X0 = -(STEPS - 1) / 2 * TILE;   // 列 0 の中心
const Z0 = (PITCHES - 1) / 2 * TILE;  // 行 0(手前)の中心
const SIDING_Z = Z0 + 2.2;

export class GridLevel extends LevelView {
  readonly kind: LevelKind = 'grid';
  readonly path = new LinePath(-7.5, 5.2, SIDING_Z, 0.12);
  parkS = 6.5;
  private tiles = new Map<string, Mesh>();
  private glows = new Map<string, Mesh>();
  private bar!: Mesh;

  build(layer: Layer): void {
    this.layer = layer;
    this.board(STEPS * TILE + 2.4, PITCHES * TILE + 5.4, this.theme.board);
    for (let r = 0; r < PITCHES; r++) {
      for (let c = 0; c < STEPS; c++) {
        const h = 0.3 + r * STEP_H;
        const tile = new Mesh(new BoxGeometry(TILE * 0.92, h, TILE * 0.92), mat(r % 2 ? this.theme.lawn : this.theme.boardSide));
        tile.position.set(X0 + c * TILE, h / 2, Z0 - r * TILE);
        tile.castShadow = true; tile.receiveShadow = true;
        this.root.add(tile);
        this.tiles.set(key(c, r), tile);
        const g = new Mesh(new BoxGeometry(TILE * 0.96, 0.05, TILE * 0.96), glow('#fff2a0', 0));
        g.position.set(X0 + c * TILE, h + 0.03, Z0 - r * TILE);
        this.root.add(g);
        this.glows.set(key(c, r), g);
        this.marker(c, r, new Vector3(X0 + c * TILE, h + 0.06, Z0 - r * TILE), 0.4);
      }
    }
    this.bar = new Mesh(new BoxGeometry(0.22, 2.2, PITCHES * TILE + 0.4), glow('#ffffff', 0.35));
    this.bar.position.set(X0, 1.1, Z0 - (PITCHES - 1) * TILE / 2);
    this.root.add(this.bar);
    this.drawStraightTrack(-7.5, 5.2, SIDING_Z, 0);
    this.placeTunnel(this.path.length - 0.9);
    this.syncPlacements(layer);
  }

  allTargets() {
    const out: { slot: number; pitch: number }[] = [];
    for (let c = 0; c < STEPS; c++) for (let r = 0; r < PITCHES; r++) out.push({ slot: c, pitch: r });
    return out;
  }

  protected override canPlace(): boolean {
    return this.layer.placements.length < 12;
  }

  targetPos(slot: number, pitch: number): Vector3 {
    const h = 0.3 + pitch * STEP_H;
    return this.root.localToWorld(new Vector3(X0 + slot * TILE, h, Z0 - pitch * TILE));
  }

  protected override instrumentScale(): number { return 0.8; }

  protected updateKind(phase: number, _time: number, hit: HitFn): void {
    // 光の棒: 列 i の中心に phase = (i + 0.5) / STEPS で到達する
    this.bar.position.x = X0 - TILE / 2 + phase * STEPS * TILE;
    for (const [k, g] of this.glows) {
      const [c, r] = k.split(':').map(Number);
      const h = hit(c, r);
      (g.material as { opacity: number }).opacity = h < 1 ? (1 - h) * 0.8 : 0;
    }
  }
}
