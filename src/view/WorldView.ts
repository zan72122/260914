import { Container, Graphics } from 'pixi.js';
import type { FlameRenderer } from '../flame/FlameRenderer';
import { createFlameRenderer } from '../flame/FlameRenderer';
import { ELEMENT_FLAME_COLORS, flameColorOf } from '../flame/elementColors';
import { BENCH_SURFACE, type Layout, type MaterialId } from '../game/layout';
import type { World } from '../game/world';
import { AFTERGLOW_MS } from '../game/world';
import type { Rng } from '../core/Rng';

const SKY_TOP = 0x1a1f3a;
const SKY_BOTTOM = 0x6b3a2e;
const SEA = 0x121b2e;
const WALL = 0x241f1c;
const WALL_DARK = 0x17130f;
const TABLE = 0x3a2f26;
const TABLE_TOP = 0x4b3d31;
const METAL = 0x8a8f96;
const VERDIGRIS = 0x3e8b78;
const SKIN = 0xd8b48c;
const CLOTH = 0x3b5a6b;

/** 呼んでいないときの腕の角度（体の横に下ろす）。 */
const ARM_REST = 1.35;

function wave(t: number, period: number, phase = 0): number {
  return Math.sin((t / period) * Math.PI * 2 + phase);
}

/** 進み p のうち a..b の区間を 0..1 に切り出す。 */
function seg(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

/** 手を振る人を一体描く（体と腕は別 Graphics で、腕だけ回す）。 */
function drawPerson(body: Graphics, arm: Graphics, u: number): void {
  body.clear();
  body.circle(0, -u * 2.6, u * 0.7).fill({ color: SKIN });
  body.poly([-u * 0.8, -u * 2.0, u * 0.8, -u * 2.0, u * 0.6, 0, -u * 0.6, 0]).fill({ color: CLOTH });
  arm.clear();
  arm.rect(0, -u * 0.22, u * 1.5, u * 0.44).fill({ color: CLOTH });
  arm.position.set(u * 0.7, -u * 1.8);
}

/**
 * 一枚の連続した世界の絵。文字・ボタン・HUD は一切描かない。
 * 縦横は computeLayout の結果に従って同じオブジェクトを置き直すだけ。
 */
export class WorldView {
  readonly root = new Container();

  private readonly bg = new Graphics();
  private readonly wallG = new Graphics();
  private readonly harborG = new Graphics();
  private readonly seaGlowG = new Graphics();
  private readonly shipHull = new Graphics();
  private readonly shipArm = new Graphics();
  private readonly shipG = new Container();
  private readonly rescueG = new Graphics();
  private readonly flareG = new Graphics();
  private readonly launcherG = new Graphics();
  private readonly pierBody = new Graphics();
  private readonly pierArm = new Graphics();
  private readonly pierWorkerG = new Container();
  private readonly harborFrameG = new Graphics();
  private readonly wireG = new Graphics();
  private readonly sparkG = new Graphics();
  private readonly lampGlow = new Graphics();
  private readonly lampG = new Graphics();
  private readonly workerBody = new Graphics();
  private readonly workerArm = new Graphics();
  private readonly workerG = new Container();
  private readonly deskG = new Graphics();
  private readonly factoryGlow = new Graphics();
  private readonly factoryG = new Graphics();
  private readonly batteryG = new Graphics();
  private readonly remoteG = new Graphics();
  private readonly remoteLampG = new Graphics();
  private readonly testFireworkG = new Graphics();
  private readonly deskBody = new Graphics();
  private readonly deskArm = new Graphics();
  private readonly deskWorkerG = new Container();
  private readonly benchG = new Graphics();
  private readonly burnerG = new Graphics();
  private readonly flameRenderer: FlameRenderer = createFlameRenderer();
  private readonly glow: Record<MaterialId, Graphics>;
  private readonly materialG: Record<MaterialId, Graphics>;
  private readonly prismG = new Graphics();

  private l: Layout | null = null;

  constructor(private readonly visualRng: Rng) {
    this.shipG.addChild(this.shipHull, this.shipArm);
    this.workerG.addChild(this.workerBody, this.workerArm);
    this.pierWorkerG.addChild(this.pierBody, this.pierArm);
    this.deskWorkerG.addChild(this.deskBody, this.deskArm);
    const mk = (): Graphics => new Graphics();
    this.glow = { copper_scrap: mk(), strontium_grains: mk(), lithium_powder: mk() };
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
      this.lampGlow,
      this.wireG,
      this.sparkG,
      this.lampG,
      this.workerG,
      this.deskWorkerG,
      this.deskG,
      this.factoryGlow,
      this.factoryG,
      this.batteryG,
      this.remoteG,
      this.remoteLampG,
      this.testFireworkG,
      this.benchG,
      this.burnerG,
      this.flameRenderer.view,
    );
    for (const id of Object.keys(this.glow) as MaterialId[]) {
      this.root.addChild(this.glow[id], this.materialG[id]);
    }
    this.root.addChild(this.prismG);
  }

  /** 画面の向き・大きさに合わせて置き直す（別実装にしない）。 */
  layout(l: Layout): void {
    this.l = l;
    const u = l.unit;

    // 夕暮れの空と工房
    this.bg.clear();
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const k = i / (steps - 1);
      this.bg.rect(0, (l.height * i) / steps, l.width, l.height / steps + 1).fill({ color: mix(SKY_TOP, SKY_BOTTOM, k * k) });
    }

    // 工房の壁
    this.wallG.clear();
    this.wallG.rect(l.workshop.x, l.workshop.y, l.workshop.w, l.workshop.h).fill({ color: WALL });
    this.wallG
      .rect(l.workshop.x, l.workshop.y + l.workshop.h * 0.86, l.workshop.w, l.workshop.h * 0.14)
      .fill({ color: WALL_DARK });
    // 切れた配線の周りの緑青（現実に基づく手がかり）
    this.wallG.circle(l.wireGap.x, l.wireGap.y + u * 0.7, u * 0.95).fill({ color: VERDIGRIS, alpha: 0.3 });

    // 窓の外の港: 夕暮れの空・海・桟橋
    this.harborG.clear();
    const hz = l.waterlineY;
    const sky = 8;
    for (let i = 0; i < sky; i++) {
      const k = i / (sky - 1);
      this.harborG
        .rect(l.harbor.x, l.harbor.y + ((hz - l.harbor.y) * i) / sky, l.harbor.w, (hz - l.harbor.y) / sky + 1)
        .fill({ color: mix(SKY_TOP, SKY_BOTTOM, k) });
    }
    this.harborG.rect(l.harbor.x, hz, l.harbor.w, l.harbor.y + l.harbor.h - hz).fill({ color: SEA });
    // 桟橋
    this.harborG
      .rect(l.harbor.x, l.harbor.y + l.harbor.h * 0.78, l.harbor.w * 0.46, l.harbor.h * 0.22)
      .fill({ color: 0x2b2018 });

    // 窓枠は港の上に重ねる
    this.harborFrameG.clear();
    this.harborFrameG
      .rect(l.harbor.x, l.harbor.y, l.harbor.w, l.harbor.h)
      .stroke({ width: Math.max(2, u * 0.5), color: 0x40372f });
    this.harborFrameG
      .rect(l.harbor.x + l.harbor.w / 2 - u * 0.12, l.harbor.y, u * 0.24, l.harbor.h)
      .fill({ color: 0x40372f });

    // 沖の小さな船
    this.shipHull.clear();
    this.shipHull.poly([-u * 1.6, 0, u * 1.6, 0, u * 1.1, u * 0.7, -u * 1.1, u * 0.7]).fill({ color: 0x0b1220 });
    this.shipHull.rect(-u * 0.1, -u * 1.3, u * 0.2, u * 1.3).fill({ color: 0x0b1220 });
    this.shipHull.circle(u * 0.6, -u * 0.5, u * 0.28).fill({ color: 0x0b1220 });
    this.shipArm.clear();
    this.shipArm.rect(0, -u * 0.12, u * 0.8, u * 0.24).fill({ color: 0x0b1220 });
    this.shipArm.position.set(u * 0.7, -u * 0.6);
    this.shipG.position.set(l.ship.x, l.ship.y);

    // 桟橋の信号炎の発射台と、そこにいる人
    this.launcherG.clear();
    this.launcherG
      .poly([
        l.flareLauncher.x - u * 0.7, l.flareLauncher.y,
        l.flareLauncher.x + u * 0.7, l.flareLauncher.y,
        l.flareLauncher.x + u * 0.42, l.flareLauncher.y - u * 1.7,
        l.flareLauncher.x - u * 0.42, l.flareLauncher.y - u * 1.7,
      ])
      .fill({ color: METAL, alpha: 0.75 });
    drawPerson(this.pierBody, this.pierArm, u * 0.62);
    this.pierWorkerG.position.set(l.pierWorker.x, l.pierWorker.y);

    // 作業員（切れた配線の側）
    drawPerson(this.workerBody, this.workerArm, u);
    this.workerG.position.set(l.worker.x, l.worker.y);

    // 作業机・電池工場の受け口・点火用リモコン
    const d = l.desk;
    this.deskG.clear();
    this.deskG.rect(d.x, d.y + d.h * 0.52, d.w, d.h * 0.12).fill({ color: 0x4b3d31 });
    this.deskG.rect(d.x + d.w * 0.06, d.y + d.h * 0.64, d.w * 0.05, d.h * 0.36).fill({ color: 0x33291f });
    this.deskG.rect(d.x + d.w * 0.89, d.y + d.h * 0.64, d.w * 0.05, d.h * 0.36).fill({ color: 0x33291f });
    this.factoryG.clear();
    // 受け口（漏斗）と装置の箱
    this.factoryG
      .poly([
        l.batteryFactory.x - u * 1.1, l.batteryFactory.y - u * 1.0,
        l.batteryFactory.x + u * 1.1, l.batteryFactory.y - u * 1.0,
        l.batteryFactory.x + u * 0.36, l.batteryFactory.y - u * 0.1,
        l.batteryFactory.x - u * 0.36, l.batteryFactory.y - u * 0.1,
      ])
      .fill({ color: 0x9aa2ab });
    this.factoryG
      .rect(l.batteryFactory.x - u * 1.0, l.batteryFactory.y - u * 0.1, u * 2.0, u * 1.5)
      .fill({ color: 0x3a3f46 });
    // 電池が出てくる口
    this.factoryG
      .rect(l.batteryOutlet.x - u * 0.55, l.batteryOutlet.y - u * 0.34, u * 1.1, u * 0.68)
      .fill({ color: 0x14181d });
    this.remoteG.clear();
    this.remoteG
      .rect(l.remote.x - u * 1.25, l.remote.y - u * 0.75, u * 2.5, u * 1.5)
      .fill({ color: 0x2f3a44 });
    // 電池室（空のときは黒い穴のまま）
    this.remoteG
      .rect(l.remote.x - u * 0.9, l.remote.y - u * 0.34, u * 1.2, u * 0.68)
      .fill({ color: 0x12161a });
    drawPerson(this.deskBody, this.deskArm, u * 0.9);
    this.deskWorkerG.position.set(l.deskWorker.x, l.deskWorker.y);

    // 作業灯（消えている状態を基準に描く）
    this.lampG.clear();
    this.lampG
      .poly([
        l.workLamp.x - u * 1.3, l.workLamp.y,
        l.workLamp.x + u * 1.3, l.workLamp.y,
        l.workLamp.x + u * 0.5, l.workLamp.y - u * 1.2,
        l.workLamp.x - u * 0.5, l.workLamp.y - u * 1.2,
      ])
      .fill({ color: 0x4a4f55 });
    this.lampG.rect(l.workLamp.x - u * 0.12, l.workLamp.y - u * 3.2, u * 0.24, u * 2.0).fill({ color: 0x3a3f45 });
    this.lampG.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 0.55).fill({ color: 0x2a2d31 });

    // 試し燃やし台
    this.benchG.clear();
    this.benchG.rect(l.bench.x, l.bench.y, l.bench.w, l.bench.h).fill({ color: TABLE });
    const surfaceTop = l.bench.y + l.bench.h * (BENCH_SURFACE - 0.2);
    this.benchG.rect(l.bench.x, surfaceTop, l.bench.w, l.bench.h * 0.42).fill({ color: TABLE_TOP });
    this.benchG.rect(l.bench.x, surfaceTop, l.bench.w, Math.max(2, u * 0.25)).fill({ color: 0x5d4c3d });
    this.benchG.rect(l.crate.x, l.crate.y, l.crate.w, l.crate.h).fill({ color: 0x6b4a2c });
    this.benchG
      .rect(l.crate.x + u * 0.3, l.crate.y + u * 0.3, l.crate.w - u * 0.6, l.crate.h - u * 0.6)
      .fill({ color: 0x4e351f });

    // ガスバーナーと材料をすくう金属の輪
    this.burnerG.clear();
    this.burnerG.rect(l.burner.x - u * 0.45, l.burner.y - u * 1.6, u * 0.9, u * 1.6).fill({ color: METAL });
    this.burnerG.ellipse(l.burner.x, l.burner.y, u * 1.5, u * 0.5).fill({ color: 0x5a5f66 });
    this.burnerG
      .ellipse(l.burner.x + u * 2.4, l.burner.y - u * 0.4, u * 0.9, u * 0.34)
      .stroke({ width: Math.max(2, u * 0.18), color: METAL });

    this.flameRenderer.layout(l.flame.x, l.flame.y, l.flame.w, l.flame.h);

    // 材料（炎色と無関係な地味な見た目）
    const r = l.touchRadius * 0.62;
    const copper = this.materialG.copper_scrap;
    copper.clear();
    for (let i = 0; i < 4; i++) {
      copper
        .ellipse(0, 0, r * (0.9 - i * 0.14), r * (0.55 - i * 0.1))
        .stroke({ width: Math.max(1.5, r * 0.13), color: 0x8a5a33, alpha: 0.95 });
    }
    copper.rotation = 0.3;
    const sr = this.materialG.strontium_grains;
    sr.clear();
    sr.poly([-r, r * 0.5, r, r * 0.5, r * 0.55, -r * 0.35, -r * 0.55, -r * 0.35]).fill({ color: 0xc9c4b6 });
    for (let i = 0; i < 5; i++) {
      sr.circle((i - 2) * r * 0.32, r * 0.1 - (i % 2) * r * 0.25, r * 0.16).fill({ color: 0xe2ded2 });
    }
    const li = this.materialG.lithium_powder;
    li.clear();
    li.ellipse(0, r * 0.55, r * 0.8, r * 0.28).fill({ color: 0x7a6a58 });
    li.rect(-r * 0.75, -r * 0.35, r * 1.5, r * 0.95).fill({ color: 0x9a8a74 });
    li.ellipse(0, -r * 0.35, r * 0.75, r * 0.26).fill({ color: 0xf2f0ea });

    // プリズム（置くだけ。v1 機能は M3）
    this.prismG.clear();
    this.prismG.poly([0, -r * 1.0, r * 0.95, r * 0.7, -r * 0.95, r * 0.7]).fill({ color: 0xbfe6f5, alpha: 0.55 });
    this.prismG
      .poly([0, -r * 1.0, r * 0.95, r * 0.7, -r * 0.95, r * 0.7])
      .stroke({ width: Math.max(1.5, r * 0.1), color: 0xeaf7ff, alpha: 0.8 });
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

    this.updateWiring(world, timeMs, u, l);
    this.updateFlare(world, timeMs, u, l);
    this.updateBattery(world, timeMs, u, l);
    this.updateMaterials(world, timeMs, l);
    this.prismG.position.set(world.prismPos.x, world.prismPos.y);
  }

  /** 銅: 火花が止まり、線がつながり、電流が走って作業灯が灯る。 */
  private updateWiring(world: World, timeMs: number, u: number, l: Layout): void {
    const job = world.job('wiring');
    // 呼ばれている間だけ線が切れている。直った後はそのまま繋がったまま。
    const called = job.status === 'called';
    const t = job.status === 'job_running' ? job.progress : called ? 0 : 1;
    const connected = t >= 1;
    this.wireG.clear();
    const lw = Math.max(2, u * 0.26);
    this.wireG
      .moveTo(l.wireLeft.x, l.wireLeft.y)
      .lineTo(l.wireGap.x - u * 1.1 * (1 - t), l.wireGap.y)
      .stroke({ width: lw, color: 0x7a4a2a });
    this.wireG
      .moveTo(l.wireGap.x + u * 1.1 * (1 - t), l.wireGap.y)
      .lineTo(l.wireRight.x, l.wireRight.y)
      .stroke({ width: lw, color: 0x7a4a2a });
    if (connected) {
      this.wireG
        .moveTo(l.wireLeft.x, l.wireLeft.y)
        .lineTo(l.wireRight.x, l.wireRight.y)
        .stroke({ width: lw * 0.5, color: 0xffe9a8, alpha: 0.35 + 0.25 * wave(timeMs, 900) });
    }

    this.sparkG.clear();
    if (job.status === 'called') {
      for (let i = 0; i < 7; i++) {
        const a = this.visualRng.range(-Math.PI, Math.PI);
        const d = this.visualRng.range(u * 0.2, u * 2.2);
        this.sparkG
          .circle(l.wireGap.x + Math.cos(a) * d, l.wireGap.y + Math.sin(a) * d * 0.7, Math.max(1, u * this.visualRng.range(0.05, 0.16)))
          .fill({ color: 0xfff0b0, alpha: this.visualRng.range(0.4, 1) });
      }
      this.sparkG
        .circle(l.wireGap.x, l.wireGap.y, u * 0.5)
        .fill({ color: 0xfff6d0, alpha: 0.5 + 0.4 * wave(timeMs, 220) });
    }

    const lit = t;
    this.lampGlow.clear();
    if (lit > 0) {
      const flick = 0.9 + 0.1 * wave(timeMs, 1700);
      // 光の輪郭が硬く出ないよう、広い薄い錐と狭い明るい錐を重ねる
      for (const [spread, depth, alpha] of [
        [7.5, 12, 0.07],
        [4.6, 9, 0.07],
        [2.4, 6, 0.08],
      ] as const) {
        this.lampGlow
          .poly([
            l.workLamp.x - u * 1.0, l.workLamp.y,
            l.workLamp.x + u * 1.0, l.workLamp.y,
            l.workLamp.x + u * spread, l.workLamp.y + u * depth,
            l.workLamp.x - u * spread, l.workLamp.y + u * depth,
          ])
          .fill({ color: 0xffe6b0, alpha: alpha * lit * flick });
      }
      this.lampGlow.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 2.2).fill({ color: 0xffeec4, alpha: 0.35 * lit * flick });
      this.lampGlow.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 0.8).fill({ color: 0xfff7e0, alpha: 0.9 * lit * flick });
    }

    this.workerArm.rotation = called ? -0.9 + wave(timeMs, 520) * 0.7 : ARM_REST;
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
      this.flareG.circle(l.flareLauncher.x, y, u * 0.34).fill({ color: 0xfff0f0, alpha: fade });
      this.flareG.circle(l.flareLauncher.x, y, u * 1.5).fill({ color: red, alpha: 0.5 * fade });
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
      this.flareG
        .circle(l.flareLauncher.x, l.flareLauncher.y - u * 1.7, u * 0.5)
        .fill({ color: red, alpha: 0.7 * seg(p, 0, 0.15) });
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

    // 船の人: 呼んでいる間は腕を振り、信号炎が上がったら腕を下ろす
    const calling = job.status === 'called';
    this.shipArm.rotation = calling && p < 0.5 ? -1.0 + wave(timeMs, 460) * 0.7 : ARM_REST;
    this.shipG.y = l.ship.y + wave(timeMs, 2600) * u * 0.2;

    // 桟橋の人
    this.pierArm.rotation = calling ? -0.9 + wave(timeMs, 540) * 0.7 : ARM_REST;

    // 救助船の光が近づく
    this.rescueG.clear();
    const come = seg(p, 0.6, 1);
    if (come > 0) {
      const x = l.rescueFrom.x + (l.rescueTo.x - l.rescueFrom.x) * come;
      const y = l.rescueFrom.y;
      this.rescueG.circle(x, y, u * 0.46).fill({ color: 0xffffff, alpha: 0.95 });
      this.rescueG.circle(x, y, u * 1.0).fill({ color: 0xdcefff, alpha: 0.45 });
      this.rescueG.circle(x, y, u * 1.9).fill({ color: 0xbfe0ff, alpha: 0.22 });
      this.rescueG
        .poly([x, y - u * 0.3, x, y + u * 0.3, l.ship.x, l.ship.y + u * 0.6, l.ship.x, l.ship.y - u * 0.6])
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
      this.factoryGlow
        .circle(l.batteryFactory.x, l.batteryFactory.y - u * 1.0, u * 0.9)
        .fill({ color: 0xf2f0ea, alpha: 0.5 * feeding });
    }
    if (working > 0) {
      this.factoryGlow
        .rect(l.batteryFactory.x - u * 1.0, l.batteryFactory.y - u * 0.1, u * 2.0, u * 1.5)
        .fill({ color: 0xffd9a0, alpha: 0.3 * working * (0.6 + 0.4 * wave(timeMs, 160)) });
    }
    this.factoryG.x = working > 0 ? wave(timeMs, 90) * u * 0.14 * working : 0;

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
      this.batteryG.rect(x - u * 0.5 * emerge, y - u * 0.3, u * 1.0 * emerge, u * 0.6).fill({ color: 0xc9a227 });
      this.batteryG.rect(x + u * 0.5 * emerge - u * 0.12, y - u * 0.16, u * 0.12, u * 0.32).fill({ color: 0xe8e2d0 });
    }

    // リモコンのランプ
    this.remoteLampG.clear();
    const lit = inPlace ? (running ? seg(p, 0.85, 1) : 1) : 0;
    if (lit > 0) {
      const flick = 0.85 + 0.15 * wave(timeMs, 1300);
      this.remoteLampG.circle(l.remoteLamp.x, l.remoteLamp.y, u * 0.34).fill({ color: 0xfff6d0, alpha: lit * flick });
      this.remoteLampG.circle(l.remoteLamp.x, l.remoteLamp.y, u * 1.2).fill({ color: 0xffe9a0, alpha: 0.4 * lit * flick });
      this.remoteLampG.circle(l.remoteLamp.x, l.remoteLamp.y, u * 2.4).fill({ color: 0xffe9a0, alpha: 0.16 * lit * flick });
    }

    // 点火テストの小さな火（パチッ）
    this.testFireworkG.clear();
    const fire = running ? seg(p, 0.9, 0.97) * (1 - seg(p, 0.97, 1)) : 0;
    if (fire > 0) {
      const f = l.testFirework;
      this.testFireworkG.circle(f.x, f.y, u * 0.3 * fire).fill({ color: 0xfff6d0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const d = u * (0.6 + 1.1 * fire);
        this.testFireworkG
          .circle(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, Math.max(1, u * 0.1))
          .fill({ color: 0xffe9a8, alpha: fire });
      }
    }

    this.deskArm.rotation = called ? -0.9 + wave(timeMs, 500) * 0.7 : ARM_REST;
  }

  /** 材料と余熱発光。 */
  private updateMaterials(world: World, timeMs: number, l: Layout): void {
    for (const m of world.materials) {
      const g = this.materialG[m.id];
      const glow = this.glow[m.id];
      g.position.set(m.x, m.y);
      glow.position.set(m.x, m.y);
      glow.clear();
      const k = m.inFlame ? 1 : m.afterglowMs / AFTERGLOW_MS;
      if (k > 0) {
        const c = flameColorOf(m.element);
        const rr = l.touchRadius * (0.8 + 0.2 * wave(timeMs, 640));
        glow.circle(0, 0, rr).fill({ color: c.hex, alpha: 0.5 * k });
        glow.circle(0, 0, rr * 0.55).fill({ color: c.hex, alpha: 0.55 * k });
      }
      g.scale.set(m.at === 'held' ? 1.12 : 1);
    }
  }

  destroy(): void {
    this.flameRenderer.destroy();
    this.root.destroy({ children: true });
  }
}

function mix(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * k);
  const bl = Math.round(ab + ((b & 255) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}
