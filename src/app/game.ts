/**
 * ゲーム本体(3D)。
 * 状態機械: waiting → level → leaving → pan → (entering|level|arriving) … → finale → depart → pan → level
 * 文字は一切描かない。すべての案内は形・動き・音で行う。
 */
import { Group, Vector3, Color, Object3D } from 'three';
import {
  type InstrumentId, type Placement, type Song, type Layer, PITCHES, INSTRUMENT_KIND, TEMPOS_BPM, MAX_LEVELS,
  currentLayer, wagonLayers, placementAt, placementsAt, setPlacement, removePlacement, pitchToMidi, midiToFreq,
} from './state';
import { createSong } from './levels';
import { loadSong, saveSong } from './storage';
import { unlockAudio, getEngine, type AudioEngine } from '../audio/context';
import { Clock } from '../audio/clock';
import { Scheduler } from '../audio/scheduler';
import { INSTRUMENTS, whistle, pop } from '../audio/instruments';
import { View, CAM_FOV } from '../three/renderer';
import { Picker } from '../three/picker';
import { Tray } from '../three/builders/tray';
import { Effects } from '../three/effects';
import { TrainRig, SPACING } from '../three/builders/train';
import { buildInstrument } from '../three/builders/instruments';
import { INSTRUMENT_COLOR } from '../three/materials';
import { THEMES } from '../three/themes';
import { LevelView, type DropTarget } from '../three/levels/LevelView';
import { TrainLevel } from '../three/levels/TrainLevel';
import { GridLevel } from '../three/levels/GridLevel';
import { MusicBoxLevel } from '../three/levels/MusicBoxLevel';
import { StationLevel } from '../three/levels/StationLevel';

type Mode = 'waiting' | 'level' | 'leaving' | 'pan' | 'entering' | 'arriving' | 'finale' | 'depart';

interface Drag {
  inst: InstrumentId;
  pitch: number;
  from: Placement | null;      // null = トレイから
  mode: 'undecided' | 'carry' | 'pitch';
  startX: number; startY: number; x: number; y: number;
  pitch0: number;
  obj: Group;
  target: DropTarget | null;
}
interface Hop { obj: Group; from: Vector3; wagon: number; item: number; t0: number; dur: number }
interface FlyBack { obj: Group; from: Vector3; toId: InstrumentId; t0: number }
interface Hit { layer: number; slot: number; pitch: number; time: number; spawned: boolean }
interface Anim { t0: number; dur: number; from: number; to: number }

