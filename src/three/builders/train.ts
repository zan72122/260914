/** 機関車・貨車。経路に沿って並べる。 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, Vector3 } from 'three';
import type { Layer } from '../../app/state';
import type { Path } from '../path';
import { mat, PALETTE, WAGON_COLORS } from '../materials';
import { buildInstrument, applyBounce } from './instruments';
import { makeHit } from '../picker';

export const LOCO_LEN = 1.6;
export const WAGON_LEN = 1.4;
export const SPACING = 1.75;

function m(geo: BoxGeometry | CylinderGeometry | SphereGeometry, color: string, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function wheels(g: Group, len: number, xs: number[]): void {
  for (const fx of xs) {
    for (const side of [-1, 1]) {
      const w = m(new CylinderGeometry(0.16, 0.16, 0.1, 10), PALETTE.dark, fx * len, 0.16, side * 0.4);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
}

/** 機関車(+x を向く)。fire は運転席の火の球。 */
export function buildLoco(color = PALETTE.red): { group: Group; fire: Mesh; chimney: Vector3 } {
  const g = new Group();
  wheels(g, LOCO_LEN, [-0.3, 0, 0.3]);
  g.add(m(new BoxGeometry(LOCO_LEN, 0.36, 0.78), color, 0, 0.42));
  const boiler = m(new CylinderGeometry(0.3, 0.3, LOCO_LEN * 0.55, 14), '#3a3a3a', LOCO_LEN * 0.17, 0.82);
  boiler.rotation.z = Math.PI / 2; g.add(boiler);
  g.add(m(new BoxGeometry(LOCO_LEN * 0.36, 0.7, 0.7), PALETTE.yellow, -LOCO_LEN * 0.3, 0.95));
  g.add(m(new BoxGeometry(LOCO_LEN * 0.42, 0.08, 0.8), color, -LOCO_LEN * 0.3, 1.32));
  g.add(m(new CylinderGeometry(0.11, 0.14, 0.4, 10), PALETTE.black, LOCO_LEN * 0.3, 1.25));
  const face = m(new CylinderGeometry(0.2, 0.2, 0.06, 12), PALETTE.cream, LOCO_LEN * 0.46, 0.82);
  face.rotation.z = Math.PI / 2; g.add(face);
  const fire = new Mesh(new SphereGeometry(0.16, 10, 8), mat('#ff8a2a', { emissive: 0xff5a00 }));
  fire.position.set(-LOCO_LEN * 0.3, 0.95, 0.36);
  g.add(fire);
  return { group: g, fire, chimney: new Vector3(LOCO_LEN * 0.3, 1.45, 0) };
}

export interface Wagon {
  group: Group;
  lid: Mesh;
  items: { group: Group; slot: number; pitch: number }[];
}

export function buildWagon(layer: Layer, index: number): Wagon {
  const g = new Group();
  const color = WAGON_COLORS[index % WAGON_COLORS.length];
  wheels(g, WAGON_LEN, [-0.3, 0.3]);
  g.add(m(new BoxGeometry(WAGON_LEN, 0.5, 0.8), color, 0, 0.5));
  g.add(m(new BoxGeometry(WAGON_LEN - 0.16, 0.06, 0.64), '#3a2a1a', 0, 0.76));
  // 連結器
  g.add(m(new BoxGeometry(SPACING - WAGON_LEN + 0.1, 0.06, 0.06), PALETTE.dark, WAGON_LEN / 2 + (SPACING - WAGON_LEN) / 2, 0.4));
  const items: Wagon['items'] = [];
  const n = layer.placements.length;
  layer.placements.forEach((p, i) => {
    const inst = buildInstrument(p.inst);
    inst.scale.setScalar(0.5);
    inst.position.set(n === 1 ? 0 : (i / (n - 1) - 0.5) * (WAGON_LEN - 0.55), 0.78, 0);
    g.add(inst);
    items.push({ group: inst, slot: p.slot, pitch: p.pitch });
  });
  const lid = m(new BoxGeometry(WAGON_LEN + 0.1, 0.16, 0.9), PALETTE.woodLight, 0, 1.6);
  lid.visible = false;
  g.add(lid);
  return { group: g, lid, items };
}

/** 機関車 + 貨車をまとめて経路に置く。 */
export class TrainRig {
  readonly group = new Group();
  readonly loco: Group;
  readonly fire: Mesh;
  private chimneyLocal: Vector3;
  wagons: Wagon[] = [];
  path: Path | null = null;
  /** 機関車の弧長位置(px 相当のワールド単位) */
  s = 0;

  constructor() {
    const l = buildLoco();
    this.loco = l.group; this.fire = l.fire; this.chimneyLocal = l.chimney;
    this.loco.add(makeHit(1.15, { kind: 'loco' }, 0, 0.7, 0));
    this.group.add(this.loco);
  }

  setWagons(layers: Layer[]): void {
    for (const w of this.wagons) this.group.remove(w.group);
    this.wagons = layers.map((l, i) => buildWagon(l, i));
    this.wagons.forEach((w, i) => { w.group.add(makeHit(1.0, { kind: 'wagon', index: i }, 0, 0.6, 0)); this.group.add(w.group); });
  }

  /** 経路上の弧長 s に機関車を置き、貨車をその後ろに並べる */
  place(s: number): void {
    if (!this.path) return;
    this.s = s;
    const p = this.path.pointAtLength(s);
    this.loco.position.copy(p.pos);
    this.loco.rotation.y = Math.atan2(-p.tan.z, p.tan.x);
    this.wagons.forEach((w, k) => {
      const q = this.path!.pointAtLength(s - SPACING * (k + 1));
      w.group.position.copy(q.pos);
      w.group.rotation.y = Math.atan2(-q.tan.z, q.tan.x);
    });
  }

  chimneyWorld(): Vector3 {
    return this.loco.localToWorld(this.chimneyLocal.clone());
  }

  /** 貨車 k の楽器の跳ねと、ふた */
  animate(hit: (layer: number, slot: number, pitch: number) => number, lids: number[]): void {
    this.wagons.forEach((w, k) => {
      for (const it of w.items) applyBounce(it.group, hit(k, it.slot, it.pitch), 0.5);
      const l = lids[k] ?? 0;
      w.lid.visible = l > 0.01;
      w.lid.position.y = 0.86 + (1 - l) * 0.9;
    });
  }

  setFire(level: number, time: number): void {
    const s = 0.7 + level * 0.5 + 0.1 * Math.sin(time * 20);
    this.fire.scale.setScalar(s);
  }
}
