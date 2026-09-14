/** カメラに固定したおもちゃ箱トレイ。楽器の見本が並び、時々跳ねる。 */
import { Group, Mesh, BoxGeometry } from 'three';
import type { InstrumentId } from '../../app/state';
import { mat, PALETTE } from '../materials';
import { buildInstrument } from './instruments';
import { makeHit } from '../picker';

export class Tray {
  readonly group = new Group();
  private items: { id: InstrumentId; group: Group; hit: Mesh }[] = [];
  private board: Mesh;
  /** トレイの幅(ワールド)。カメラの水平視野に合わせて外から設定する */
  width = 6;

  constructor() {
    this.board = new Mesh(new BoxGeometry(6, 0.2, 1.6), mat(PALETTE.woodDark));
    this.group.add(this.board);
    // 手前に少し傾け、上面が見えるように
    this.group.rotation.x = 0.55;
  }

  setWidth(w: number): void {
    this.width = w;
    this.board.scale.x = w / 6;
    this.layout();
  }

  setItems(ids: InstrumentId[]): void {
    for (const it of this.items) this.group.remove(it.group, it.hit);
    this.items = ids.map((id) => {
      const g = buildInstrument(id);
      g.scale.setScalar(0.62);
      const hit = makeHit(0.6, { kind: 'tray', inst: id });
      this.group.add(g, hit);
      return { id, group: g, hit };
    });
    this.layout();
  }

  private layout(): void {
    const n = this.items.length;
    const gap = Math.min(1.5, (this.width - 0.4) / Math.max(1, n));
    const scale = Math.max(0.24, Math.min(0.62, gap * 0.55));
    this.items.forEach((it, i) => {
      const x = (i - (n - 1) / 2) * gap;
      it.group.scale.setScalar(scale);
      it.group.position.set(x, 0.1, 0);
      it.hit.position.set(x, 0.3 * scale / 0.62, 0);
      it.hit.scale.setScalar(Math.max(0.35, scale));
    });
  }

  /** 見えなくする(駅では側線を出すためトレイは消す) */
  setVisible(v: boolean): void { this.group.visible = v; }

  update(time: number): void {
    this.items.forEach((it, i) => {
      const ph = ((time * 0.45 + i * 0.29) % 1);
      const hop = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) * 0.4 * it.group.scale.x : 0;
      it.group.position.y = 0.1 + hop;
    });
  }

  itemWorldPos(id: InstrumentId) {
    const it = this.items.find((x) => x.id === id) ?? this.items[0];
    return it ? it.group.getWorldPosition(it.group.position.clone()) : null;
  }

  itemCount(): number { return this.items.length; }
  itemAt(i: number) { return this.items[i]; }
}
