import { Container, Graphics } from 'pixi.js';
import type { FlameRenderer, FlameStats } from '../flame/FlameRenderer';
import { createFlameRenderer } from '../flame/FlameRenderer';
import { ELEMENT_FLAME_COLORS, flameColorOf } from '../flame/elementColors';
import { BENCH_SURFACE, type Layout, type MaterialId } from '../game/layout';
import type { World } from '../game/world';
import { AFTERGLOW_MS } from '../game/world';
import { afterglowIntensity } from '../flame/afterglow';
import { spectrumBands } from '../flame/prism';
import { drawSpectrumBands } from './spectrum';
import { LightPool } from './light';
import { ARM_REACH, ARM_REST, buildPerson, waveAngle } from './people';
import {
  mix,
  seg,
  shade,
  softGlow,
  verticalGradient,
  wave,
} from './paint';
import type { Rng } from '../core/Rng';

const SKY_TOP = 0x1a1f3a;
const SKY_BOTTOM = 0x6b3a2e;
const SEA = 0x121b2e;
const WALL = 0x241f1c;
const WALL_DARK = 0x1d1812;
const TABLE = 0x3a2f26;
const TABLE_TOP = 0x4b3d31;
const METAL = 0x8a8f96;
const VERDIGRIS = 0x3e8b78;
const SKIN = 0xd8b48c;
const CLOTH = 0x3b5a6b;
const COPPER_METAL = 0x9a5a2e;
const LAMP_LIGHT = 0xffe6b0;
const SPARK_LIGHT = 0xfff0b0;

/** 見た目だけの散らばりを、乱数を消費せずに決める（回転しても同じ絵になる）。 */
function frac(i: number, salt = 0): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 一枚の連続した世界の絵。文字・ボタン・HUD は一切描かない。
 * 縦横は computeLayout の結果に従って同じオブジェクトを置き直すだけ。
 *
 * 光は一箇所に集める（`updateLight`）。炎・作業灯・リモコンのランプ・信号炎・
 * 救助船の光は、どれも周りの物を照らす。炎の色は `elementColors.ts` からしか取らない。
 */
export class WorldView {
  readonly root = new Container();

  private readonly bg = new Graphics();
  private readonly wallG = new Graphics();
  private readonly spectrumG = new Graphics();
  private readonly harborG = new Graphics();
  private readonly seaGlowG = new Graphics();
  private readonly shipHull = new Graphics();
  private readonly shipArm = new Graphics();
  private readonly shipPerson = new Graphics();
  private readonly shipG = new Container();
  private readonly shipBody = new Container();
  private readonly rescueG = new Graphics();
  private readonly flareG = new Graphics();
  private readonly launcherG = new Graphics();
  private readonly pierBody = new Graphics();
  private readonly pierArm = new Graphics();
  private readonly pierWorkerG = new Container();
  private readonly harborFrameG = new Graphics();
  private readonly wireG = new Graphics();
  private readonly sparkG = new Graphics();
  private readonly lampConeG = new Graphics();
  private readonly lampG = new Graphics();
  private readonly workerBody = new Graphics();
  private readonly workerArm = new Graphics();
  private readonly workerG = new Container();
  private readonly deskG = new Graphics();
  private readonly factoryGlow = new Graphics();
  private readonly factoryG = new Graphics();
  private readonly factoryBody = new Container();
  private readonly gearA = new Graphics();
  private readonly gearB = new Graphics();
  private readonly batteryG = new Graphics();
  private readonly remoteG = new Graphics();
  private readonly testFireworkG = new Graphics();
  private readonly deskBody = new Graphics();
  private readonly deskArm = new Graphics();
  private readonly deskWorkerG = new Container();
  private readonly benchG = new Graphics();
  private readonly burnerG = new Graphics();
  /** 光は一枚の絵を使い回して、一つの層にまとめて置く（描き替えを軽く保つ）。 */
  private readonly lights = new LightPool('add');
  private readonly shadows = new LightPool('normal');
  private readonly flameRenderer: FlameRenderer = createFlameRenderer();
  private readonly materialG: Record<MaterialId, Graphics>;
  private readonly prismG = new Graphics();

  private l: Layout | null = null;
  /** 作業灯の錐を組んだときの配置（配置が変わったときだけ組み直す）。 */
  private lampConeBuiltFor: Layout | null = null;
  /** いま描いてある縞の中身（元素と壁の大きさ）。同じなら描き直さない。 */
  private spectrumKey = '';

  constructor(private readonly visualRng: Rng) {
    this.shipBody.addChild(this.shipHull, this.shipPerson, this.shipArm);
    this.shipG.addChild(this.shipBody);
    this.workerG.addChild(this.workerBody, this.workerArm);
    this.pierWorkerG.addChild(this.pierBody, this.pierArm);
    this.deskWorkerG.addChild(this.deskBody, this.deskArm);
    this.factoryBody.addChild(this.factoryG, this.gearA, this.gearB);
    const mk = (): Graphics => new Graphics();
    // 光は足し合わせる（重なった所は明るくなる）
    this.spectrumG.blendMode = 'add';
    this.lampConeG.blendMode = 'add';
    this.lights.view.addChild(this.lampConeG, this.spectrumG);
    this.materialG = { copper_scrap: mk(), strontium_grains: mk(), lithium_powder: mk() };
    this.root.addChild(
      this.bg,
      this.wallG,
      this.harborG,
      this.seaGlowG,
      this.shipG,
      this.rescueG,
      this.launcherG,
      this.pierWorkerG,
      this.flareG,
      this.harborFrameG,
      this.wireG,
      this.sparkG,
      this.lampG,
      this.workerG,
      this.deskWorkerG,
      this.deskG,
      this.factoryGlow,
      this.factoryBody,
      this.batteryG,
      this.remoteG,
      this.testFireworkG,
      this.benchG,
      this.burnerG,
      this.lights.view,
      this.flameRenderer.view,
      this.shadows.view,
    );
    for (const id of Object.keys(this.materialG) as MaterialId[]) {
      this.root.addChild(this.materialG[id]);
    }
    this.root.addChild(this.prismG);
  }

  /** 画面の向き・大きさに合わせて置き直す（別実装にしない）。 */
  layout(l: Layout): void {
    this.l = l;
    const u = l.unit;

    // 夕暮れの空（段差が出ないだけの帯数で置く）
    this.bg.clear();
    verticalGradient(this.bg, { x: 0, y: 0, w: l.width, h: l.height }, SKY_TOP, SKY_BOTTOM, (k) => k * k);

    this.drawWall(l, u);
    this.drawHarbor(l, u);
    this.drawWorkshop(l, u);
    this.drawDesk(l, u);
    this.drawBench(l, u);
    this.drawProps(l);

    this.flameRenderer.layout(l.flame.x, l.flame.y, l.flame.w, l.flame.h);
  }

