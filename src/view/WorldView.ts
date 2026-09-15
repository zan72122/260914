import { Container, Graphics } from 'pixi.js';
import type { FlameRenderer } from '../flame/FlameRenderer';
import { createFlameRenderer } from '../flame/FlameRenderer';
import { flameColorOf } from '../flame/elementColors';
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

function wave(t: number, period: number, phase = 0): number {
  return Math.sin((t / period) * Math.PI * 2 + phase);
}

/**
 * 一枚の連続した世界の絵。文字・ボタン・HUD は一切描かない。
 * 縦横は computeLayout の結果に従って同じオブジェクトを置き直すだけ。
 */
export class WorldView {
  readonly root = new Container();

  private readonly bg = new Graphics();
  private readonly harborG = new Graphics();
  private readonly shipG = new Graphics();
  private readonly wallG = new Graphics();
  private readonly wireG = new Graphics();
  private readonly sparkG = new Graphics();
  private readonly lampGlow = new Graphics();
  private readonly lampG = new Graphics();
  private readonly workerBody = new Graphics();
  private readonly workerArm = new Graphics();
  private readonly workerG = new Container();
  private readonly deviceG = new Graphics();
  private readonly benchG = new Graphics();
  private readonly burnerG = new Graphics();
  private readonly flameRenderer: FlameRenderer = createFlameRenderer();
  private readonly glow: Record<MaterialId, Graphics>;
  private readonly materialG: Record<MaterialId, Graphics>;
  private readonly prismG = new Graphics();

  private l: Layout | null = null;

