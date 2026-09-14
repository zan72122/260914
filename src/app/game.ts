/**
 * ゲーム本体。状態機械: waiting → level ⇄ transition → arriving → finale → depart → transition → level
 * 文字は一切描かない。すべての案内は形・動き・音で行う。
 */
import {
  type InstrumentId, type Placement, type Song, STEPS, PITCHES, INSTRUMENT_KIND, TEMPOS_BPM,
  currentLayer, wagonLayers, placementAt, setPlacement, removePlacement, pitchToMidi, midiToFreq,
  MAX_LEVELS,
} from './state';
import { createSong } from './levels';
import { loadSong, saveSong } from './storage';
import { unlockAudio, getEngine, type AudioEngine } from '../audio/context';
import { Clock } from '../audio/clock';
import { Scheduler } from '../audio/scheduler';
import { INSTRUMENTS, whistle, pop } from '../audio/instruments';
import { computeLayout, slotPos, boxItemPos, type Layout } from '../render/layout';
import { THEMES, type Theme } from '../render/themes';
import {
  drawGround, drawTrack, drawSlots, drawTunnel, drawToyBox, drawStation, placedInstrumentPos, tunnelHit, drawPole,
} from '../render/scene';
import { drawLoco, drawWagon, wagonPhase, chimneyPos, trainHit } from '../render/train';
import { drawInstrument, INSTRUMENT_COLOR } from '../render/instruments';
import { Effects } from '../render/effects';
import { type Ctx, clamp, easeInOut, easeOutBack, paperFill, roundRect, circle } from '../render/paper';

type Mode = 'waiting' | 'level' | 'transition' | 'arriving' | 'finale' | 'depart';

interface Drag {
  inst: InstrumentId;
  pitch: number;
  fromSlot: number;           // -1 = おもちゃ箱から
  mode: 'undecided' | 'carry' | 'pitch';
  startX: number; startY: number;
  x: number; y: number;
  pitch0: number;
}

interface Hop { inst: InstrumentId; fromX: number; fromY: number; wagon: number; t0: number; dur: number; index: number; count: number }
interface FlyBack { inst: InstrumentId; fromX: number; fromY: number; toX: number; toY: number; t0: number }
interface Hit { layer: number; slot: number; time: number; spawned: boolean }
interface Transition { t0: number; slideStart: number; slideDur: number; oldKind: 'level' | 'station'; oldLayer: number; oldTheme: Theme }

const WAIT_PHASE = 0.06;
const PARK_PHASE = 0.5;
const WAGON_COLORS = ['#4f8fd9', '#5cb85c', '#f2c744', '#c98a4b'];