  /** 工房の壁（板張り・幅木・切れた配線のまわりの緑青）。 */
  private drawWall(l: Layout, u: number): void {
    const w = l.workshop;
    this.wallG.clear();
    verticalGradient(this.wallG, { x: w.x, y: w.y, w: w.w, h: w.h }, shade(WALL, -0.35), WALL);
    // 板の継ぎ目（縦の板張り）
    const boards = Math.max(4, Math.round(w.w / (u * 3.4)));
    for (let i = 1; i < boards; i++) {
      const x = w.x + (w.w * i) / boards;
      this.wallG.rect(x, w.y, Math.max(1, u * 0.06), w.h * 0.86).fill({ color: 0x000000, alpha: 0.22 });
      this.wallG
        .rect(x + Math.max(1, u * 0.06), w.y, Math.max(1, u * 0.05), w.h * 0.86)
        .fill({ color: 0xffffff, alpha: 0.03 });
    }
    // 床際の暗がりと幅木
    this.wallG.rect(w.x, w.y + w.h * 0.86, w.w, w.h * 0.14).fill({ color: WALL_DARK });
    // 窓から入る残照が机のあたりにうっすら届く（形は変わらないので配置のときに一度だけ）
    softGlow(this.wallG, l.desk.x + l.desk.w * 0.5, l.desk.y + l.desk.h * 0.45, l.desk.w * 0.55, 0x7a6448, 0.34, 0, 0.55);
    this.wallG.rect(w.x, w.y + w.h * 0.86, w.w, Math.max(2, u * 0.22)).fill({ color: shade(WALL, 0.12) });
    // 切れた配線の周りの緑青（現実に基づく手がかり）
    for (let i = 3; i >= 1; i--) {
      this.wallG
        .ellipse(l.wireGap.x, l.wireGap.y + u * 0.7, u * 0.4 * i, u * 0.34 * i)
        .fill({ color: VERDIGRIS, alpha: 0.12 });
    }
    // 配線を留める碍子
    for (const p of [l.wireLeft, l.wireRight]) {
      this.wallG.circle(p.x, p.y, u * 0.34).fill({ color: 0x6b625a });
      this.wallG.circle(p.x - u * 0.09, p.y - u * 0.09, u * 0.16).fill({ color: 0x8e857b });
    }
  }

  /** 窓の外の港（空・海・桟橋・沖の船）。 */
  private drawHarbor(l: Layout, u: number): void {
    const hz = l.waterlineY;
    const h = l.harbor;
    this.harborG.clear();
    // 空（段差の出ない帯数で置く）
    verticalGradient(this.harborG, { x: h.x, y: h.y, w: h.w, h: hz - h.y }, SKY_TOP, SKY_BOTTOM);
    // 水平線際の残照
    softGlow(this.harborG, h.x + h.w * 0.34, hz, h.w * 0.46, 0xffb27a, 0.26, 7, 0.34);
    // 海
    this.harborG.rect(h.x, hz, h.w, h.y + h.h - hz).fill({ color: SEA });
    verticalGradient(
      this.harborG,
      { x: h.x, y: hz, w: h.w, h: (h.y + h.h - hz) * 0.5 },
      mix(SEA, 0x6b3a2e, 0.35),
      SEA,
    );
    // うねり（水平線に平行な薄い筋）
    for (let i = 0; i < 6; i++) {
      const k = frac(i, 3);
      const y = hz + (h.y + h.h - hz) * (0.12 + i * 0.15);
      this.harborG
        .rect(h.x + h.w * (0.05 + k * 0.5), y, h.w * (0.16 + k * 0.26), Math.max(1, u * 0.09))
        .fill({ color: 0x9fb4cc, alpha: 0.1 });
    }
    // 桟橋（板と杭）
    const pierY = h.y + h.h * 0.78;
    this.harborG.rect(h.x, pierY, h.w * 0.46, h.h * 0.22).fill({ color: 0x2b2018 });
    this.harborG.rect(h.x, pierY, h.w * 0.46, Math.max(2, u * 0.18)).fill({ color: 0x4a382a });
    for (let i = 0; i < 3; i++) {
      const x = h.x + h.w * (0.08 + i * 0.14);
      this.harborG.rect(x, pierY, Math.max(2, u * 0.2), h.h * 0.22).fill({ color: 0x1b140f });
    }

    // 窓枠は港の上に重ねる
    this.harborFrameG.clear();
    this.harborFrameG
      .rect(h.x, h.y, h.w, h.h)
      .stroke({ width: Math.max(2, u * 0.5), color: 0x40372f });
    this.harborFrameG.rect(h.x + h.w / 2 - u * 0.12, h.y, u * 0.24, h.h).fill({ color: 0x40372f });
    // 枠の上面に当たる室内の光
    this.harborFrameG
      .rect(h.x, h.y + h.h - Math.max(2, u * 0.5), h.w, Math.max(1, u * 0.14))
      .fill({ color: 0x6a5c4c, alpha: 0.7 });

    // 沖の小さな船（逆光の影。人が腕を振る）
    const su = u * 0.5;
    this.shipHull.clear();
    this.shipHull.poly([-u * 1.7, 0, u * 1.7, 0, u * 1.15, u * 0.75, -u * 1.15, u * 0.75]).fill({ color: 0x0b1220 });
    this.shipHull.rect(-u * 1.7, -u * 0.12, u * 3.4, u * 0.16).fill({ color: 0x172131 });
    this.shipHull.rect(-u * 0.08, -u * 1.7, u * 0.16, u * 1.7).fill({ color: 0x0b1220 });
    this.shipHull.rect(-u * 0.75, -u * 0.72, u * 0.95, u * 0.72).fill({ color: 0x0b1220 });
    this.shipHull.rect(-u * 0.6, -u * 0.6, u * 0.3, u * 0.28).fill({ color: 0x3a4a5f, alpha: 0.8 });
    buildPerson(this.shipPerson, this.shipArm, su, { skin: SKIN, cloth: 0x0b1220, silhouette: true });
    this.shipPerson.position.set(u * 0.78, -u * 0.06);
    this.shipArm.position.set(u * 0.78 + su * 0.6, -u * 0.06 - su * 1.9);
    this.shipG.position.set(l.ship.x, l.ship.y);

    // 桟橋の信号炎の発射台と、そこにいる人
    const f = l.flareLauncher;
    this.launcherG.clear();
    // 三脚
    for (const s of [-1, 1]) {
      this.launcherG
        .poly([f.x + s * u * 0.12, f.y - u * 1.2, f.x + s * u * 0.26, f.y - u * 1.2, f.x + s * u * 0.85, f.y, f.x + s * u * 0.62, f.y])
        .fill({ color: 0x4b5159 });
    }
    // 筒
    this.launcherG
      .poly([f.x - u * 0.34, f.y - u * 0.1, f.x + u * 0.34, f.y - u * 0.1, f.x + u * 0.28, f.y - u * 1.75, f.x - u * 0.28, f.y - u * 1.75])
      .fill({ color: shade(METAL, -0.45) });
    this.launcherG
      .poly([f.x - u * 0.34, f.y - u * 0.1, f.x - u * 0.16, f.y - u * 0.1, f.x - u * 0.13, f.y - u * 1.75, f.x - u * 0.28, f.y - u * 1.75])
      .fill({ color: shade(METAL, -0.1) });
    this.launcherG.ellipse(f.x, f.y - u * 1.75, u * 0.28, u * 0.1).fill({ color: 0x14181c });
    this.launcherG.ellipse(f.x, f.y - u * 1.75, u * 0.28, u * 0.1).stroke({ width: Math.max(1, u * 0.08), color: shade(METAL, -0.15) });
    buildPerson(this.pierBody, this.pierArm, u * 0.62, { skin: SKIN, cloth: 0x2f4a57 });
    this.pierWorkerG.position.set(l.pierWorker.x, l.pierWorker.y);
  }