const WAIT_T = 0.06;
const PAN_DIST = 18;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Game {
  readonly view: View;
  private picker: Picker;
  private tray = new Tray();
  private effects = new Effects();
  private rig = new TrainRig();
  private song: Song;
  private mode: Mode = 'waiting';
  private engine: AudioEngine | null = null;
  private clock = new Clock();
  private scheduler: Scheduler | null = null;
  private level!: LevelView;
  private oldLevel: LevelView | null = null;
  private drag: Drag | null = null;
  private hops: Hop[] = [];
  private flybacks: FlyBack[] = [];
  private hits: Hit[] = [];
  private landings = new Map<string, number>();
  private doorOpened = false;
  private doorOpen = 0;
  private lids: number[] = [0, 0, 0, 0];
  private prevPhase = 0;
  private drive: Anim | null = null;
  private pan: { t0: number; dur: number; fromBg: Color; toBg: Color } | null = null;
  private leaveT0 = 0;
  private lastPuff = 0;
  private lastFrame = 0;
  private bg = new Color('#f6b7c9');

  constructor(canvas: HTMLCanvasElement) {
    this.view = new View(canvas);
    this.picker = new Picker(this.view.camera, () => this.view.width, () => this.view.height);
    this.song = loadSong() ?? createSong();
    this.lids = this.song.layers.map((l) => (l.muted ? 1 : 0));
    this.view.scene.add(this.effects.group, this.rig.group);
    this.view.attachToCamera(this.tray.group, 9, 0.2);
    this.level = this.makeLevel();
    this.view.scene.add(this.level.root);
    this.afterLevelBuilt(true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 60));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.engine) {
        void this.engine.resume().then(() => this.scheduler?.resync());
      }
    });
    if (location.search.includes('test')) this.installTestHooks();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- レベル ----------

  private makeLevel(): LevelView {
    const layer = currentLayer(this.song);
    const theme = THEMES[layer.theme];
    let v: LevelView;
    if (this.song.phase === 'finale') v = new StationLevel(theme);
    else if (layer.kind === 'grid') v = new GridLevel(theme);
    else if (layer.kind === 'musicbox') v = new MusicBoxLevel(theme);
    else v = new TrainLevel(theme);
    v.build(layer);
    return v;
  }

  /** レベルを表示した後の共通処理(トレイ・貨車・カメラ・背景) */
  private afterLevelBuilt(initial: boolean): void {
    const layer = currentLayer(this.song);
    this.tray.setItems(layer.instruments);
    this.tray.setVisible(this.song.phase !== 'finale');
    this.rig.setWagons(wagonLayers(this.song));
    this.rig.path = this.level.path;
    this.rig.group.visible = true;
    this.doorOpened = false;
    this.doorOpen = 0;
    this.level.tunnel.setOpen(0);
    if (initial) {
      this.bg.set(THEMES[layer.theme].bg);
      this.view.setBackground(THEMES[layer.theme].bg);
    }
    this.view.frame(this.level.bounds());
  }

  private isTrainLevel(): boolean { return this.level instanceof TrainLevel; }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.view.resize(w, h);
    const hfov = 2 * Math.atan(Math.tan((CAM_FOV * Math.PI / 180) / 2) * (w / h));
    this.tray.setWidth(2 * Math.tan(hfov / 2) * 9 * 0.9);
  }

  // ---------- 音 ----------

  private now(): number { return this.engine ? this.engine.now() : 0; }

  private playInst(inst: InstrumentId, pitch: number, layerIdx: number, time?: number): void {
    const e = this.engine ?? getEngine();
    if (!e) return;
    const layer = this.song.layers[layerIdx];
    INSTRUMENTS[inst](e.ctx, e.master, time ?? e.now(), midiToFreq(pitchToMidi(layer, pitch)));
  }

  private pop(freq = 500): void {
    const e = this.engine; if (!e) return;
    pop(e.ctx, e.master, e.now(), freq);
  }

  private whistle(): void {
    const e = this.engine; if (!e) return;
    whistle(e.ctx, e.master, e.now());
  }

  private onStep(step: number, time: number): void {
    const playing = this.song.phase === 'finale' ? this.song.layers : this.song.layers.slice(0, this.song.currentLevel + 1);
    playing.forEach((layer, li) => {
      if (layer.muted) return;
      for (const p of placementsAt(layer, step)) {
        this.playInst(p.inst, p.pitch, li, time);
        this.hits.push({ layer: li, slot: step, pitch: p.pitch, time, spawned: false });
      }
    });
    if (this.hits.length > 160) this.hits.splice(0, this.hits.length - 160);
  }

  private hitAmount(layerIdx: number, slot: number, pitch: number): number {
    const now = this.now();
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.layer === layerIdx && h.slot === slot && h.pitch === pitch && h.time <= now) {
        return clamp((now - h.time) / 0.35, 0, 1);
      }
    }
    return 1;
  }

  private async start(): Promise<void> {
    this.engine = await unlockAudio();
    const now = this.engine.now();
    this.clock = new Clock(this.song.tempoIdx, 0);
    this.clock.setPhase(WAIT_T, now);
    this.scheduler = new Scheduler(this.clock, () => this.now(), (s, t) => this.onStep(s, t));
    this.scheduler.start();
    this.prevPhase = this.clock.phase(now);
    this.mode = this.song.phase === 'finale' ? 'finale' : 'level';
    this.whistle();
  }

  private save(): void { saveSong(this.song); }

  // ---------- 入力 ----------

  down(x: number, y: number): void {
    if (this.mode === 'waiting') { void this.start(); return; }
    if (this.engine) void this.engine.resume();
    if (this.mode !== 'level' && this.mode !== 'finale') return;
    const roots: Object3D[] = [this.tray.group, ...this.level.hitRoots(), this.rig.group];
    const hit = this.picker.pick(x, y, roots);
    if (!hit) return;
    const layer = currentLayer(this.song);
    switch (hit.kind) {
      case 'tray': {
        if (this.mode !== 'level') return;
        const inst = hit.inst as InstrumentId;
        this.playInst(inst, 2, this.song.currentLevel);
        this.beginDrag(inst, 2, null, 'carry', x, y);
        return;
      }
      case 'placement': {
        if (this.mode !== 'level') return;
        const p = placementAt(layer, hit.slot as number, hit.pitch as number);
        if (!p || !this.level.targetVisible(p.slot, p.pitch)) return;
        this.playInst(p.inst, p.pitch, this.song.currentLevel);
        this.beginDrag(p.inst, p.pitch, p, 'undecided', x, y);
        return;
      }
      case 'door': {
        if (this.mode === 'level' && layer.placements.length > 0 && !this.doorOpened) {
          this.doorOpened = true;
          this.pop(700);
        }
        return;
      }
      case 'loco': {
        if (this.mode === 'level') {
          this.song.tempoIdx = (this.song.tempoIdx + 1) % TEMPOS_BPM.length;
          this.clock.setTempo(this.song.tempoIdx, this.now());
          this.scheduler?.resync();
          this.save();
        }
        this.whistle();
        return;
      }
      case 'wagon': {
        if (this.mode !== 'finale') return;
        const l = this.song.layers[hit.index as number];
        l.muted = !l.muted;
        this.pop(l.muted ? 300 : 600);
        this.save();
        return;
      }
      case 'newTrain': {
        if (this.mode === 'finale') this.depart();
        return;
      }
    }
  }

  private beginDrag(inst: InstrumentId, pitch: number, from: Placement | null, mode: Drag['mode'], x: number, y: number): void {
    const obj = buildInstrument(inst);
    obj.scale.setScalar(1.1);
    obj.visible = mode === 'carry';
    this.view.scene.add(obj);
    this.drag = { inst, pitch, from, mode, startX: x, startY: y, x, y, pitch0: pitch, obj, target: null };
    if (mode === 'carry') this.updateDragObject();
  }

  /** 台の中心付近で 1 ワールド単位が何 px か */
  private pxPerUnit(): number {
    const c = this.level.bounds().getCenter(new Vector3());
    const a = this.view.project(c), b = this.view.project(c.clone().add(new Vector3(0, 1, 0)));
    return Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
  }

  move(x: number, y: number): void {
    const d = this.drag; if (!d) return;
    d.x = x; d.y = y;
    const unit = this.pxPerUnit();
    if (d.mode === 'undecided') {
      const dx = x - d.startX, dy = y - d.startY;
      if (Math.hypot(dx, dy) > 10) {
        if (this.level.allowsPitchDrag && d.from && INSTRUMENT_KIND[d.inst] === 'melody' && Math.abs(dy) > Math.abs(dx) * 1.2) {
          d.mode = 'pitch';
        } else {
          this.switchToCarry(d);
        }
      }
    }
    if (d.mode === 'pitch' && d.from && Math.abs(x - d.startX) > unit * 0.9) this.switchToCarry(d);
    if (d.mode === 'pitch' && d.from) {
      const np = clamp(d.pitch0 + Math.round(-(y - d.startY) / (unit * 0.32)), 0, PITCHES - 1);
      if (np !== d.pitch) {
        const layer = currentLayer(this.song);
        removePlacement(layer, d.from.slot, d.from.pitch);
        d.from = { slot: d.from.slot, inst: d.inst, pitch: np };
        setPlacement(layer, d.from);
        d.pitch = np;
        this.level.syncPlacements(layer);
        this.playInst(d.inst, np, this.song.currentLevel);
        this.save();
      }
    }
    if (d.mode === 'carry') this.updateDragObject();
  }

  private switchToCarry(d: Drag): void {
    d.mode = 'carry';
    d.obj.visible = true;
    if (d.from) {
      const layer = currentLayer(this.song);
      removePlacement(layer, d.from.slot, d.from.pitch);
      this.level.syncPlacements(layer);
      this.save();
    }
    this.updateDragObject();
  }

  /** 指の位置から持ち運び中の楽器の位置と最寄りの置き先を決める */
  private updateDragObject(): void {
    const d = this.drag; if (!d) return;
    const p = this.picker.onPlane(d.x, d.y, this.level.dragY);
    if (p) d.obj.position.copy(p).add(new Vector3(0, 0.25, -0.6));
    // 置き先は画面上の距離で選ぶ(回転する円筒などでも安定)
    let best: DropTarget | null = null, bd = Math.max(70, this.pxPerUnit() * 0.9);
    const finger = { x: d.x, y: d.y - this.pxPerUnit() * 0.5 };
    for (const t of this.level.dropTargets()) {
      const s = this.view.project(t.pos);
      const dist = Math.hypot(s.x - finger.x, s.y - finger.y);
      if (dist < bd) { bd = dist; best = t; }
    }
    d.target = best;
  }

  up(x: number, y: number): void {
    const d = this.drag; if (!d) return;
    this.drag = null;
    this.view.scene.remove(d.obj);
    if (d.mode !== 'carry') return;
    d.x = x; d.y = y;
    this.updateDragObject();
    const layer = currentLayer(this.song);
    if (d.target) {
      const pitch = this.level.allowsPitchDrag ? d.pitch : d.target.pitch;
      const pl: Placement = { slot: d.target.slot, inst: d.inst, pitch };
      setPlacement(layer, pl);
      this.level.syncPlacements(layer);
      this.landings.set(`${pl.slot}:${pl.pitch}`, performance.now() / 1000);
      this.playInst(d.inst, pitch, this.song.currentLevel);
      this.effects.spawnConfetti(this.level.placementWorldPos(pl), INSTRUMENT_COLOR[d.inst], 8, performance.now() / 1000);
      this.save();
    } else {
      this.flyBack(d);
    }
  }

  cancel(): void {
    const d = this.drag; if (!d) return;
    this.drag = null;
    this.view.scene.remove(d.obj);
    if (d.mode === 'carry') this.flyBack(d);
  }

  private flyBack(d: Drag): void {
    const obj = buildInstrument(d.inst);
    this.view.scene.add(obj);
    this.flybacks.push({ obj, from: d.obj.position.clone(), toId: d.inst, t0: performance.now() / 1000 });
  }

  // ---------- 遷移 ----------

  /** 扉が開き、汽車がトンネルへ向かう。楽器は貨車に飛び乗る */
  private startLeaving(rt: number): void {
    const c = this.song.currentLevel;
    const layer = this.song.layers[c];
    // 新しい貨車を今のうちに作る(飛び乗り先)
    if (c >= MAX_LEVELS - 1) this.song.phase = 'finale';
    else this.song.currentLevel = c + 1;
    this.rig.setWagons(this.song.layers.slice(0, c + 1));
    this.rig.place(this.rig.s);
    const wagon = this.rig.wagons[c];
    layer.placements.forEach((p, i) => {
      const obj = buildInstrument(p.inst);
      obj.scale.setScalar(0.8);
      this.view.scene.add(obj);
      if (wagon.items[i]) wagon.items[i].group.visible = false;
      this.hops.push({ obj, from: this.level.placementWorldPos(p), wagon: c, item: i, t0: rt + i * 0.06, dur: 0.75 });
    });
    this.level.syncPlacements({ ...layer, placements: [] });
    this.mode = 'leaving';
    this.leaveT0 = rt;
    if (!this.isTrainLevel()) {
      this.drive = { t0: rt, dur: 1.3, from: this.level.parkS, to: this.level.tunnelS + 1.4 };
    }
    this.view.zoom = 1;
    this.whistle();
    this.save();
  }

  private startPan(rt: number): void {
    this.oldLevel = this.level;
    this.level = this.makeLevel();
    this.level.root.position.x = PAN_DIST;
    this.view.scene.add(this.level.root);
    this.rig.group.visible = false;
    const fromBg = this.bg.clone();
    this.afterLevelBuilt(false);
    this.pan = { t0: rt, dur: 0.9, fromBg, toBg: new Color(THEMES[currentLayer(this.song).theme].bg) };
    this.mode = 'pan';
    this.hops = [];
  }

  private endPan(rt: number): void {
    if (this.oldLevel) { this.view.scene.remove(this.oldLevel.root); this.oldLevel = null; }
    this.level.root.position.x = 0;
    this.pan = null;
    this.view.zoom = 0;
    this.rig.group.visible = true;
    if (this.song.phase === 'finale') {
      this.mode = 'arriving';
      this.drive = { t0: rt, dur: 1.8, from: -3, to: this.level.parkS };
    } else if (this.isTrainLevel()) {
      this.mode = 'level';
      this.prevPhase = this.clock.phase(this.now());
    } else {
      this.mode = 'entering';
      this.drive = { t0: rt, dur: 0.9, from: -3, to: this.level.parkS };
    }
  }

  private depart(): void {
    if (this.mode !== 'finale' || !this.engine) return;
    const rt = performance.now() / 1000;
    this.mode = 'depart';
    this.drive = { t0: rt, dur: 1.9, from: this.level.parkS, to: this.level.path.length + 4 };
    const e = this.engine;
    e.master.gain.setValueAtTime(e.master.gain.value, e.now());
    e.master.gain.linearRampToValueAtTime(0.0001, e.now() + 1.6);
    this.view.zoom = 1;
    this.whistle();
  }

  private finishDepart(rt: number): void {
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
    this.startPan(rt);
  }

  // ---------- 毎フレーム ----------

  private frame(tMs: number): void {
    const rt = tMs / 1000;
    const dt = Math.min(0.05, this.lastFrame ? rt - this.lastFrame : 0.016);
    this.lastFrame = rt;
    this.update(rt, dt);
    this.view.updateCamera(rt);
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private trainS(rt: number): number {
    const len = this.level.path.length;
    if (this.drive) {
      const t = clamp((rt - this.drive.t0) / this.drive.dur, 0, 1);
      return this.drive.from + (this.drive.to - this.drive.from) * easeInOut(t);
    }
    if (this.mode === 'waiting') return this.isTrainLevel() ? WAIT_T * len : this.level.parkS;
    if (this.isTrainLevel() && this.song.phase !== 'finale') return this.clock.phase(this.now()) * len;
    return this.level.parkS;
  }

  private update(rt: number, dt: number): void {
    const now = this.now();
    const layer = currentLayer(this.song);
    const phase = this.engine ? this.clock.phase(now) : WAIT_T;

    // 汽車ループ: 扉が開いていて汽車がトンネルに達したら出発
    if (this.mode === 'level' && this.isTrainLevel() && this.doorOpened && this.doorOpen > 0.9 && this.prevPhase > 0.8 && phase < 0.2) {
      this.startLeaving(rt);
    }
    // 側線のレベル: 扉が開いたら出発
    if (this.mode === 'level' && !this.isTrainLevel() && this.doorOpened && this.doorOpen > 0.9) {
      this.startLeaving(rt);
    }
    this.prevPhase = phase;

    // 汽車の位置
    const s = this.trainS(rt);
    this.rig.place(s);
    if (this.mode === 'leaving') {
      const inTunnel = this.isTrainLevel() ? rt - this.leaveT0 > 0.35 : this.drive && rt - this.drive.t0 >= this.drive.dur;
      if (inTunnel) this.rig.group.visible = false;
      if (rt - this.leaveT0 > (this.isTrainLevel() ? 0.85 : 1.35)) { this.drive = null; this.startPan(rt); }
    } else if (this.mode === 'pan' && this.pan) {
      const t = clamp((rt - this.pan.t0) / this.pan.dur, 0, 1);
      const e = easeInOut(t);
      if (this.oldLevel) this.oldLevel.root.position.x = -PAN_DIST * e;
      this.level.root.position.x = PAN_DIST * (1 - e);
      this.bg.copy(this.pan.fromBg).lerp(this.pan.toBg, e);
      this.view.setBackground(`#${this.bg.getHexString()}`);
      if (t >= 1) this.endPan(rt);
    } else if ((this.mode === 'entering' || this.mode === 'arriving') && this.drive && rt - this.drive.t0 >= this.drive.dur) {
      this.drive = null;
      this.mode = this.mode === 'arriving' ? 'finale' : 'level';
      if (this.mode === 'finale') this.pop(800);
    } else if (this.mode === 'depart' && this.drive && rt - this.drive.t0 >= this.drive.dur) {
      this.drive = null;
      this.finishDepart(rt);
    }

    // 扉
    if (this.mode === 'level' || this.mode === 'leaving') {
      const target = this.doorOpened ? 1 : layer.placements.length > 0 ? 0.22 : 0;
      this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 6);
      this.level.tunnel.setOpen(this.doorOpen);
      this.level.tunnel.setGlow(this.doorOpen > 0.05 ? 0.25 + clamp(this.doorOpen, 0, 1) * (0.35 + 0.25 * Math.sin(rt * 4)) : 0);
    }

    // ふた
    this.song.layers.forEach((l, i) => {
      const target = l.muted ? 1 : 0;
      this.lids[i] += (target - this.lids[i]) * Math.min(1, dt * 8);
    });
    this.rig.animate((k, slot, pitch) => this.hitAmount(k, slot, pitch), this.lids);
    this.rig.setFire(this.song.tempoIdx, rt);

    // 飛び乗り
    this.hops = this.hops.filter((h) => {
      const t = clamp((rt - h.t0) / h.dur, 0, 1);
      const w = this.rig.wagons[h.wagon];
      const item = w?.items[h.item];
      const to = item ? item.group.getWorldPosition(new Vector3()) : w?.group.getWorldPosition(new Vector3()) ?? h.from;
      const e = easeInOut(t);
      h.obj.position.copy(h.from).lerp(to, e);
      h.obj.position.y += Math.sin(t * Math.PI) * 1.8;
      h.obj.scale.setScalar(0.8 - t * 0.3);
      if (t >= 1) { this.view.scene.remove(h.obj); if (item) item.group.visible = true; return false; }
      return true;
    });
    // トレイへ戻る
    this.flybacks = this.flybacks.filter((f) => {
      const t = clamp((rt - f.t0) / 0.45, 0, 1);
      const to = this.tray.itemWorldPos(f.toId) ?? f.from;
      f.obj.position.copy(f.from).lerp(to, easeInOut(t));
      f.obj.position.y += Math.sin(t * Math.PI) * 1.2;
      f.obj.scale.setScalar(1 - t * 0.4);
      if (t >= 1) { this.view.scene.remove(f.obj); return false; }
      return true;
    });

    // レベルの見える化
    const hitFn = (slot: number, pitch: number) => this.hitAmount(this.song.currentLevel, slot, pitch);
    const landing = (slot: number, pitch: number) => {
      const l = this.landings.get(`${slot}:${pitch}`);
      return l !== undefined && rt - l < 0.4 ? (rt - l) / 0.4 : 1;
    };
    this.level.update(phase, rt, hitFn, !!(this.drag && this.drag.mode === 'carry'), this.drag?.target ?? null, landing);
    if (this.oldLevel) this.oldLevel.update(phase, rt, () => 1, false, null, () => 1);
    this.tray.update(rt);

    // 蒸気
    const puffEvery = this.mode === 'waiting' ? 0.55 : 0.22;
    if (rt - this.lastPuff > puffEvery) {
      this.lastPuff = rt;
      if (this.rig.group.visible) this.effects.spawnPuff(this.rig.chimneyWorld(), rt, 0.3);
      if (this.mode === 'finale' && this.level instanceof StationLevel) this.effects.spawnPuff(this.level.newTrainChimney(), rt, 0.25);
    }

    // 鳴った瞬間の紙吹雪
    if (this.engine) {
      for (const h of this.hits) {
        if (h.spawned || h.time > now) continue;
        h.spawned = true;
        const isCurrent = this.song.phase !== 'finale' && h.layer === this.song.currentLevel;
        const l = this.song.layers[h.layer];
        const p = l.placements.find((x) => x.slot === h.slot && x.pitch === h.pitch);
        if (!p) continue;
        if (isCurrent && this.mode === 'level') {
          this.effects.spawnConfetti(this.level.placementWorldPos(p).add(new Vector3(0, 0.6, 0)), INSTRUMENT_COLOR[p.inst], 2, rt);
        } else if (this.rig.group.visible) {
          const w = this.rig.wagons[h.layer];
          const it = w?.items.find((i) => i.slot === h.slot && i.pitch === h.pitch);
          if (it) this.effects.spawnConfetti(it.group.getWorldPosition(new Vector3()).add(new Vector3(0, 0.4, 0)), INSTRUMENT_COLOR[p.inst], 1, rt);
        }
      }
    }
    this.effects.update(dt, rt);
  }

  // ---------- テスト用フック(?test のときだけ) ----------

  private installTestHooks(): void {
    const proj = (v: Vector3 | null) => (v ? this.view.project(v) : null);
    const w = window as unknown as { __tt: unknown };
    w.__tt = {
      song: () => JSON.parse(JSON.stringify(this.song)) as Song,
      mode: () => this.mode,
      kind: () => this.level.kind,
      tray: (i: number) => { const it = this.tray.itemAt(i); return it ? proj(it.hit.getWorldPosition(new Vector3())) : null; },
      target: (slot: number, pitch: number) => proj(this.level.targetPos(slot, pitch)),
      targetVisible: (slot: number, pitch: number) => this.level.targetVisible(slot, pitch),
      placement: (slot: number, pitch: number) => proj(this.level.placementWorldPos({ slot, pitch, inst: 'drum' })),
      door: () => proj(this.level.tunnel.group.localToWorld(new Vector3(0, 0.6, 0))),
      loco: () => proj(this.rig.loco.localToWorld(new Vector3(0, 0.7, 0))),
      wagon: (k: number) => { const wg = this.rig.wagons[k]; return wg ? proj(wg.group.localToWorld(new Vector3(0, 0.6, 0))) : null; },
      newTrain: () => (this.level instanceof StationLevel ? proj(this.level.newTrain.localToWorld(new Vector3(0, 0.6, 0))) : null),
      spacing: SPACING,
      unitPx: () => this.pxPerUnit(),
      doorState: () => ({ opened: this.doorOpened, open: this.doorOpen, mode: this.mode, drag: !!this.drag }),
      pickAt: (x: number, y: number) => this.picker.pick(x, y, [this.tray.group, ...this.level.hitRoots(), this.rig.group]),
      debug: () => ({ bounds: this.level.bounds(), dist: (this.view as unknown as { dist: number }).dist, cam: this.view.camera.position.toArray() }),
      layer: (): Layer => JSON.parse(JSON.stringify(currentLayer(this.song))),
    };
  }
}