export class Game {
  private ctx: Ctx;
  private layout: Layout;
  private song: Song;
  private mode: Mode = 'waiting';
  private engine: AudioEngine | null = null;
  private clock = new Clock();
  private scheduler: Scheduler | null = null;
  private effects = new Effects();
  private drag: Drag | null = null;
  private hops: Hop[] = [];
  private flybacks: FlyBack[] = [];
  private hits: Hit[] = [];
  private landings = new Map<number, number>();
  private doorOpened = false;
  private doorOpen = 0;
  private lids: number[] = [0, 0, 0, 0];
  private transition: Transition | null = null;
  private prevPhase = 0;
  private drawnPhase = WAIT_PHASE;
  private lastPuff = 0;
  private lastFrame = 0;
  private departT0 = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('no 2d context');
    this.ctx = c;
    this.song = loadSong() ?? createSong();
    this.lids = this.song.layers.map((l) => (l.muted ? 1 : 0));
    this.layout = computeLayout(1, 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 50));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.engine) {
        void this.engine.resume().then(() => this.scheduler?.resync());
      }
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- レイアウト ----------

  private safeInsets(): { top: number; bottom: number } {
    const cs = getComputedStyle(document.body);
    const top = parseFloat(cs.getPropertyValue('--sat')) || 0;
    const bottom = parseFloat(cs.getPropertyValue('--sab')) || 0;
    return { top, bottom };
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const s = this.safeInsets();
    this.layout = computeLayout(w, h, s.top, s.bottom);
  }

  // ---------- 音 ----------

  private now(): number { return this.engine ? this.engine.now() : 0; }

  private playInst(inst: InstrumentId, pitch: number, layerIdx: number, time?: number): void {
    const e = this.engine ?? getEngine();
    if (!e) return;
    const layer = this.song.layers[layerIdx];
    const freq = midiToFreq(pitchToMidi(layer, pitch));
    INSTRUMENTS[inst](e.ctx, e.master, time ?? e.now(), freq);
  }

  private pop(freq = 500): void {
    const e = this.engine; if (!e) return;
    pop(e.ctx, e.master, e.now(), freq);
  }

  private onStep(step: number, time: number): void {
    const playing = this.song.phase === 'finale' ? this.song.layers : this.song.layers.slice(0, this.song.currentLevel + 1);
    playing.forEach((layer, li) => {
      if (layer.muted) return;
      const p = placementAt(layer, step);
      if (!p) return;
      this.playInst(p.inst, p.pitch, li, time);
      this.hits.push({ layer: li, slot: step, time, spawned: false });
    });
    if (this.hits.length > 128) this.hits.splice(0, this.hits.length - 128);
  }

  private hitAmount(layerIdx: number, slot: number): number {
    const now = this.now();
    let best = 1;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.layer === layerIdx && h.slot === slot && h.time <= now) {
        best = clamp((now - h.time) / 0.35, 0, 1);
        break;
      }
    }
    return best;
  }

  private async start(): Promise<void> {
    this.engine = await unlockAudio();
    const now = this.engine.now();
    this.clock = new Clock(this.song.tempoIdx, 0);
    this.clock.setPhase(this.song.phase === 'finale' ? PARK_PHASE : WAIT_PHASE, now);
    this.scheduler = new Scheduler(this.clock, () => this.now(), (s, t) => this.onStep(s, t));
    this.scheduler.start();
    this.prevPhase = this.clock.phase(now);
    this.mode = this.song.phase === 'finale' ? 'finale' : 'level';
    whistle(this.engine.ctx, this.engine.master, now);
  }

  private save(): void { saveSong(this.song); }

  // ---------- 入力 ----------

  down(x: number, y: number): void {
    if (this.mode === 'waiting') { void this.start(); return; }
    if (this.engine) void this.engine.resume();
    if (this.mode === 'finale') { this.downFinale(x, y); return; }
    if (this.mode !== 'level') return;
    const { unit } = this.layout;
    const layer = currentLayer(this.song);

    // 1. 置いてある楽器
    for (const p of layer.placements) {
      const pos = placedInstrumentPos(this.layout, p.slot, p.inst, p.pitch);
      if (Math.hypot(x - pos.x, y - pos.y) < unit * 0.75) {
        this.playInst(p.inst, p.pitch, this.song.currentLevel);
        this.drag = { inst: p.inst, pitch: p.pitch, fromSlot: p.slot, mode: 'undecided', startX: x, startY: y, x, y, pitch0: p.pitch };
        return;
      }
    }
    // 2. おもちゃ箱
    const items = layer.instruments;
    for (let i = 0; i < items.length; i++) {
      const pos = boxItemPos(this.layout, i, items.length);
      if (Math.hypot(x - pos.x, y - pos.y) < unit * 0.95) {
        const pitch = 2;
        this.playInst(items[i], pitch, this.song.currentLevel);
        this.drag = { inst: items[i], pitch, fromSlot: -1, mode: 'carry', startX: x, startY: y, x, y, pitch0: pitch };
        return;
      }
    }
    // 3. トンネルの扉
    if (tunnelHit(this.layout, x, y) && layer.placements.length > 0 && !this.doorOpened) {
      this.doorOpened = true;
      this.pop(700);
      return;
    }
    // 4. 汽車 → テンポ
    const hit = trainHit(this.layout, this.drawnPhase, wagonLayers(this.song).length, x, y);
    if (hit && hit.part === 'loco') {
      this.song.tempoIdx = (this.song.tempoIdx + 1) % TEMPOS_BPM.length;
      this.clock.setTempo(this.song.tempoIdx, this.now());
      this.scheduler?.resync();
      if (this.engine) whistle(this.engine.ctx, this.engine.master, this.now());
      this.save();
    }
  }

  private downFinale(x: number, y: number): void {
    const hit = trainHit(this.layout, PARK_PHASE, MAX_LEVELS, x, y);
    if (hit && hit.part === 'wagon') {
      const layer = this.song.layers[hit.index];
      layer.muted = !layer.muted;
      this.pop(layer.muted ? 300 : 600);
      this.save();
      return;
    }
    if (hit && hit.part === 'loco') {
      if (this.engine) whistle(this.engine.ctx, this.engine.master, this.now());
      return;
    }
    // 新しい汽車(おもちゃ箱の場所)
    const np = this.newTrainPos();
    if (Math.hypot(x - np.x, y - np.y) < this.layout.unit * 1.4) this.depart();
  }

  move(x: number, y: number): void {
    const d = this.drag; if (!d) return;
    d.x = x; d.y = y;
    const { unit } = this.layout;
    if (d.mode === 'undecided') {
      const dx = x - d.startX, dy = y - d.startY;
      if (Math.hypot(dx, dy) > 10) {
        if (INSTRUMENT_KIND[d.inst] === 'melody' && Math.abs(dy) > Math.abs(dx) * 1.2) {
          d.mode = 'pitch';
        } else {
          d.mode = 'carry';
          removePlacement(currentLayer(this.song), d.fromSlot);
          this.save();
        }
      }
    }
    if (d.mode === 'pitch' && Math.abs(x - d.startX) > unit * 0.9) {
      // ポールから横へ大きく外れたら持ち上げに切り替える(取り外し)
      d.mode = 'carry';
      removePlacement(currentLayer(this.song), d.fromSlot);
      this.save();
    }
    if (d.mode === 'pitch') {
      const np = clamp(d.pitch0 + Math.round(-(y - d.startY) / (unit * 0.24)), 0, PITCHES - 1);
      if (np !== d.pitch) {
        d.pitch = np;
        setPlacement(currentLayer(this.song), { slot: d.fromSlot, inst: d.inst, pitch: np });
        this.playInst(d.inst, np, this.song.currentLevel);
        this.save();
      }
    }
  }

  up(x: number, y: number): void {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.mode !== 'carry') return;
    const g = this.ghostPos(x, y);
    const slot = this.nearestEmptySlot(g.x, g.y);
    if (slot >= 0) {
      const pl: Placement = { slot, inst: d.inst, pitch: d.pitch };
      setPlacement(currentLayer(this.song), pl);
      this.landings.set(slot, performance.now() / 1000);
      this.playInst(d.inst, d.pitch, this.song.currentLevel);
      const pos = placedInstrumentPos(this.layout, slot, d.inst, d.pitch);
      this.effects.spawnConfetti(pos.x, pos.y, INSTRUMENT_COLOR[d.inst], 6, performance.now() / 1000, this.layout.unit);
      this.save();
    } else {
      this.flyBack(d, g.x, g.y);
    }
  }

  cancel(): void {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.mode === 'carry') { const g = this.ghostPos(d.x, d.y); this.flyBack(d, g.x, g.y); }
  }

  private flyBack(d: Drag, fromX: number, fromY: number): void {
    const items = currentLayer(this.song).instruments;
    const i = Math.max(0, items.indexOf(d.inst));
    const to = boxItemPos(this.layout, i, items.length);
    this.flybacks.push({ inst: d.inst, fromX, fromY, toX: to.x, toY: to.y, t0: performance.now() / 1000 });
  }

  private ghostPos(x: number, y: number): { x: number; y: number } {
    return { x, y: y - this.layout.unit * 0.8 };
  }

  private nearestEmptySlot(x: number, y: number): number {
    const layer = currentLayer(this.song);
    let best = -1, bd = this.layout.unit * 1.2;
    for (let i = 0; i < STEPS; i++) {
      if (placementAt(layer, i)) continue;
      const p = slotPos(this.layout, i);
      const dd = Math.hypot(x - p.x, y - (p.y - this.layout.unit * 0.3));
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  // ---------- 遷移 ----------

  private startTransition(rt: number): void {
    const c = this.song.currentLevel;
    const layer = this.song.layers[c];
    const oldTheme = THEMES[layer.theme];
    layer.placements.forEach((p, i) => {
      const pos = placedInstrumentPos(this.layout, p.slot, p.inst, p.pitch);
      this.hops.push({ inst: p.inst, fromX: pos.x, fromY: pos.y, wagon: c, t0: rt + i * 0.06, dur: 0.75, index: i, count: layer.placements.length });
    });
    if (c >= MAX_LEVELS - 1) this.song.phase = 'finale';
    else this.song.currentLevel = c + 1;
    this.doorOpened = false;
    this.transition = { t0: rt, slideStart: rt + 0.4, slideDur: 0.9, oldKind: 'level', oldLayer: c, oldTheme };
    this.mode = 'transition';
    if (this.engine) whistle(this.engine.ctx, this.engine.master, this.now());
    this.save();
  }

  private depart(): void {
    if (this.mode !== 'finale' || !this.engine) return;
    this.mode = 'depart';
    this.departT0 = performance.now() / 1000;
    const e = this.engine;
    e.master.gain.setValueAtTime(e.master.gain.value, e.now());
    e.master.gain.linearRampToValueAtTime(0.0001, e.now() + 1.6);
    whistle(e.ctx, e.master, e.now());
  }

  private finishDepart(rt: number): void {
    const oldTheme = THEMES[this.song.layers[MAX_LEVELS - 1].theme];
    this.song = createSong();
    this.lids = [0, 0, 0, 0];
    this.hits = [];
    this.save();
    const e = this.engine!;
    e.master.gain.cancelScheduledValues(e.now());
    e.master.gain.setValueAtTime(0.7, e.now());
    this.clock.setTempo(this.song.tempoIdx, e.now());
    this.clock.setPhase(0.02, e.now());
    this.scheduler?.resync();
    this.doorOpened = false;
    this.doorOpen = 0;
    this.transition = { t0: rt, slideStart: rt, slideDur: 0.9, oldKind: 'station', oldLayer: MAX_LEVELS - 1, oldTheme };
    this.mode = 'transition';
  }

  private newTrainPos(): { x: number; y: number } {
    const { box, unit, portrait } = this.layout;
    return portrait
      ? { x: box.x + box.w * 0.5, y: box.y + (box.h - this.layout.safeBottom) * 0.5 + unit * 0.1 }
      : { x: box.x + box.w * 0.5, y: box.y + box.h * 0.5 };
  }

  // ---------- 毎フレーム ----------

  private frame(tMs: number): void {
    const rt = tMs / 1000;
    const dt = Math.min(0.05, this.lastFrame ? rt - this.lastFrame : 0.016);
    this.lastFrame = rt;
    this.update(rt, dt);
    this.draw(rt);
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(rt: number, dt: number): void {
    const { unit } = this.layout;
    const now = this.now();
    const layer = currentLayer(this.song);

    // 汽車の位置
    if (this.mode === 'waiting') {
      this.drawnPhase = WAIT_PHASE;
    } else if (this.mode === 'finale') {
      this.drawnPhase = PARK_PHASE;
    } else if (this.mode === 'depart') {
      const t = clamp((rt - this.departT0) / 1.9, 0, 1);
      this.drawnPhase = PARK_PHASE + (1 - PARK_PHASE) * easeInOut(t);
      if (t >= 1) this.finishDepart(rt);
    } else {
      const ph = this.clock.phase(now);
      if (this.mode === 'level' && this.doorOpened && this.doorOpen > 0.9 && this.prevPhase > 0.8 && ph < 0.2) {
        this.startTransition(rt);
      }
      if (this.mode === 'arriving' && this.prevPhase < PARK_PHASE && ph >= PARK_PHASE) {
        this.mode = 'finale';
        this.pop(800);
      }
      this.prevPhase = ph;
      this.drawnPhase = this.mode === 'finale' ? PARK_PHASE : ph;
    }

    // 扉
    if (this.mode === 'level') {
      const target = this.doorOpened ? 1 : layer.placements.length > 0 ? 0.22 : 0;
      this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 6);
    }

    // ふた
    this.song.layers.forEach((l, i) => {
      const target = l.muted ? 1 : 0;
      this.lids[i] += (target - this.lids[i]) * Math.min(1, dt * 8);
    });

    // 遷移の終了
    if (this.mode === 'transition' && this.transition) {
      const tr = this.transition;
      if (rt >= tr.slideStart + tr.slideDur) {
        this.transition = null;
        this.doorOpen = 0;
        this.mode = this.song.phase === 'finale' ? 'arriving' : 'level';
      }
    }
    this.hops = this.hops.filter((h) => rt - h.t0 < h.dur);
    this.flybacks = this.flybacks.filter((f) => rt - f.t0 < 0.45);

    // 蒸気
    const puffEvery = this.mode === 'waiting' ? 0.55 : 0.22;
    if (rt - this.lastPuff > puffEvery) {
      this.lastPuff = rt;
      const c = chimneyPos(this.layout, this.drawnPhase);
      this.effects.spawnPuff(c.x, c.y, rt, unit * 0.18);
      if (this.mode === 'finale') {
        const np = this.newTrainPos();
        this.effects.spawnPuff(np.x + unit * 0.45, np.y - unit * 0.3, rt, unit * 0.14);
      }
    }

    // 鳴った瞬間の紙吹雪
    if (this.engine) {
      for (const h of this.hits) {
        if (h.spawned || h.time > now) continue;
        h.spawned = true;
        const isCurrent = this.song.phase !== 'finale' && h.layer === this.song.currentLevel;
        const p = this.song.layers[h.layer].placements.find((x) => x.slot === h.slot);
        if (!p) continue;
        if (isCurrent && this.mode !== 'transition') {
          const pos = placedInstrumentPos(this.layout, h.slot, p.inst, p.pitch);
          this.effects.spawnConfetti(pos.x, pos.y - unit * 0.3, INSTRUMENT_COLOR[p.inst], 2, rt, unit);
        } else {
          const k = h.layer;
          const wp = this.layout.loop.pointAt(wagonPhase(this.layout, this.drawnPhase, k));
          this.effects.spawnConfetti(wp.x, wp.y - unit * 0.3, INSTRUMENT_COLOR[p.inst], 1, rt, unit);
        }
      }
    }
    this.effects.update(dt, rt, unit * 9);
  }

  // ---------- 描画 ----------

  private draw(rt: number): void {
    const ctx = this.ctx;
    const { w, h, portrait, diorama } = this.layout;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const tr = this.transition;
    if (tr && this.mode === 'transition') {
      const p = clamp((rt - tr.slideStart) / tr.slideDur, 0, 1);
      const e = easeInOut(p);
      const dist = portrait ? diorama.h : diorama.w;
      const off = e * dist;
      ctx.save();
      ctx.beginPath(); ctx.rect(diorama.x, diorama.y, diorama.w, diorama.h); ctx.clip();
      // 古い場面: トンネルの奥(上/右)へ向かうので、古い場面は下/左へ流れる
      ctx.save();
      ctx.translate(portrait ? 0 : -off, portrait ? off : 0);
      this.drawScene(rt, tr.oldTheme, tr.oldKind, tr.oldLayer, true, 1);
      ctx.restore();
      ctx.save();
      ctx.translate(portrait ? 0 : dist - off, portrait ? off - dist : 0);
      this.drawScene(rt, this.currentTheme(), this.song.phase === 'finale' ? 'station' : 'level', this.song.currentLevel, false, 0);
      ctx.restore();
      ctx.restore();
    } else {
      const kind = this.song.phase === 'finale' ? 'station' : 'level';
      this.drawScene(rt, this.currentTheme(), kind, this.song.currentLevel, false, this.doorOpen);
    }

    this.drawTrain(rt);
    this.drawHops(rt);
    this.effects.draw(ctx, rt);

    if (this.song.phase === 'finale' || (tr && tr.oldKind === 'station')) {
      this.drawSiding(rt);
    } else {
      drawToyBox(ctx, this.layout, currentLayer(this.song).instruments, rt);
    }
    for (const f of this.flybacks) {
      const t = easeInOut(clamp((rt - f.t0) / 0.45, 0, 1));
      const x = f.fromX + (f.toX - f.fromX) * t;
      const y = f.fromY + (f.toY - f.fromY) * t - Math.sin(t * Math.PI) * this.layout.unit * 1.2;
      drawInstrument(ctx, f.inst, x, y, this.layout.unit, 0, 1 - t * 0.15);
    }
    this.drawDrag(rt);
  }

  private currentTheme(): Theme {
    return THEMES[currentLayer(this.song).theme];
  }

  private drawScene(rt: number, theme: Theme, kind: 'level' | 'station', layerIdx: number, emptied: boolean, door: number): void {
    const ctx = this.ctx;
    drawGround(ctx, this.layout, theme, rt);
    drawTrack(ctx, this.layout, theme);
    if (kind === 'station') {
      drawStation(ctx, this.layout, theme, PARK_PHASE, rt);
    } else {
      const layer = this.song.layers[layerIdx];
      const shown = emptied ? { ...layer, placements: [] } : layer;
      const d = this.drag;
      const highlight = d && d.mode === 'carry' ? this.nearestEmptySlot(this.ghostPos(d.x, d.y).x, this.ghostPos(d.x, d.y).y) : -1;
      drawSlots(ctx, this.layout, shown, theme, rt, !!(d && d.mode === 'carry'), highlight, (s) => {
        const land = this.landings.get(s);
        if (land !== undefined && rt - land < 0.4) return 1 - (rt - land) / 0.4 * 0.999; // 着地の弾み
        return this.hitAmount(layerIdx, s);
      });
    }
    drawTunnel(ctx, this.layout, theme, door, rt);
  }

  private drawTrain(rt: number): void {
    const ctx = this.ctx;
    const wagons = wagonLayers(this.song);
    const count = this.mode === 'transition' && this.transition?.oldKind === 'station' ? 0 : wagons.length;
    for (let k = count - 1; k >= 0; k--) {
      const layer = this.song.layers[k];
      drawWagon(ctx, this.layout, wagonPhase(this.layout, this.drawnPhase, k), layer, WAGON_COLORS[k % WAGON_COLORS.length],
        (s) => this.hitAmount(k, s), this.lids[k]);
    }
    const fire = this.song.tempoIdx / (TEMPOS_BPM.length - 1);
    drawLoco(ctx, this.layout, this.drawnPhase, fire, rt);
  }

  private drawHops(rt: number): void {
    for (const hop of this.hops) {
      const t = clamp((rt - hop.t0) / hop.dur, 0, 1);
      const wp = this.layout.loop.pointAt(wagonPhase(this.layout, this.drawnPhase, hop.wagon));
      const along = hop.count === 1 ? 0 : (hop.index / (hop.count - 1) - 0.5) * this.layout.unit * 0.9;
      const tx = wp.x + wp.tx * along, ty = wp.y + wp.ty * along - this.layout.unit * 0.15;
      const e = easeInOut(t);
      const x = hop.fromX + (tx - hop.fromX) * e;
      const y = hop.fromY + (ty - hop.fromY) * e - Math.sin(t * Math.PI) * this.layout.unit * 1.6;
      drawInstrument(this.ctx, hop.inst, x, y, this.layout.unit * (1 - t * 0.5), 0);
    }
  }

  /** フィナーレ: おもちゃ箱の場所に、次の空の汽車が待つ側線 */
  private drawSiding(rt: number): void {
    const ctx = this.ctx;
    const { box, unit, portrait } = this.layout;
    const theme = this.currentTheme();
    ctx.fillStyle = theme.paper;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const np = this.newTrainPos();
    ctx.save();
    ctx.translate(np.x, np.y);
    if (!portrait) ctx.rotate(-Math.PI / 2);
    const len = portrait ? box.w : box.h;
    ctx.strokeStyle = theme.bed; ctx.lineWidth = unit * 0.7;
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.strokeStyle = theme.tie; ctx.lineWidth = unit * 0.12; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = -len / 2; x < len / 2; x += unit * 0.5) { ctx.moveTo(x, -unit * 0.22); ctx.lineTo(x, unit * 0.22); }
    ctx.stroke();
    ctx.strokeStyle = theme.rail; ctx.lineWidth = unit * 0.06;
    ctx.beginPath(); ctx.moveTo(-len / 2, -unit * 0.13); ctx.lineTo(len / 2, -unit * 0.13); ctx.moveTo(-len / 2, unit * 0.13); ctx.lineTo(len / 2, unit * 0.13); ctx.stroke();
    // 新しい汽車(小さく揺れて誘う)
    const bob = Math.sin(rt * 6) * unit * 0.03;
    ctx.translate(0, bob);
    const L = unit * 1.5, W = unit * 0.72;
    ctx.fillStyle = '#3a2a1a';
    for (const fx of [-0.32, 0, 0.3]) {
      ctx.fillRect(fx * L - unit * 0.1, -W / 2 - unit * 0.06, unit * 0.2, unit * 0.1);
      ctx.fillRect(fx * L - unit * 0.1, W / 2 - unit * 0.04, unit * 0.2, unit * 0.1);
    }
    paperFill(ctx, '#4f8fd9', (c) => roundRect(c, -L / 2, -W / 2, L, W, unit * 0.12));
    paperFill(ctx, '#3a3a3a', (c) => roundRect(c, -L * 0.05, -W * 0.36, L * 0.52, W * 0.72, W * 0.36), 2);
    paperFill(ctx, '#f2c744', (c) => roundRect(c, -L * 0.46, -W * 0.42, L * 0.34, W * 0.84, unit * 0.06), 2);
    paperFill(ctx, '#2b2b2b', (c) => circle(c, L * 0.32, 0, unit * 0.14), 1);
    paperFill(ctx, '#fff3d6', (c) => circle(c, L * 0.44, 0, unit * 0.1), 1, false);
    ctx.restore();
  }

  private drawDrag(rt: number): void {
    const d = this.drag; if (!d) return;
    const { unit } = this.layout;
    if (d.mode === 'pitch') return; // 置いたまま上下しているので通常描画に任せる
    if (d.mode === 'undecided') return;
    const g = this.ghostPos(d.x, d.y);
    const s = 1.15 + Math.sin(rt * 10) * 0.03;
    if (INSTRUMENT_KIND[d.inst] === 'melody') {
      this.ctx.globalAlpha = 0.5;
      drawPole(this.ctx, g.x, g.y + unit * 0.8, g.y + unit * 0.2, unit, d.pitch);
      this.ctx.globalAlpha = 1;
    }
    drawInstrument(this.ctx, d.inst, g.x, g.y, unit, 0, easeOutBack(1) * s);
  }
}