  /** 工房の中（作業灯・作業員）。 */
  private drawWorkshop(l: Layout, u: number): void {
    buildPerson(this.workerBody, this.workerArm, u, { skin: SKIN, cloth: CLOTH });
    this.workerG.position.set(l.worker.x, l.worker.y);

    // 作業灯（消えている状態を基準に描く）
    const p = l.workLamp;
    this.lampG.clear();
    this.lampG.rect(p.x - u * 0.1, p.y - u * 3.2, u * 0.2, u * 2.0).fill({ color: 0x3a3f45 });
    this.lampG.rect(p.x - u * 0.1, p.y - u * 3.2, u * 0.07, u * 2.0).fill({ color: 0x5a6068 });
    this.lampG
      .poly([p.x - u * 1.3, p.y, p.x + u * 1.3, p.y, p.x + u * 0.5, p.y - u * 1.2, p.x - u * 0.5, p.y - u * 1.2])
      .fill({ color: 0x4a4f55 });
    this.lampG
      .poly([p.x - u * 1.3, p.y, p.x - u * 0.55, p.y, p.x - u * 0.2, p.y - u * 1.2, p.x - u * 0.5, p.y - u * 1.2])
      .fill({ color: 0x5e646b });
    this.lampG.ellipse(p.x, p.y, u * 1.3, u * 0.22).fill({ color: 0x23262a });
    this.lampG.circle(p.x, p.y + u * 0.2, u * 0.55).fill({ color: 0x2a2d31 });
  }

  /**
   * 作業灯の光の錐。形は変わらないので一度だけ組み、明るさだけを毎フレーム変える。
   * 縁が硬く出ないよう、広い薄い錐と狭い明るい錐を重ねる。
   */
  private buildLampCone(l: Layout, u: number): void {
    const p = l.workLamp;
    this.lampConeG.clear();
    for (const [spread, depth, alpha] of [
      [7.5, 12, 0.07],
      [4.6, 9, 0.07],
      [2.4, 6, 0.08],
    ] as const) {
      this.lampConeG
        .poly([
          p.x - u * 1.0, p.y,
          p.x + u * 1.0, p.y,
          p.x + u * spread, p.y + u * depth,
          p.x - u * spread, p.y + u * depth,
        ])
        .fill({ color: LAMP_LIGHT, alpha });
    }
    this.lampConeBuiltFor = l;
  }

  /** 作業机・電池工場・リモコン。 */
  private drawDesk(l: Layout, u: number): void {
    const d = l.desk;
    this.deskG.clear();
    this.deskG.rect(d.x, d.y + d.h * 0.52, d.w, d.h * 0.12).fill({ color: TABLE_TOP });
    this.deskG.rect(d.x, d.y + d.h * 0.52, d.w, Math.max(2, u * 0.16)).fill({ color: shade(TABLE_TOP, 0.22) });
    this.deskG.rect(d.x, d.y + d.h * 0.62, d.w, Math.max(2, u * 0.12)).fill({ color: 0x000000, alpha: 0.35 });
    this.deskG.rect(d.x + d.w * 0.06, d.y + d.h * 0.64, d.w * 0.05, d.h * 0.36).fill({ color: 0x33291f });
    this.deskG.rect(d.x + d.w * 0.89, d.y + d.h * 0.64, d.w * 0.05, d.h * 0.36).fill({ color: 0x33291f });

    // 電池工場: 受け口（漏斗）→ 装置 → 出口 → 滑り台 → リモコンの電池室
    const f = l.batteryFactory;
    const o = l.batteryOutlet;
    const r = l.remote;
    this.factoryG.clear();
    // 滑り台（電池が通る道。止まっていても道筋が見える）
    this.factoryG
      .poly([
        o.x + u * 0.1, o.y + u * 0.36,
        r.x - u * 0.5, r.y + u * 0.42,
        r.x - u * 0.5, r.y + u * 0.62,
        o.x + u * 0.1, o.y + u * 0.58,
      ])
      .fill({ color: 0x59606a });
    this.factoryG
      .poly([
        o.x + u * 0.1, o.y + u * 0.36,
        r.x - u * 0.5, r.y + u * 0.42,
        r.x - u * 0.5, r.y + u * 0.5,
        o.x + u * 0.1, o.y + u * 0.44,
      ])
      .fill({ color: 0x8b939d });
    // 受け口（漏斗）
    this.factoryG
      .poly([f.x - u * 1.1, f.y - u * 1.05, f.x + u * 1.1, f.y - u * 1.05, f.x + u * 0.36, f.y - u * 0.1, f.x - u * 0.36, f.y - u * 0.1])
      .fill({ color: 0x9aa2ab });
    this.factoryG
      .poly([f.x - u * 1.1, f.y - u * 1.05, f.x - u * 0.45, f.y - u * 1.05, f.x - u * 0.2, f.y - u * 0.1, f.x - u * 0.36, f.y - u * 0.1])
      .fill({ color: 0xb8c0c9 });
    this.factoryG.ellipse(f.x, f.y - u * 1.05, u * 1.1, u * 0.26).fill({ color: 0x6f777f });
    this.factoryG.ellipse(f.x, f.y - u * 1.05, u * 0.92, u * 0.18).fill({ color: 0x20262c });
    // 装置の箱
    this.factoryG.rect(f.x - u * 1.0, f.y - u * 0.1, u * 2.0, u * 1.5).fill({ color: 0x3a3f46 });
    this.factoryG.rect(f.x - u * 1.0, f.y - u * 0.1, u * 2.0, Math.max(2, u * 0.14)).fill({ color: 0x5c636c });
    this.factoryG.rect(f.x - u * 1.0, f.y - u * 0.1, Math.max(2, u * 0.16), u * 1.5).fill({ color: 0x4d545c });
    // 中が見える窓（歯車が回る）
    this.factoryG.rect(f.x - u * 0.62, f.y + u * 0.2, u * 1.24, u * 0.92).fill({ color: 0x14181d });
    // 出口
    this.factoryG.rect(o.x - u * 0.55, o.y - u * 0.34, u * 1.1, u * 0.68).fill({ color: 0x14181d });
    this.factoryG.rect(o.x - u * 0.62, o.y + u * 0.3, u * 1.24, Math.max(2, u * 0.16)).fill({ color: 0x6f777f });

    // 中で回る歯車（装置が「動いている」ことが窓から見える）
    for (const [g, side] of [
      [this.gearA, -1],
      [this.gearB, 1],
    ] as const) {
      g.clear();
      const gr = u * 0.3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const tw = u * 0.08;
        const tl = gr + u * 0.11;
        g.poly([
          ca * gr * 0.8 - sa * tw, sa * gr * 0.8 + ca * tw,
          ca * tl - sa * tw, sa * tl + ca * tw,
          ca * tl + sa * tw, sa * tl - ca * tw,
          ca * gr * 0.8 + sa * tw, sa * gr * 0.8 - ca * tw,
        ]).fill({ color: 0x8e97a1 });
      }
      g.circle(0, 0, gr).fill({ color: 0x77808a });
      g.circle(0, 0, gr * 0.42).fill({ color: 0x2b3038 });
      g.position.set(f.x + side * u * 0.36, f.y + u * 0.66);
    }