  constructor(private readonly visualRng: Rng) {
    this.workerG.addChild(this.workerBody, this.workerArm);
    const mk = (): Graphics => new Graphics();
    this.glow = {
      copper_scrap: mk(),
      strontium_grains: mk(),
      lithium_powder: mk(),
    };
    this.materialG = {
      copper_scrap: mk(),
      strontium_grains: mk(),
      lithium_powder: mk(),
    };
    this.root.addChild(
      this.bg,
      this.wallG,
      this.harborG,
      this.shipG,
      this.lampGlow,
      this.wireG,
      this.sparkG,
      this.lampG,
      this.workerG,
      this.deviceG,
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
    const u = Math.max(6, Math.min(l.width, l.height) * 0.02);

    // 夕暮れの空と工房の床
    this.bg.clear();
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const k = i / (steps - 1);
      const c = mix(SKY_TOP, SKY_BOTTOM, k * k);
      this.bg.rect(0, (l.height * i) / steps, l.width, l.height / steps + 1).fill({ color: c });
    }

    // 工房の壁（奥）
    this.wallG.clear();
    this.wallG.rect(l.workshop.x, l.workshop.y, l.workshop.w, l.workshop.h).fill({ color: WALL });
    this.wallG
      .rect(l.workshop.x, l.workshop.y + l.workshop.h * 0.86, l.workshop.w, l.workshop.h * 0.14)
      .fill({ color: WALL_DARK });
    // 切れた配線の周りの緑青（現実に基づく手がかり）
    this.wallG.circle(l.wireGap.x, l.wireGap.y + u * 0.9, u * 1.6).fill({ color: VERDIGRIS, alpha: 0.35 });

    // 窓の外の港（位置の確保）
    this.harborG.clear();
    const hz = l.harbor.y + l.harbor.h * 0.55; // 水平線
    const sky = 8;
    for (let i = 0; i < sky; i++) {
      const k = i / (sky - 1);
      this.harborG
        .rect(l.harbor.x, l.harbor.y + ((hz - l.harbor.y) * i) / sky, l.harbor.w, (hz - l.harbor.y) / sky + 1)
        .fill({ color: mix(SKY_TOP, SKY_BOTTOM, k) });
    }
    this.harborG.rect(l.harbor.x, hz, l.harbor.w, l.harbor.y + l.harbor.h - hz).fill({ color: SEA });
    // 窓枠
    this.harborG
      .rect(l.harbor.x, l.harbor.y, l.harbor.w, l.harbor.h)
      .stroke({ width: Math.max(2, u * 0.5), color: 0x40372f });
    this.harborG
      .rect(l.harbor.x + l.harbor.w / 2 - u * 0.12, l.harbor.y, u * 0.24, l.harbor.h)
      .fill({ color: 0x40372f });
    // 工房の桟橋
    this.harborG
      .rect(l.harbor.x, l.harbor.y + l.harbor.h - u * 0.8, l.harbor.w * 0.45, u * 0.8)
      .fill({ color: 0x2b2018 });
    // 桟橋の信号炎の発射台
    this.harborG
      .rect(l.flareLauncher.x - u * 0.6, l.flareLauncher.y - u * 1.4, u * 1.2, u * 1.6)
      .fill({ color: METAL, alpha: 0.7 });

    // 沖の小さな船（位置の確保）
    this.shipG.clear();
    this.shipG
      .poly([-u * 1.6, 0, u * 1.6, 0, u * 1.1, u * 0.7, -u * 1.1, u * 0.7])
      .fill({ color: 0x0b1220 });
    this.shipG.rect(-u * 0.1, -u * 1.3, u * 0.2, u * 1.3).fill({ color: 0x0b1220 });
    this.shipG.position.set(l.ship.x, l.ship.y);
    this.shipG.scale.set(1);

    // 作業員（手を振る）
    this.workerBody.clear();
    this.workerBody.circle(0, -u * 2.6, u * 0.7).fill({ color: 0xd8b48c });
    this.workerBody
      .poly([-u * 0.8, -u * 2.0, u * 0.8, -u * 2.0, u * 0.6, 0, -u * 0.6, 0])
      .fill({ color: 0x3b5a6b });
    this.workerArm.clear();
    this.workerArm.rect(0, -u * 0.22, u * 1.5, u * 0.44).fill({ color: 0x3b5a6b });
    this.workerArm.position.set(u * 0.7, -u * 1.8);
    this.workerG.position.set(l.worker.x, l.worker.y);
    this.workerG.scale.set(2.2);

    // 作業机のリモコンと電池工場の受け口（位置の確保）
    this.deviceG.clear();
    this.deviceG
      .rect(l.remote.x - u * 1.2, l.remote.y - u * 0.8, u * 2.4, u * 1.6)
      .fill({ color: 0x2f3a44 });
    this.deviceG
      .rect(l.remote.x - u * 0.5, l.remote.y - u * 0.3, u * 1.0, u * 0.6)
      .fill({ color: 0x14181d });
    this.deviceG
      .rect(l.batteryFactory.x - u * 1.4, l.batteryFactory.y - u * 1.6, u * 2.8, u * 3.0)
      .fill({ color: 0x3a3f46 });
    this.deviceG
      .rect(l.batteryFactory.x - u * 0.7, l.batteryFactory.y - u * 1.2, u * 1.4, u * 0.7)
      .fill({ color: 0x0f1216 });

    // 試し燃やし台
    this.benchG.clear();
    this.benchG.rect(l.bench.x, l.bench.y, l.bench.w, l.bench.h).fill({ color: TABLE });
    // 台の面（物が載る帯）。縦横どちらでも同じ規則で置く。
    const surfaceTop = l.bench.y + l.bench.h * (BENCH_SURFACE - 0.2);
    const surfaceH = l.bench.h * 0.42;
    this.benchG.rect(l.bench.x, surfaceTop, l.bench.w, surfaceH).fill({ color: TABLE_TOP });
    this.benchG.rect(l.bench.x, surfaceTop, l.bench.w, Math.max(2, u * 0.25)).fill({ color: 0x5d4c3d });
    // 材料が転がる木箱
    this.benchG.rect(l.crate.x, l.crate.y, l.crate.w, l.crate.h).fill({ color: 0x6b4a2c });
    this.benchG
      .rect(l.crate.x + u * 0.3, l.crate.y + u * 0.3, l.crate.w - u * 0.6, l.crate.h - u * 0.6)
      .fill({ color: 0x4e351f });

    // ガスバーナーと材料をすくう金属の輪
    this.burnerG.clear();
    this.burnerG
      .rect(l.burner.x - u * 0.45, l.burner.y - u * 1.6, u * 0.9, u * 1.6)
      .fill({ color: METAL });
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
    this.prismG
      .poly([0, -r * 1.0, r * 0.95, r * 0.7, -r * 0.95, r * 0.7])
      .fill({ color: 0xbfe6f5, alpha: 0.55 });
    this.prismG
      .poly([0, -r * 1.0, r * 0.95, r * 0.7, -r * 0.95, r * 0.7])
      .stroke({ width: Math.max(1.5, r * 0.1), color: 0xeaf7ff, alpha: 0.8 });

    // 作業灯（消えている状態を基準に描く）
    this.lampG.clear();
    this.lampG
      .poly([l.workLamp.x - u * 1.3, l.workLamp.y, l.workLamp.x + u * 1.3, l.workLamp.y, l.workLamp.x + u * 0.5, l.workLamp.y - u * 1.2, l.workLamp.x - u * 0.5, l.workLamp.y - u * 1.2])
      .fill({ color: 0x4a4f55 });
    this.lampG
      .rect(l.workLamp.x - u * 0.12, l.workLamp.y - u * 3.2, u * 0.24, u * 2.0)
      .fill({ color: 0x3a3f45 });
    this.lampG.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 0.55).fill({ color: 0x2a2d31 });
  }

  update(world: World, timeMs: number): void {
    const l = this.l;
    if (!l) return;
    const u = Math.max(6, Math.min(l.width, l.height) * 0.02);
    const job = world.job('wiring');

    this.flameRenderer.update({
      element: world.flameElement,
      intensityPct: world.flameIntensityPct,
      timeMs,
    });

    // 配線: 切れているときは隙間が空き、繋がると一本になる
    const connected = job.status === 'job_running' || job.status === 'done';
    const t = job.status === 'job_running' ? Math.min(1, job.elapsedMs / 1400) : connected ? 1 : 0;
    this.wireG.clear();
    const lw = Math.max(2, u * 0.26);
    this.wireG.moveTo(l.wireLeft.x, l.wireLeft.y).lineTo(l.wireGap.x - u * 1.1 * (1 - t), l.wireGap.y).stroke({ width: lw, color: 0x7a4a2a });
    this.wireG.moveTo(l.wireGap.x + u * 1.1 * (1 - t), l.wireGap.y).lineTo(l.wireRight.x, l.wireRight.y).stroke({ width: lw, color: 0x7a4a2a });
    if (connected) {
      this.wireG
        .moveTo(l.wireLeft.x, l.wireLeft.y)
        .lineTo(l.wireRight.x, l.wireRight.y)
        .stroke({ width: lw * 0.5, color: 0xffe9a8, alpha: 0.35 + 0.25 * wave(timeMs, 900) });
    }

    // 火花（種で固定した乱数で散る）
    this.sparkG.clear();
    if (job.status === 'called') {
      for (let i = 0; i < 7; i++) {
        const a = this.visualRng.range(-Math.PI, Math.PI);
        const d = this.visualRng.range(u * 0.2, u * 2.2);
        const x = l.wireGap.x + Math.cos(a) * d;
        const y = l.wireGap.y + Math.sin(a) * d * 0.7;
        this.sparkG.circle(x, y, Math.max(1, u * this.visualRng.range(0.05, 0.16))).fill({
          color: 0xfff0b0,
          alpha: this.visualRng.range(0.4, 1),
        });
      }
      this.sparkG.circle(l.wireGap.x, l.wireGap.y, u * 0.5).fill({ color: 0xfff6d0, alpha: 0.5 + 0.4 * wave(timeMs, 220) });
    }

    // 作業灯
    const lit = job.lampLit;
    this.lampGlow.clear();
    if (lit > 0) {
      const flick = 0.9 + 0.1 * wave(timeMs, 1700);
      this.lampGlow
        .poly([
          l.workLamp.x - u * 1.1,
          l.workLamp.y,
          l.workLamp.x + u * 1.1,
          l.workLamp.y,
          l.workLamp.x + u * 7.5,
          l.workLamp.y + u * 12,
          l.workLamp.x - u * 7.5,
          l.workLamp.y + u * 12,
        ])
        .fill({ color: 0xffe6b0, alpha: 0.13 * lit * flick });
      this.lampGlow.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 2.2).fill({ color: 0xffeec4, alpha: 0.35 * lit * flick });
      this.lampGlow.circle(l.workLamp.x, l.workLamp.y + u * 0.2, u * 0.8).fill({ color: 0xfff7e0, alpha: 0.9 * lit * flick });
    }

    // 作業員: 呼んでいる間は手を振る
    const calling = job.status === 'called';
    this.workerArm.rotation = calling ? -0.9 + wave(timeMs, 520) * 0.7 : 0.2;
    this.shipG.y = l.ship.y + wave(timeMs, 2600) * u * 0.2;

    // 材料と余熱発光
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
      const heldNow = m.at === 'held';
      g.scale.set(heldNow ? 1.12 : 1);
    }

    this.prismG.position.set(world.prismPos.x, world.prismPos.y);
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
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}
