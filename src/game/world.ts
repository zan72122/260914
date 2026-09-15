import type { ElementId } from '../flame/elements';
import { ELEMENT_KANA, ELEMENT_LABEL } from '../flame/elements';
import type { EventLog } from '../core/EventLog';
import type { Rng } from '../core/Rng';
import type { JobId, Layout, MaterialId, Point } from './layout';
import { MATERIAL_ELEMENT, MATERIAL_IDS } from './layout';

/** 材料が炎から出た後も色を保つ時間（運搬中に色を見せるための意図的な乖離）。 */
export const AFTERGLOW_MS = 3000;
/** 仕事が動いている時間（火花が止まり、線がつながり、灯が点くまで）。 */
export const JOB_RUN_MS = 1400;
/** 直った状態を保つ時間。この後、次の困りを待つ。 */
export const DONE_HOLD_MS = 3000;
/** 次の困りが起きるまでの幅（数十秒）。 */
export const TROUBLE_DELAY_MIN_MS = 25000;
export const TROUBLE_DELAY_MAX_MS = 40000;

export type Phase = 'idle' | 'dragging' | 'delivering' | 'job_running';
/**
 * 仕事の状態。PLAN 5.2 の 4 値に加え、5.6 の手順 4 が参照する 'job_running' を持つ
 * （届いた直後、仕事が動いている間）。
 */
export type JobStatus = 'waiting' | 'called' | 'job_running' | 'done' | 'cooldown';

export type MaterialPlace = 'bench' | 'held' | `site:${JobId}`;

export interface MaterialState {
  id: MaterialId;
  element: ElementId;
  at: MaterialPlace;
  x: number;
  y: number;
  inFlame: boolean;
  afterglowMs: number;
}

export interface JobState {
  id: JobId;
  element: ElementId;
  status: JobStatus;
  /** 呼ばれたゲーム内時刻（ms）。呼ばれていなければ null */
  calledAt: number | null;
  /** 状態が変わってからの経過（ms） */
  elapsedMs: number;
  /** 次の困りが起きる時刻（ms）。無ければ null */
  nextTroubleAt: number | null;
  /** 作業灯の明るさ 0..1（銅の仕事の結果） */
  lampLit: number;
}

export interface SpeechRequest {
  /** 実際に喋る文字列（かな指定） */
  text: string;
  /** ログ・報告用の表記 */
  label: string;
  reason: 'call' | 'thanks';
}

export interface WorldStateView {
  phase: Phase;
  held: { id: MaterialId; element: ElementId; inFlame: boolean; afterglowMs: number } | null;
  flame: { element: ElementId | null; intensityPct: number };
  jobs: { id: JobId; element: ElementId; status: JobStatus; calledAt: number | null }[];
  materials: { id: MaterialId; element: ElementId; at: MaterialPlace }[];
  prism: { at: 'bench' | 'held'; projecting: ElementId | null };
  input: { accepting: boolean; rejectReason?: string };
  waitingFor: string | null;
}

export interface WorldDeps {
  layout: Layout;
  rng: Rng;
  log: EventLog;
  speak: (req: SpeechRequest) => void;
}

function dist(ax: number, ay: number, b: Point): number {
  return Math.hypot(ax - b.x, ay - b.y);
}

/**
 * 世界の規則。描画も入力装置も知らない純粋な模型。
 * 本番も検証も、入力 → この模型 → 描画、という同じ経路を通る。
 */
export class World {
  layout: Layout;
  private rng: Rng;
  private log: EventLog;
  private speakOut: (req: SpeechRequest) => void;

  phase: Phase = 'idle';
  materials: MaterialState[] = [];
  jobs: JobState[] = [];
  flameElement: ElementId | null = null;
  flameIntensityPct = 100;
  prismAt: 'bench' | 'held' = 'bench';
  prismPos: Point = { x: 0, y: 0 };
  heldId: MaterialId | null = null;
  heldPrism = false;
  pointer: Point | null = null;
  timeMs = 0;
  /** 直近の入力拒否の理由 */
  rejectReason: string | undefined;