    // 点火用リモコン
    this.remoteG.clear();
    this.remoteG.rect(r.x - u * 1.25, r.y - u * 0.75, u * 2.5, u * 1.5).fill({ color: 0x3b4854 });
    this.remoteG.rect(r.x - u * 1.25, r.y - u * 0.75, u * 2.5, Math.max(2, u * 0.16)).fill({ color: 0x47555f });
    this.remoteG.rect(r.x - u * 1.25, r.y + u * 0.62, u * 2.5, Math.max(2, u * 0.13)).fill({ color: 0x1b222a });
    // 電池室（空のときは黒い穴のまま）
    this.remoteG
      .rect(r.x - u * 0.98, r.y - u * 0.42, u * 1.36, u * 0.84)
      .fill({ color: 0x55636f });
    this.remoteG.rect(r.x - u * 0.92, r.y - u * 0.36, u * 1.24, u * 0.72).fill({ color: 0x12161a });
    this.remoteG.rect(r.x - u * 0.92, r.y - u * 0.36, u * 1.24, Math.max(1, u * 0.12)).fill({ color: 0x080b0e });
    // 電池を受ける金具（空なので何も挟まっていない）
    for (const s2 of [-1, 1]) {
      this.remoteG
        .rect(r.x - u * 0.3 + s2 * u * 0.56 - u * 0.05, r.y - u * 0.22, u * 0.1, u * 0.44)
        .fill({ color: 0x8c9aa6 });
    }
    // ランプの座（消えていても物として見える）
    this.remoteG.circle(l.remoteLamp.x, l.remoteLamp.y, u * 0.36).fill({ color: 0x1d242b });
    this.remoteG.circle(l.remoteLamp.x, l.remoteLamp.y, u * 0.26).fill({ color: 0x3b3327 });

    buildPerson(this.deskBody, this.deskArm, u * 0.9, { skin: SKIN, cloth: 0x4a5b4a });
    this.deskWorkerG.position.set(l.deskWorker.x, l.deskWorker.y);
  }

  /** 試し燃やし台・木箱・バーナー・金属の輪。 */
  private drawBench(l: Layout, u: number): void {
    const b = l.bench;
    this.benchG.clear();
    verticalGradient(this.benchG, { x: b.x, y: b.y, w: b.w, h: b.h }, shade(TABLE, -0.25), TABLE);
    const surfaceTop = b.y + b.h * (BENCH_SURFACE - 0.2);
    this.benchG.rect(b.x, surfaceTop, b.w, b.h * 0.42).fill({ color: TABLE_TOP });
    // 木目
    for (let i = 0; i < 7; i++) {
      const k = frac(i, 11);
      this.benchG
        .rect(b.x + b.w * k * 0.9, surfaceTop + b.h * (0.04 + frac(i, 5) * 0.3), b.w * (0.06 + k * 0.2), Math.max(1, u * 0.07))
        .fill({ color: 0x000000, alpha: 0.12 });
    }
    // 台の縁（手前に来ている面）
    this.benchG.rect(b.x, surfaceTop, b.w, Math.max(2, u * 0.25)).fill({ color: shade(TABLE_TOP, 0.22) });
    this.benchG.rect(b.x, surfaceTop + b.h * 0.42, b.w, Math.max(2, u * 0.18)).fill({ color: 0x000000, alpha: 0.3 });

    // 木箱（材料が転がっている）
    const c = l.crate;
    this.benchG.rect(c.x, c.y, c.w, c.h).fill({ color: 0x6b4a2c });
    this.benchG.rect(c.x, c.y, c.w, Math.max(2, u * 0.2)).fill({ color: 0x8a6238 });
    this.benchG.rect(c.x, c.y, Math.max(2, u * 0.2), c.h).fill({ color: 0x7b5632 });
    this.benchG.rect(c.x + u * 0.3, c.y + u * 0.3, c.w - u * 0.6, c.h - u * 0.6).fill({ color: 0x4e351f });
    this.benchG
      .rect(c.x + u * 0.3, c.y + u * 0.3, c.w - u * 0.6, Math.max(2, u * 0.26))
      .fill({ color: 0x000000, alpha: 0.35 });

    // ガスバーナーと、材料をすくう金属の輪を支える台
    const p = l.burner;
    const ring = l.ring;
    const postX = p.x + u * 2.2;
    this.burnerG.clear();
    // 台座（三脚の脚）
    this.burnerG.ellipse(p.x, p.y + u * 0.1, u * 1.6, u * 0.5).fill({ color: 0x000000, alpha: 0.35 });
    for (const s of [-1, 1]) {
      this.burnerG
        .poly([p.x + s * u * 0.36, p.y - u * 0.5, p.x + s * u * 0.52, p.y - u * 0.5, p.x + s * u * 1.35, p.y + u * 0.18, p.x + s * u * 1.1, p.y + u * 0.18])
        .fill({ color: 0x5a5f66 });
    }
    this.burnerG.ellipse(p.x, p.y, u * 1.5, u * 0.5).fill({ color: 0x5a5f66 });
    this.burnerG.ellipse(p.x, p.y - u * 0.12, u * 1.5, u * 0.46).fill({ color: 0x6d737b });
    // 筒（左に光、右に影）
    this.burnerG.rect(p.x - u * 0.45, p.y - u * 1.6, u * 0.9, u * 1.6).fill({ color: METAL });
    this.burnerG.rect(p.x - u * 0.45, p.y - u * 1.6, u * 0.3, u * 1.6).fill({ color: shade(METAL, 0.3) });
    this.burnerG.rect(p.x + u * 0.22, p.y - u * 1.6, u * 0.23, u * 1.6).fill({ color: shade(METAL, -0.35) });
    this.burnerG.rect(p.x - u * 0.5, p.y - u * 1.05, u * 1.0, u * 0.22).fill({ color: 0x6d737b });
    this.burnerG.ellipse(p.x, p.y - u * 1.6, u * 0.45, u * 0.14).fill({ color: 0x3c4147 });

    // 支柱と、炎の中へ張り出した輪
    this.burnerG.rect(postX - u * 0.26, p.y - u * 0.24, u * 0.52, u * 0.3).fill({ color: 0x4b5057 });
    this.burnerG.rect(postX - u * 0.13, ring.y - u * 0.25, u * 0.26, p.y - ring.y + u * 0.25).fill({ color: 0x5a5f66 });
    this.burnerG.rect(postX - u * 0.13, ring.y - u * 0.25, u * 0.09, p.y - ring.y + u * 0.25).fill({ color: 0x848b94 });
    this.burnerG
      .moveTo(postX, ring.y)
      .lineTo(ring.x + u * 0.7, ring.y)
      .stroke({ width: Math.max(2, u * 0.19), color: METAL });
    // 輪（上側に光、下側に影）
    this.burnerG.ellipse(ring.x, ring.y + u * 0.06, u * 0.82, u * 0.32).stroke({ width: Math.max(2, u * 0.16), color: shade(METAL, -0.45) });
    this.burnerG.ellipse(ring.x, ring.y, u * 0.8, u * 0.3).stroke({ width: Math.max(2, u * 0.16), color: METAL });
    this.burnerG.ellipse(ring.x, ring.y - u * 0.03, u * 0.78, u * 0.28).stroke({ width: Math.max(1, u * 0.07), color: shade(METAL, 0.35) });
  }

  /** 材料とプリズム（本物の物に見える最小限の質感）。 */
  private drawProps(l: Layout): void {
    const r = l.touchRadius * 0.62;

    // 銅くず線の束（切り口が光る）
    const copper = this.materialG.copper_scrap;
    copper.clear();
    for (let i = 0; i < 5; i++) {
      const k = frac(i, 2);
      const rx = r * (0.9 - i * 0.12);
      const ry = r * (0.5 - i * 0.07);
      const dx = (k - 0.5) * r * 0.3;
      const dy = (frac(i, 7) - 0.5) * r * 0.3;
      const wdt = Math.max(1.5, r * 0.15);
      copper.ellipse(dx, dy + wdt * 0.35, rx, ry).stroke({ width: wdt, color: shade(COPPER_METAL, -0.45) });
      copper.ellipse(dx, dy, rx, ry).stroke({ width: wdt, color: COPPER_METAL });
      copper.ellipse(dx, dy - wdt * 0.28, rx, ry).stroke({ width: wdt * 0.42, color: shade(COPPER_METAL, 0.42) });
    }
    // はみ出した線の端（切り口の金属光沢）
    for (const s of [-1, 1]) {
      copper
        .moveTo(s * r * 0.7, r * 0.1)
        .lineTo(s * r * 1.15, -r * 0.35 * s)
        .stroke({ width: Math.max(1.5, r * 0.13), color: COPPER_METAL });
      copper.circle(s * r * 1.15, -r * 0.35 * s, Math.max(1, r * 0.09)).fill({ color: shade(COPPER_METAL, 0.6) });
    }
    copper.rotation = 0.3;

    // 赤い信号炎の薬剤粒（灰白色の顆粒）を浅い受け皿に
    const sr = this.materialG.strontium_grains;
    sr.clear();
    sr.poly([-r * 1.05, r * 0.52, r * 1.05, r * 0.52, r * 0.62, -r * 0.16, -r * 0.62, -r * 0.16]).fill({ color: 0x8e8a7e });
    sr.poly([-r * 1.05, r * 0.52, r * 1.05, r * 0.52, r * 0.9, r * 0.3, -r * 0.9, r * 0.3]).fill({ color: 0xa8a396 });
    sr.poly([-r * 0.62, -r * 0.16, r * 0.62, -r * 0.16, r * 0.66, -r * 0.05, -r * 0.66, -r * 0.05]).fill({ color: 0xc3bfb2 });
    // 盛られた顆粒
    sr.ellipse(0, r * 0.14, r * 0.62, r * 0.3).fill({ color: 0xb4afa1 });
    sr.ellipse(0, r * 0.04, r * 0.56, r * 0.24).fill({ color: 0xd2cec2 });
    for (let i = 0; i < 16; i++) {
      const a = frac(i, 13) * Math.PI * 2;
      const d = Math.sqrt(frac(i, 17));
      const gx = Math.cos(a) * d * r * 0.5;
      const gy = r * 0.06 + Math.sin(a) * d * r * 0.2;
      const gr = r * (0.06 + frac(i, 19) * 0.07);
      sr.circle(gx, gy, gr).fill({ color: mix(0xe6e2d6, 0x8f8a7c, frac(i, 23)) });
      sr.circle(gx - gr * 0.3, gy - gr * 0.3, gr * 0.42).fill({ color: 0xf4f2ea, alpha: 0.8 });
    }

    // 電池材料の粉（白い塩）の小壺
    const li = this.materialG.lithium_powder;
    li.clear();
    const pot = 0x8d7d68;
    li.ellipse(0, r * 0.6, r * 0.74, r * 0.2).fill({ color: shade(pot, -0.5) });
    li.rect(-r * 0.72, -r * 0.12, r * 1.44, r * 0.76).fill({ color: pot });
    li.rect(-r * 0.72, -r * 0.12, r * 0.34, r * 0.76).fill({ color: shade(pot, 0.28) });
    li.rect(r * 0.42, -r * 0.12, r * 0.3, r * 0.76).fill({ color: shade(pot, -0.32) });
    li.ellipse(0, r * 0.64, r * 0.72, r * 0.16).fill({ color: shade(pot, -0.2) });
    // 口と中の白い粉
    li.ellipse(0, -r * 0.12, r * 0.74, r * 0.24).fill({ color: shade(pot, 0.12) });
    li.ellipse(0, -r * 0.12, r * 0.6, r * 0.18).fill({ color: 0x4a3f33 });
    li.ellipse(0, -r * 0.2, r * 0.56, r * 0.18).fill({ color: 0xe8e5dc });
    li.ellipse(-r * 0.08, -r * 0.28, r * 0.4, r * 0.12).fill({ color: 0xfaf9f4 });
    // こぼれた粉
    for (let i = 0; i < 4; i++) {
      li.circle(r * (frac(i, 29) - 0.5) * 1.5, r * (0.52 + frac(i, 31) * 0.12), r * 0.06).fill({ color: 0xe8e5dc, alpha: 0.9 });
    }

    // 三角プリズム（ガラスの面と稜が光る）
    const glass = 0x9fc6d8;
    this.prismG.clear();
    this.prismG.poly([0, -r * 1.05, r * 1.0, r * 0.72, -r * 1.0, r * 0.72]).fill({ color: glass, alpha: 0.45 });
    this.prismG.poly([0, -r * 1.05, 0, r * 0.72, -r * 1.0, r * 0.72]).fill({ color: shade(glass, 0.45), alpha: 0.4 });
    this.prismG.poly([0, -r * 1.05, r * 1.0, r * 0.72, r * 0.2, r * 0.72]).fill({ color: shade(glass, -0.3), alpha: 0.35 });
    this.prismG
      .moveTo(0, -r * 1.05)
      .lineTo(-r * 1.0, r * 0.72)
      .stroke({ width: Math.max(1.5, r * 0.11), color: 0xeaf7ff, alpha: 0.9 });
    this.prismG
      .poly([0, -r * 1.05, r * 1.0, r * 0.72, -r * 1.0, r * 0.72])
      .stroke({ width: Math.max(1.5, r * 0.08), color: 0xeaf7ff, alpha: 0.6 });
  }

  /** 炎の描画の覗き窓（解像度・1 フレームの描画時間）。画面には何も出さない。 */
  flameStats(): FlameStats | null {
    return this.flameRenderer.stats ? this.flameRenderer.stats() : null;
  }

  update(world: World, timeMs: number): void {
    const l = this.l;
    if (!l) return;
    const u = l.unit;

    this.flameRenderer.update({
      element: world.flameElement,
      intensityPct: world.flameIntensityPct,
      timeMs,
    });

    this.lights.begin();
    this.shadows.begin();
    this.updateLight(world, timeMs, u, l);
    this.updatePrism(world, l);
    this.updateWiring(world, timeMs, u, l);
    this.updateFlare(world, timeMs, u, l);
    this.updateBattery(world, timeMs, u, l);
    this.updateMaterials(world, timeMs, l);
    this.prismG.position.set(world.prismPos.x, world.prismPos.y);
    // プリズムの影（持ち上げると薄く広がる）
    const held = world.prismAt === 'held';
    this.shadows.add(
      world.prismPos.x,
      world.prismPos.y + l.touchRadius * (held ? 0.9 : 0.48),
      l.touchRadius * (held ? 0.85 : 0.55),
      0x000000,
      held ? 0.26 : 0.4,
      0.34,
    );
    this.lights.end();
    this.shadows.end();
  }

  /**
   * 炎が周りの物を照らす。色は `elementColors.ts` が算出した表示色そのもので、
   * 元素が変われば落ちる光も変わる（リテラルは置かない）。
   */
  private updateLight(world: World, timeMs: number, u: number, l: Layout): void {
    const c = flameColorOf(world.flameElement);
    const flick = 0.86 + 0.09 * wave(timeMs, 190) + 0.05 * wave(timeMs, 73, 1.1);
    const k = (world.flameIntensityPct / 100) * flick;
    const col = c.hex;
    const p = this.lights;
    // 台の面に落ちる光（炎の足元に溜まる）
    p.add(l.burner.x, l.burner.y + u * 0.15, l.bench.w * 0.3, col, 0.38 * k, 0.22);
    // 奥の壁
    p.add(l.flame.x, l.flame.y - l.flame.h * 0.45, l.flame.h * 0.85, col, 0.26 * k, 0.95);
    // バーナーの頭・支柱・金属の輪（近いので強い）
    p.add(l.burner.x, l.burner.y - u * 1.5, u * 1.9, col, 0.4 * k);
    p.add(l.ring.x, l.ring.y, u * 1.5, col, 0.5 * k, 0.8);
    // 木箱の、炎に向いた面
    p.add(l.crate.x + l.crate.w, l.crate.y + l.crate.h * 0.4, l.crate.w * 0.42, col, 0.22 * k, 0.7);
  }

  /**
   * プリズムが炎の前にあるときだけ、炎の後ろの壁に縞が映る（PLAN §3.5）。
   * 帯の位置・幅・明るさ・色は src/flame/prism.ts が発光線から出したものをそのまま使い、
   * 縁のやわらかさと光の扇（分散の道筋）だけを描画側で足す。
   */
  private updatePrism(world: World, l: Layout): void {
    const projecting = world.prismInFrontOfFlame() ? world.flameElement : null;
    const w = l.spectrumWall;
    if (!world.prismInFrontOfFlame()) {
      if (this.spectrumKey !== '') {
        this.spectrumG.clear();
        this.spectrumKey = '';
      }
      return;
    }
    // 縞は炎の元素と壁の大きさだけで決まる。変わったときだけ描き直す。
    const key = `${projecting ?? 'base'}:${Math.round(w.x)}:${Math.round(w.y)}:${Math.round(w.w)}:${Math.round(w.h)}`;
    if (key !== this.spectrumKey) {
      this.spectrumG.clear();
      drawSpectrumBands(this.spectrumG, spectrumBands(projecting), {
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
      });
      this.spectrumKey = key;
    }
    // プリズムから壁へ伸びる薄い光の道筋（分散の道筋）と、プリズムの中の輝き
    const c = flameColorOf(projecting);
    const to = { x: w.x + w.w / 2, y: w.y + w.h };
    const from = world.prismPos;
    this.lights.add(from.x, from.y, l.touchRadius * 0.8, c.hex, 0.6);
    // 道筋は壁の手前で終える（壁に落ちた光は縞の方が持っている）
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + (i / 4) * 0.6;
      this.lights.add(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        l.touchRadius * (0.45 + t * 1.3),
        c.hex,
        0.18 * (1 - t * 0.45),
      );
    }
  }

  /** 銅: 火花が止まり、線がつながり、電流が走って作業灯が灯る。 */
  private updateWiring(world: World, timeMs: number, u: number, l: Layout): void {
    const job = world.job('wiring');
    // 呼ばれている間だけ線が切れている。直った後はそのまま繋がったまま。
    const called = job.status === 'called';
    const t = job.status === 'job_running' ? job.progress : called ? 0 : 1;
    const connected = t >= 1;
    const gapL = { x: l.wireGap.x - u * 1.7 * (1 - t), y: l.wireGap.y };
    const gapR = { x: l.wireGap.x + u * 1.7 * (1 - t), y: l.wireGap.y };

    this.wireG.clear();
    const lw = Math.max(2, u * 0.3);
    const cable = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
      this.wireG.moveTo(a.x, a.y + lw * 0.22).lineTo(b.x, b.y + lw * 0.22).stroke({ width: lw, color: 0x3d2413 });
      this.wireG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: lw, color: 0x7a4a2a });
      this.wireG.moveTo(a.x, a.y - lw * 0.24).lineTo(b.x, b.y - lw * 0.24).stroke({ width: lw * 0.34, color: 0xa4673c });
    };
    cable(l.wireLeft, gapL);
    cable(gapR, l.wireRight);

    if (!connected) {
      // 切れ口: 皮がむけて銅の素線がほつれている（隙間が一目で分かる）
      for (const [end, dir] of [
        [gapL, 1],
        [gapR, -1],
      ] as const) {
        this.wireG.circle(end.x, end.y, lw * 0.55).fill({ color: 0x2a1a0e });
        for (let i = 0; i < 4; i++) {
          const droop = 0.2 + i * 0.28;
          const len = u * (0.5 + (i % 2) * 0.16);
          this.wireG
            .moveTo(end.x - dir * lw * 0.2, end.y - lw * 0.18 + i * lw * 0.12)
            .quadraticCurveTo(
              end.x + dir * len * 0.6,
              end.y - lw * 0.1 + droop * u * 0.1,
              end.x + dir * len,
              end.y + droop * u * 0.42,
            )
            .stroke({ width: Math.max(1, lw * 0.14), color: shade(COPPER_METAL, 0.25) });
        }
      }
    } else {
      // 直った所に巻いたスリーブと、走る電流
      this.wireG.rect(l.wireGap.x - u * 0.5, l.wireGap.y - lw * 0.75, u * 1.0, lw * 1.5).fill({ color: 0x4b3a2a });
      this.wireG
        .moveTo(l.wireLeft.x, l.wireLeft.y)
        .lineTo(l.wireRight.x, l.wireRight.y)
        .stroke({ width: lw * 0.42, color: 0xffe9a8, alpha: 0.3 + 0.25 * wave(timeMs, 900) });
    }

    // 火花（散る粒と、その光が壁を照らす）
    this.sparkG.clear();
    if (called) {
      const pulse = 0.55 + 0.45 * wave(timeMs, 220);
      this.lights.add(l.wireGap.x, l.wireGap.y, u * 3.0, SPARK_LIGHT, 0.34 * pulse);
      for (let i = 0; i < 9; i++) {
        const a = this.visualRng.range(-Math.PI, Math.PI);
        const d = this.visualRng.range(u * 0.2, u * 2.4);
        const x = l.wireGap.x + Math.cos(a) * d;
        const y = l.wireGap.y + Math.sin(a) * d * 0.7;
        const alpha = this.visualRng.range(0.4, 1);
        this.sparkG
          .moveTo(x, y)
          .lineTo(x - Math.cos(a) * u * 0.45, y - Math.sin(a) * u * 0.32)
          .stroke({ width: Math.max(1, u * 0.09), color: SPARK_LIGHT, alpha: alpha * 0.7 });
        this.sparkG.circle(x, y, Math.max(1, u * this.visualRng.range(0.06, 0.17))).fill({ color: 0xfff8dc, alpha });
      }
      this.sparkG.circle(l.wireGap.x, l.wireGap.y, u * 0.2).fill({ color: 0xfff6d0, alpha: 0.6 + 0.4 * pulse });
    }

    // 作業灯の光（錐は形なので一度だけ作り、明るさだけを毎フレーム変える）
    const lit = t;
    if (this.lampConeBuiltFor !== l) this.buildLampCone(l, u);
    const flick = 0.9 + 0.1 * wave(timeMs, 1700);
    const a = lit * flick;
    this.lampConeG.alpha = a;
    this.lampConeG.visible = a > 0.01;
    if (a > 0.01) {
      // 灯そのものと、照らされた壁・配線のあたり
      this.lights.add(l.workLamp.x, l.workLamp.y + u * 0.2, u * 2.4, 0xffeec4, 0.75 * a);
      this.lights.add(l.workLamp.x, l.workLamp.y + u * 0.2, u * 0.9, 0xfff7e0, 0.95 * a);
      this.lights.add(l.wireGap.x, l.wireGap.y, u * 3.4, LAMP_LIGHT, 0.12 * a);
      this.lights.add(l.worker.x, l.worker.y - u * 1.6, u * 3.2, LAMP_LIGHT, 0.1 * a);
    }

    // 呼んでいる間は腕を振り、直れば下ろす
    this.workerArm.rotation = called ? waveAngle(wave(timeMs, 520)) : ARM_REST;
  }

  /**
   * ストロンチウム: 発射台が赤い信号炎を打ち上げ、沖が赤く照らされ、
   * 船の人が腕を下ろし、救助船の光が近づく。
   */
  private updateFlare(world: World, timeMs: number, u: number, l: Layout): void {
    const job = world.job('flare');
    const running = job.status === 'job_running';
    const p = running ? job.progress : job.status === 'done' ? 1 : 0;
    const red = ELEMENT_FLAME_COLORS.strontium.hex;

    // 打ち上がる信号炎
    this.flareG.clear();
    const rise = seg(p, 0.15, 0.45);
    if (p > 0.15 && p < 0.72) {
      const topY = l.harbor.y + l.harbor.h * 0.08;
      const y = l.flareLauncher.y + (topY - l.flareLauncher.y) * rise;
      const fade = 1 - seg(p, 0.5, 0.72);
      this.lights.add(l.flareLauncher.x, y, u * 2.0, red, 0.85 * fade);
      this.flareG.circle(l.flareLauncher.x, y, u * 0.34).fill({ color: 0xfff0f0, alpha: fade });
      this.flareG
        .poly([
          l.flareLauncher.x - u * 0.16, y,
          l.flareLauncher.x + u * 0.16, y,
          l.flareLauncher.x + u * 0.05, l.flareLauncher.y,
          l.flareLauncher.x - u * 0.05, l.flareLauncher.y,
        ])
        .fill({ color: red, alpha: 0.45 * fade });
    }
    // 発射台の口が光る（薬剤が入った合図）
    if (p > 0 && p < 0.2) {
      this.lights.add(l.flareLauncher.x, l.flareLauncher.y - u * 1.75, u * 1.1, red, 0.9 * seg(p, 0, 0.15));
    }

    // 沖が赤く照らされる
    this.seaGlowG.clear();
    const washUp = seg(p, 0.3, 0.55);
    const washDown = 1 - 0.55 * seg(p, 0.8, 1);
    const wash = washUp * washDown;
    if (wash > 0) {
      this.seaGlowG.rect(l.harbor.x, l.harbor.y, l.harbor.w, l.harbor.h).fill({ color: red, alpha: 0.42 * wash });
      this.seaGlowG
        .rect(l.harbor.x, l.waterlineY, l.harbor.w, l.harbor.y + l.harbor.h - l.waterlineY)
        .fill({ color: red, alpha: 0.3 * wash * (0.8 + 0.2 * wave(timeMs, 700)) });
    }
    // 窓から工房の中へ差し込む赤い光
    if (wash > 0) {
      this.lights.add(
        l.harbor.x + l.harbor.w * 0.5,
        l.harbor.y + l.harbor.h * 1.05,
        l.harbor.w * 0.55,
        red,
        0.34 * wash,
        0.8,
      );
    }

    // 船の人: 呼んでいる間は腕を振り、信号炎が上がったら腕を下ろす
    const calling = job.status === 'called';
    this.shipArm.rotation = calling && p < 0.5 ? waveAngle(wave(timeMs, 460)) : ARM_REST;
    // 波間で揺れる
    this.shipG.y = l.ship.y + wave(timeMs, 2600) * u * 0.22 + wave(timeMs, 1100, 0.7) * u * 0.08;
    this.shipBody.rotation = wave(timeMs, 3100, 0.4) * 0.05 + wave(timeMs, 1700, 1.2) * 0.02;

    // 桟橋の人: 呼ぶときは腕を振り、薬剤が入ったら発射台へ手を伸ばす
    this.pierArm.rotation = calling ? waveAngle(wave(timeMs, 540)) : running && p < 0.3 ? ARM_REACH : ARM_REST;

    // 救助船の光が近づく
    this.rescueG.clear();
    const come = seg(p, 0.6, 1);
    if (come > 0) {
      const x = l.rescueFrom.x + (l.rescueTo.x - l.rescueFrom.x) * come;
      const y = l.rescueFrom.y;
      this.lights.add(x, y, u * 2.2, 0xbfe0ff, 0.7);
      this.rescueG.circle(x, y, u * 0.46).fill({ color: 0xffffff, alpha: 0.95 });
      this.rescueG.circle(x, y, u * 1.0).fill({ color: 0xdcefff, alpha: 0.45 });
      this.rescueG
        .poly([x, y - u * 0.3, x, y + u * 0.3, l.ship.x, l.ship.y + u * 0.6, l.ship.x, l.ship.y - u * 0.6])
        .fill({ color: 0xbfe0ff, alpha: 0.12 * come });
      // 水面に落ちる光の帯
      this.rescueG
        .poly([x - u * 0.5, y, x + u * 0.5, y, x + u * 1.6, y + u * 2.4, x - u * 1.6, y + u * 2.4])
        .fill({ color: 0xbfe0ff, alpha: 0.12 * come });
    }
  }

  /**
   * リチウム: 受け口 → 装置が動く → 電池が出てくる → 滑ってリモコンに入る →
   * ランプが点き、点火テストで小さな火が飛ぶ。金属がそのまま電池になるとは描かない。
   */
  private updateBattery(world: World, timeMs: number, u: number, l: Layout): void {
    const job = world.job('battery');
    const running = job.status === 'job_running';
    const called = job.status === 'called';
    // 呼ばれている間だけ電池室が空。直った後は電池が入ったまま。
    const p = running ? job.progress : called ? 0 : 1;

    // 受け口に粉が入り、装置が動く
    const feeding = seg(p, 0, 0.2);
    const working = seg(p, 0.2, 0.5) * (1 - seg(p, 0.55, 0.7));
    this.factoryGlow.clear();
    if (feeding > 0 && p < 0.25) {
      // 受け口へ落ちてゆく白い粉
      this.lights.add(l.batteryFactory.x, l.batteryFactory.y - u * 1.05, u * 1.2, 0xf2f0ea, 0.7 * feeding);
      this.factoryGlow
        .ellipse(l.batteryFactory.x, l.batteryFactory.y - u * 1.05 + u * 0.8 * feeding, u * 0.3, u * 0.12)
        .fill({ color: 0xf2f0ea, alpha: 0.8 * (1 - feeding) });
    }
    if (working > 0) {
      const beat = 0.6 + 0.4 * wave(timeMs, 160);
      this.factoryGlow
        .rect(l.batteryFactory.x - u * 0.62, l.batteryFactory.y + u * 0.2, u * 1.24, u * 0.92)
        .fill({ color: 0xffd9a0, alpha: 0.4 * working * beat });
      this.lights.add(l.batteryFactory.x, l.batteryFactory.y + u * 0.66, u * 1.9, 0xffd9a0, 0.26 * working * beat);
    }
    // 中の歯車が回り、箱が小刻みに震える
    this.gearA.rotation = working > 0 ? timeMs / 140 : 0;
    this.gearB.rotation = working > 0 ? -timeMs / 140 : 0;
    this.factoryBody.x = working > 0 ? wave(timeMs, 90) * u * 0.14 * working : 0;

    // 電池が出てきて、滑ってリモコンの電池室に入る
    this.batteryG.clear();
    const out = seg(p, 0.45, 0.6);
    const slide = seg(p, 0.6, 0.85);
    const inPlace = p >= 0.85;
    if (p >= 0.45) {
      const from = l.batteryOutlet;
      const to = { x: l.remote.x - u * 0.3, y: l.remote.y };
      const x = from.x + (to.x - from.x) * slide;
      const y = from.y + (to.y - from.y) * slide - Math.sin(slide * Math.PI) * u * 0.5;
      const emerge = 0.4 + 0.6 * out;
      const bw = u * 1.0 * emerge;
      this.batteryG.rect(x - bw / 2, y - u * 0.3, bw, u * 0.6).fill({ color: 0xc9a227 });
      this.batteryG.rect(x - bw / 2, y - u * 0.3, bw, u * 0.16).fill({ color: 0xe8cd6a });
      this.batteryG.rect(x - bw / 2, y + u * 0.16, bw, u * 0.14).fill({ color: 0x8c6f16 });
      this.batteryG.rect(x + bw / 2 - u * 0.12, y - u * 0.16, u * 0.12, u * 0.32).fill({ color: 0xe8e2d0 });
      if (!inPlace) this.lights.add(x, y, u * 1.2, 0xffe9a0, 0.28 * (1 - slide));
    }

    // リモコンのランプ
    const lit = inPlace ? (running ? seg(p, 0.85, 1) : 1) : 0;
    if (lit > 0) {
      const flick = 0.85 + 0.15 * wave(timeMs, 1300);
      const a = lit * flick;
      this.lights.add(l.remoteLamp.x, l.remoteLamp.y, u * 0.5, 0xfff6d0, a);
      this.lights.add(l.remoteLamp.x, l.remoteLamp.y, u * 2.2, 0xffe9a0, 0.65 * a);
      // 机の面に落ちる光
      this.lights.add(l.remote.x, l.remote.y + u * 0.9, u * 2.6, 0xffe9a0, 0.18 * a, 0.4);
    }

    // 点火テストの小さな火（パチッ）
    this.testFireworkG.clear();
    const fire = running ? seg(p, 0.9, 0.97) * (1 - seg(p, 0.97, 1)) : 0;
    if (fire > 0) {
      const f = l.testFirework;
      this.lights.add(f.x, f.y, u * 1.8, 0xfff6d0, 0.55 * fire);
      this.testFireworkG.circle(f.x, f.y, u * 0.3 * fire).fill({ color: 0xfff6d0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const d = u * (0.6 + 1.1 * fire);
        this.testFireworkG
          .circle(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, Math.max(1, u * 0.1))
          .fill({ color: 0xffe9a8, alpha: fire });
      }
    }

    // 呼んでいる間は腕を振り、電池が入ったらリモコンへ手を伸ばす
    this.deskArm.rotation = called ? waveAngle(wave(timeMs, 500)) : running && p > 0.6 ? ARM_REACH : ARM_REST;
  }

  /** 材料と余熱発光。押さえた材料はわずかに浮き、影が落ちる。 */
  private updateMaterials(world: World, timeMs: number, l: Layout): void {
    for (const m of world.materials) {
      const g = this.materialG[m.id];
      const held = m.at === 'held';
      const lift = held ? l.touchRadius * 0.16 : 0;
      g.position.set(m.x, m.y - lift);
      // 置いてある物・持ち上げた物の影（持ち上げると薄く広がる）
      if (!m.inFlame) {
        this.shadows.add(
          m.x,
          m.y + l.touchRadius * 0.42,
          l.touchRadius * (held ? 0.85 : 0.55),
          0x000000,
          held ? 0.28 : 0.45,
          0.34,
        );
      }
      // 炎の中は満光。出た後はニュートン冷却に倣った指数減衰で、
      // 3 秒でちょうど 0 になる（src/flame/afterglow.ts）。
      const k = m.inFlame ? 1 : afterglowIntensity((AFTERGLOW_MS - m.afterglowMs) / 1000);
      if (k > 0) {
        const c = flameColorOf(m.element);
        const rr = l.touchRadius * (0.8 + 0.2 * wave(timeMs, 640));
        this.lights.add(m.x, m.y - lift, rr * 1.3, c.hex, 0.8 * k);
        this.lights.add(m.x, m.y - lift, rr * 0.55, c.hex, 0.75 * k);
      }
      g.scale.set(held ? 1.12 : 1);
    }
  }

  destroy(): void {
    this.flameRenderer.destroy();
    this.root.destroy({ children: true });
  }
}