  constructor(deps: WorldDeps) {
    this.layout = deps.layout;
    this.rng = deps.rng;
    this.log = deps.log;
    this.speakOut = deps.speak;
    this.reset();
  }

  /** 通常の初期化経路。シナリオはこの後に状態を進めるだけ。 */
  reset(): void {
    this.phase = 'idle';
    this.flameElement = null;
    this.flameIntensityPct = 100;
    this.heldId = null;
    this.heldPrism = false;
    this.pointer = null;
    this.timeMs = 0;
    this.rejectReason = undefined;
    this.prismAt = 'bench';
    this.prismPos = { ...this.layout.prism };
    this.materials = MATERIAL_IDS.map((id) => ({
      id,
      element: MATERIAL_ELEMENT[id],
      at: 'bench' as MaterialPlace,
      x: this.layout.materialSlots[id].x,
      y: this.layout.materialSlots[id].y,
      inFlame: false,
      afterglowMs: 0,
    }));
    this.jobs = [
      {
        id: 'wiring',
        element: 'copper',
        status: 'waiting',
        calledAt: null,
        elapsedMs: 0,
        nextTroubleAt: null,
        lampLit: 0,
      },
    ];
  }

  /** 画面の向き・大きさが変わったときの置き直し。同じ物を動かすだけ。 */
  setLayout(layout: Layout): void {
    const old = this.layout;
    this.layout = layout;
    for (const m of this.materials) {
      if (m.at === 'bench') {
        const slot = layout.materialSlots[m.id];
        m.x = slot.x;
        m.y = slot.y;
      } else if (m.at === 'held') {
        // 指の位置に追従しているのでそのまま
      } else {
        const site = this.sitePoint(m.at);
        const oldSite = this.sitePointOf(old, m.at);
        m.x = site.x + (m.x - oldSite.x);
        m.y = site.y + (m.y - oldSite.y);
      }
    }
    if (this.prismAt === 'bench') this.prismPos = { ...layout.prism };
  }

  private sitePointOf(layout: Layout, place: MaterialPlace): Point {
    switch (place) {
      case 'site:wiring':
        return layout.wireGap;
      case 'site:flare':
        return layout.flareLauncher;
      case 'site:battery':
        return layout.batteryFactory;
      default:
        return layout.prism;
    }
  }

  private sitePoint(place: MaterialPlace): Point {
    return this.sitePointOf(this.layout, place);
  }

  job(id: JobId): JobState {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) throw new Error(`unknown job: ${id}`);
    return j;
  }

  material(id: MaterialId): MaterialState {
    const m = this.materials.find((x) => x.id === id);
    if (!m) throw new Error(`unknown material: ${id}`);
    return m;
  }

  get held(): MaterialState | null {
    return this.heldId === null ? null : this.material(this.heldId);
  }

  get acceptingInput(): boolean {
    return this.phase !== 'job_running';
  }

  /** 困りを起こす（切れた配線が火花を出し、作業員が名前を呼ぶ）。 */
  raiseTrouble(id: JobId): void {
    const j = this.job(id);
    j.status = 'called';
    j.calledAt = this.timeMs;
    j.elapsedMs = 0;
    j.nextTroubleAt = null;
    j.lampLit = 0;
    this.log.push({ t: this.timeMs, kind: 'job', msg: 'trouble', data: { job: j.id } });
    const kana = ELEMENT_KANA[j.element];
    this.speakOut({
      text: `${kana}〜`,
      label: `${ELEMENT_LABEL[j.element]}〜`,
      reason: 'call',
    });
  }

  // ---- 入力（一本指のドラッグ一筆書き） ----

  pointerDown(x: number, y: number): void {
    if (!this.acceptingInput) {
      this.rejectReason = 'job_animation';
      this.log.push({ t: this.timeMs, kind: 'input', msg: 'down_rejected', data: { reason: this.rejectReason } });
      return;
    }
    this.rejectReason = undefined;
    this.pointer = { x, y };
    const r = this.layout.touchRadius;
    let best: MaterialState | null = null;
    let bestD = Infinity;
    for (const m of this.materials) {
      if (m.at === 'held') continue;
      const d = Math.hypot(x - m.x, y - m.y);
      if (d <= r * 1.2 && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    const dPrism = dist(x, y, this.prismPos);
    if (best && bestD <= dPrism) {
      this.heldId = best.id;
      best.at = 'held';
      best.x = x;
      best.y = y;
      this.phase = 'dragging';
      this.log.push({ t: this.timeMs, kind: 'input', msg: 'down', data: { grabbed: best.id, x: Math.round(x), y: Math.round(y) } });
      return;
    }
    if (dPrism <= r * 1.2) {
      this.heldPrism = true;
      this.prismAt = 'held';
      this.prismPos = { x, y };
      this.phase = 'dragging';
      this.log.push({ t: this.timeMs, kind: 'input', msg: 'down', data: { grabbed: 'prism' } });
      return;
    }
    this.log.push({ t: this.timeMs, kind: 'input', msg: 'down', data: { grabbed: null } });
  }

  pointerMove(x: number, y: number): void {
    if (!this.acceptingInput) return;
    this.pointer = { x, y };
    const m = this.held;
    if (m) {
      m.x = x;
      m.y = y;
      this.evaluateFlameContact(m);
      return;
    }
    if (this.heldPrism) this.prismPos = { x, y };
  }

  pointerUp(x: number, y: number): void {
    if (!this.acceptingInput) return;
    this.pointer = null;
    if (this.heldPrism) {
      this.heldPrism = false;
      this.prismAt = 'bench';
      this.prismPos = { ...this.layout.prism };
      this.phase = 'idle';
      this.log.push({ t: this.timeMs, kind: 'input', msg: 'up', data: { released: 'prism' } });
      return;
    }
    const m = this.held;
    if (!m) {
      this.log.push({ t: this.timeMs, kind: 'input', msg: 'up', data: { released: null } });
      return;
    }
    m.x = x;
    m.y = y;
    if (m.inFlame) this.leaveFlame(m);
    this.heldId = null;
    this.log.push({ t: this.timeMs, kind: 'input', msg: 'up', data: { released: m.id, x: Math.round(x), y: Math.round(y) } });
    this.dropAt(m, x, y);
  }

  pointerCancel(): void {
    const m = this.held;
    if (m) {
      if (m.inFlame) this.leaveFlame(m);
      this.heldId = null;
      this.dropAt(m, m.x, m.y);
    }
    if (this.heldPrism) {
      this.heldPrism = false;
      this.prismAt = 'bench';
      this.prismPos = { ...this.layout.prism };
    }
    this.pointer = null;
    if (this.phase === 'dragging' || this.phase === 'delivering') this.phase = 'idle';
  }

  private evaluateFlameContact(m: MaterialState): void {
    const f = this.layout.flame;
    const inside =
      Math.abs(m.x - f.x) <= f.w * 0.55 && m.y <= f.y + f.h * 0.12 && m.y >= f.y - f.h;
    if (inside && !m.inFlame) {
      m.inFlame = true;
      m.afterglowMs = AFTERGLOW_MS;
      this.flameElement = m.element;
      this.flameIntensityPct = 132;
      this.phase = 'dragging';
      this.log.push({ t: this.timeMs, kind: 'flame', msg: 'enter', data: { material: m.id, element: m.element } });
    } else if (!inside && m.inFlame) {
      this.leaveFlame(m);
    }
  }

  private leaveFlame(m: MaterialState): void {
    m.inFlame = false;
    m.afterglowMs = AFTERGLOW_MS;
    this.flameElement = null;
    this.flameIntensityPct = 100;
    this.phase = 'delivering';
    this.log.push({ t: this.timeMs, kind: 'flame', msg: 'exit', data: { material: m.id, element: m.element } });
  }

  /** 落とした場所で仕事が動くか決める。動かなければ材料はその場に残る。 */
  private dropAt(m: MaterialState, x: number, y: number): void {
    const r = this.layout.touchRadius * 1.5;
    const j = this.job('wiring');
    if (dist(x, y, this.layout.wireGap) <= r) {
      m.at = 'site:wiring';
      if (m.element !== j.element) {
        this.phase = 'idle';
        this.log.push({
          t: this.timeMs,
          kind: 'deliver',
          msg: 'mismatch',
          data: { job: j.id, material: m.id, reason: 'element_mismatch', want: j.element, got: m.element },
        });
        return;
      }
      if (j.status !== 'called' && j.status !== 'waiting') {
        this.phase = 'idle';
        this.log.push({
          t: this.timeMs,
          kind: 'deliver',
          msg: 'mismatch',
          data: { job: j.id, material: m.id, reason: 'job_not_called', status: j.status },
        });
        return;
      }
      j.status = 'job_running';
      j.elapsedMs = 0;
      this.phase = 'job_running';
      this.log.push({
        t: this.timeMs,
        kind: 'deliver',
        msg: 'success',
        data: { job: j.id, material: m.id, element: m.element },
      });
      this.speakOut({
        text: `${ELEMENT_KANA[j.element]}、ありがとう`,
        label: `${ELEMENT_LABEL[j.element]}、ありがとう`,
        reason: 'thanks',
      });
      return;
    }
    // 台やその他の場所: そのまま残り、拾い直せる
    m.at = 'bench';
    this.phase = 'idle';
    this.log.push({ t: this.timeMs, kind: 'deliver', msg: 'dropped', data: { material: m.id, at: 'bench' } });
  }

  // ---- 時間 ----

  update(dtMs: number, timeMs: number): void {
    this.timeMs = timeMs;
    for (const m of this.materials) {
      if (m.inFlame) {
        m.afterglowMs = AFTERGLOW_MS;
      } else if (m.afterglowMs > 0) {
        m.afterglowMs = Math.max(0, m.afterglowMs - dtMs);
      }
    }
    for (const j of this.jobs) {
      j.elapsedMs += dtMs;
      switch (j.status) {
        case 'job_running': {
          j.lampLit = Math.min(1, j.elapsedMs / JOB_RUN_MS);
          if (j.elapsedMs >= JOB_RUN_MS) {
            j.status = 'done';
            j.elapsedMs = 0;
            j.lampLit = 1;
            this.phase = 'idle';
            this.log.push({ t: this.timeMs, kind: 'job', msg: 'done', data: { job: j.id } });
          }
          break;
        }
        case 'done': {
          if (j.elapsedMs >= DONE_HOLD_MS) {
            j.status = 'cooldown';
            j.elapsedMs = 0;
            j.nextTroubleAt =
              this.timeMs + this.rng.range(TROUBLE_DELAY_MIN_MS, TROUBLE_DELAY_MAX_MS);
          }
          break;
        }
        case 'cooldown': {
          if (j.nextTroubleAt !== null && this.timeMs >= j.nextTroubleAt) {
            this.raiseTrouble(j.id);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  get waitingFor(): string | null {
    const j = this.jobs.find((x) => x.status === 'job_running');
    if (j) return 'job_animation';
    if (this.jobs.some((x) => x.status === 'cooldown' || x.status === 'done')) {
      return 'next_trouble_timer';
    }
    return null;
  }

  /** 副作用の無い小さな観測結果。 */
  stateView(): WorldStateView {
    const held = this.held;
    return {
      phase: this.phase,
      held: held
        ? { id: held.id, element: held.element, inFlame: held.inFlame, afterglowMs: Math.round(held.afterglowMs) }
        : null,
      flame: { element: this.flameElement, intensityPct: Math.round(this.flameIntensityPct) },
      jobs: this.jobs.map((j) => ({ id: j.id, element: j.element, status: j.status, calledAt: j.calledAt })),
      materials: this.materials.map((m) => ({ id: m.id, element: m.element, at: m.at })),
      prism: { at: this.prismAt, projecting: null },
      input: this.acceptingInput
        ? { accepting: true }
        : { accepting: false, rejectReason: this.rejectReason ?? 'job_animation' },
      waitingFor: this.waitingFor,
    };
  }
}
