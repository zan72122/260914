import * as THREE from 'three';
import { Audio } from './audio/audio';
import { Cameras } from './camera/cameras';
import { Particles } from './fx/fx';
import { Controller } from './input/controller';
import type { PropType } from './props/models';
import { Props, type Prop } from './props/props';
import { Hud } from './props/toybox';
import { AutoSave, loadSave, type SaveData } from './save/save';
import { dist, resample, SNAP_RADIUS, strokeToPath, type V2 } from './track/geometry';
import { TrackGraph, type Segment } from './track/graph';
import { buildSegmentMesh, TrackRenderer } from './track/mesh';
import { Train } from './train/train';
import { GROUND_HALF, World } from './world/world';

const SUN_OFFSET = new THREE.Vector3(8, 16, 6);

export class Game {
  renderer: THREE.WebGLRenderer;
  world = new World();
  graph = new TrackGraph();
  tracks: TrackRenderer;
  train: Train;
  props: Props;
  hud = new Hud();
  cameras = new Cameras();
  audio = new Audio();
  fx: Particles;
  controller: Controller;
  save: AutoSave;
  width = 1;
  height = 1;
  dragging: Prop | null = null;
  liftedSeg: { id: string; mesh: THREE.Group; offset: THREE.Vector3 } | null = null;
  private preview: THREE.Group | null = null;
  private clock = new THREE.Clock();
  private bounds = new THREE.Box3();
  private frameDirty = true;
  private idlePuff = 2;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.body.appendChild(this.renderer.domElement);

    this.fx = new Particles(this.world.scene);
    this.tracks = new TrackRenderer(this.world.scene, this.graph);
    this.train = new Train(this.world.scene, this.graph);
    this.props = new Props(this.world.scene, this.graph, this.train, this.audio, this.fx);
    this.controller = new Controller(this, this.renderer.domElement);
    this.save = new AutoSave(() => this.collectSave());

    this.train.onDeadEnd = () => this.audio.brake();

    const saved = loadSave();
    if (saved) this.restore(saved);
    else this.freshStart();

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    window.addEventListener('pagehide', () => this.save.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save.flush();
    });
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** A short starter rail with the train on it, ready to be extended. */
  private freshStart(): void {
    const pts = resample([[-2.4, 0], [2.4, 0]], 0.3);
    const seg = this.graph.addPath(pts, null, null);
    this.tracks.sync();
    this.train.placeOn(seg.id, 1.9);
    this.markDirty();
  }

  private restore(data: SaveData): void {
    this.graph = TrackGraph.deserialize(data.graph);
    this.world.scene.remove(this.tracks.group);
    this.tracks = new TrackRenderer(this.world.scene, this.graph);
    this.world.scene.remove(this.train.group);
    this.train = new Train(this.world.scene, this.graph);
    this.train.onDeadEnd = () => this.audio.brake();
    this.world.scene.remove(this.props.group);
    this.props = new Props(this.world.scene, this.graph, this.train, this.audio, this.fx);
    this.tracks.sync();
    this.props.load(data.props);
    if (data.train && this.graph.segments.has(data.train.seg)) this.train.placeOn(data.train.seg, data.train.s, data.train.sign);
    else this.train.validate();
    if (!this.train.pos) this.freshStart();
    this.markDirty();
  }

  private collectSave(): SaveData {
    return {
      v: 1,
      graph: this.graph.serialize(),
      props: this.props.serialize(),
      train: this.train.pos ? { seg: this.train.pos.seg, s: Math.round(this.train.pos.s * 100) / 100, sign: this.train.pos.sign } : null,
    };
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.cameras.resize(w, h);
    this.hud.resize(w, h);
    this.frameDirty = true;
  }

  /** Recompute what the overhead camera must keep in view. */
  private reframe(): void {
    this.bounds.makeEmpty();
    for (const seg of this.graph.segments.values()) for (const p of seg.pts) this.bounds.expandByPoint(new THREE.Vector3(p[0], 0, p[1]));
    this.props.bounds(this.bounds);
    if (this.train.pos) this.bounds.expandByPoint(this.train.loco.position);
    this.cameras.frame(this.bounds);
  }

  markDirty(): void {
    this.frameDirty = true;
    this.save.dirty();
  }

  // ---------- rail drawing ----------

  private clampFelt(p: V2): V2 {
    const h = GROUND_HALF - 0.5;
    return [Math.max(-h, Math.min(h, p[0])), Math.max(-h, Math.min(h, p[1]))];
  }

  private pathFromStroke(stroke: V2[], startNodeId: string | null): { pts: V2[]; start: string | null; end: string | null } {
    const clamped = stroke.map((p) => this.clampFelt(p));
    const startNode = startNodeId ? this.graph.nodes.get(startNodeId) ?? null : null;
    // Only snap the end if the finger finished near a different open end.
    const endNode = clamped.length ? this.graph.nearestFreeNode(clamped[clamped.length - 1], SNAP_RADIUS, startNode?.id) : null;
    if (startNode) clamped[0] = startNode.pos;
    if (endNode) clamped[clamped.length - 1] = endNode.pos;
    const pts = strokeToPath(clamped);
    if (pts.length < 2) return { pts: [], start: null, end: null };
    // strokeToPath preserves endpoints; make sure they are exact for welding
    if (startNode) pts[0] = startNode.pos;
    if (endNode) pts[pts.length - 1] = endNode.pos;
    return { pts, start: startNode?.id ?? null, end: endNode?.id ?? null };
  }

  previewStroke(stroke: V2[], startNodeId: string | null): void {
    if (this.preview) {
      this.world.scene.remove(this.preview);
      this.preview = null;
    }
    const { pts } = this.pathFromStroke(stroke, startNodeId);
    if (pts.length < 2) return;
    const tmp: Segment = { id: 'preview', pts, cum: [], h: pts.map(() => 0), length: 0, a: '', b: '' };
    let acc = 0;
    tmp.cum = pts.map((p, i) => (i === 0 ? 0 : (acc += dist(pts[i - 1], p))));
    tmp.length = acc;
    this.preview = buildSegmentMesh(tmp, true);
    this.preview.position.y = 0.06;
    this.world.scene.add(this.preview);
  }

  finishStroke(stroke: V2[], startNodeId: string | null): void {
    if (this.preview) {
      this.world.scene.remove(this.preview);
      this.preview = null;
    }
    const { pts, start, end } = this.pathFromStroke(stroke, startNodeId);
    if (pts.length < 2) return;
    const startNode = start ? this.graph.nodes.get(start) ?? null : null;
    const endNode = end ? this.graph.nodes.get(end) ?? null : null;
    const seg = this.graph.addPath(pts, startNode, endNode);
    this.tracks.sync();
    this.audio.thud();
    if (startNode || endNode) {
      this.audio.click();
      const n = endNode ?? startNode;
      if (n) this.fx.sparkle(new THREE.Vector3(n.pos[0], 0.3, n.pos[1]), 8);
    }
    const mid = seg.pts[Math.floor(seg.pts.length / 2)];
    this.fx.dust(new THREE.Vector3(mid[0], 0.1, mid[1]), 8);
    if (this.props.pushOffTrack()) this.audio.thud();
    this.train.validate();
    if (!this.train.pos) this.train.placeOn(seg.id, Math.min(seg.length / 2, 2));
    this.train.group.visible = true;
    this.markDirty();
  }

  nudgeTrack(_segId: string): void {
    this.audio.click();
  }

  // ---------- train ----------

  tapTrain(): void {
    if (!this.train.pos) return;
    this.train.toggle();
    if (this.train.running) {
      this.audio.whistle();
      this.hud.leverValue = this.train.throttle;
      for (let i = 0; i < 3; i++) this.fx.smoke(this.train.chimneyWorld(), 1);
    } else {
      this.audio.brake();
      this.hud.leverValue = 0;
    }
  }

  enterCab(): void {
    if (!this.train.pos || this.cameras.mode === 'cab') return;
    this.audio.lift();
    this.hud.leverValue = this.train.running ? this.train.throttle : 0;
    this.cameras.enterCab();
    this.hud.setCab(true);
  }

  leaveCab(): void {
    if (this.cameras.mode !== 'cab') return;
    this.audio.putAway();
    this.cameras.exitCab();
    this.hud.setCab(false);
  }

  pullWhistle(): void {
    this.hud.cordPull = 1;
    this.audio.whistle();
    for (let i = 0; i < 4; i++) this.fx.smoke(this.train.chimneyWorld(), 1);
    for (const p of this.props.list) if (p.type === 'cow' || p.type === 'sheep' || p.type === 'dog') p.reactTimer = 0;
  }

  // ---------- props ----------

  beginToyDrag(type: string, at: THREE.Vector3): void {
    const p = this.props.add(type as PropType, at.x, at.z, Math.random() * Math.PI * 2, true);
    this.dragging = p;
    this.audio.lift();
  }

  beginPropDrag(id: string): void {
    const p = this.props.byId(id);
    if (!p) return;
    this.dragging = p;
    p.liftTarget = 0.6;
    this.audio.lift();
  }

  liftProp(id: string): void {
    const p = this.props.byId(id);
    if (!p) return;
    p.liftTarget = 1.0;
    p.wobble = 10;
    this.audio.lift();
  }

  beginTrackLift(segId: string): void {
    const mesh = this.tracks.meshFor(segId);
    if (!mesh) return;
    this.liftedSeg = { id: segId, mesh, offset: new THREE.Vector3() };
    this.audio.lift();
  }

  moveDrag(p: THREE.Vector3, overBox: boolean): void {
    this.hud.openTarget = overBox ? 1 : 0;
    if (this.dragging) {
      const d = this.dragging;
      d.x = Props.clampToFelt(p.x, GROUND_HALF + 2);
      d.z = Props.clampToFelt(p.z, GROUND_HALF + 2);
      d.liftTarget = overBox ? 1.6 : 0.9;
      d.wobble = 0.2;
      d.onTrack = false;
    } else if (this.liftedSeg) {
      const seg = this.graph.segments.get(this.liftedSeg.id);
      if (!seg) return;
      const mid = seg.pts[Math.floor(seg.pts.length / 2)];
      this.liftedSeg.offset.set(p.x - mid[0], overBox ? 2.2 : 1.0, p.z - mid[1]);
    }
  }

  endDrag(overBox: boolean): void {
    this.hud.openTarget = 0;
    if (this.dragging) {
      const d = this.dragging;
      this.dragging = null;
      if (overBox) {
        this.props.remove(d);
        this.audio.putAway();
        this.markDirty();
        return;
      }
      d.liftTarget = 0;
      d.wobble = 0;
      const [x, z] = this.props.clearOfTrack(d.x, d.z, d.type);
      d.x = Props.clampToFelt(x, GROUND_HALF);
      d.z = Props.clampToFelt(z, GROUND_HALF);
      if (d.type === 'station') this.props.snapStation(d);
      this.props.applyTransform(d);
      this.audio.thud();
      this.fx.dust(new THREE.Vector3(d.x, 0.1, d.z), 6);
      this.markDirty();
    } else if (this.liftedSeg) {
      const lifted = this.liftedSeg;
      this.liftedSeg = null;
      if (overBox) {
        this.graph.removeSegment(lifted.id);
        this.tracks.sync();
        this.train.validate();
        this.audio.putAway();
        this.markDirty();
      } else {
        lifted.mesh.position.set(0, 0, 0);
        lifted.mesh.rotation.set(0, 0, 0);
        this.audio.thud();
      }
    }
    for (const p of this.props.list) if (p.wobble > 1) p.wobble = 0;
    for (const p of this.props.list) if (p.liftTarget > 0 && p !== this.dragging) p.liftTarget = 0;
  }

  // ---------- loop ----------

  private tick(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.controller.update(dt);
    this.train.update(dt);
    this.props.update(dt);
    this.fx.update(dt);
    this.tracks.update(dt, this.controller.drawing);
    this.save.update(dt);

    if (this.cameras.mode === 'cab') {
      this.train.setThrottle(this.hud.leverValue);
    }
    this.cameras.setCab(this.train.loco);
    if (this.train.isMoving) {
      this.frameDirty = true;
      this.train.smokeTimer -= dt;
      if (this.train.smokeTimer <= 0) {
        this.train.smokeTimer = 0.35 - (this.train.speed / this.train.maxSpeed) * 0.2;
        this.fx.smoke(this.train.chimneyWorld(), this.train.speed / this.train.maxSpeed);
      }
    }
    this.audio.chuff(this.train.speed / this.train.maxSpeed, dt);
    if (this.frameDirty) {
      this.reframe();
      this.frameDirty = false;
    }
    this.cameras.update(dt);
    this.hud.update(dt, this.train.speed / this.train.maxSpeed);

    // lifted segment wobble
    if (this.liftedSeg) {
      const m = this.liftedSeg.mesh;
      m.position.copy(this.liftedSeg.offset);
      m.position.y = Math.max(m.position.y, 0.8);
      m.rotation.z = Math.sin(t * 24) * 0.03;
      m.rotation.x = Math.cos(t * 19) * 0.02;
    }
    // sun follows the train so shadows stay crisp wherever it goes
    this.world.sun.target.position.copy(this.train.loco.position);
    this.world.sun.position.copy(this.train.loco.position).add(SUN_OFFSET);
    // idle train breathes a little puff now and then: "I'm ready, touch me"
    if (!this.train.isMoving && this.train.pos) {
      this.idlePuff -= dt;
      if (this.idlePuff <= 0) {
        this.idlePuff = 3.5 + Math.random() * 2;
        this.fx.smoke(this.train.chimneyWorld(), 0);
      }
    }

    // Render: world, then PiP (in cab), then HUD
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    r.autoClear = true;
    r.render(this.world.scene, this.cameras.view);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.hud.scene, this.hud.camera);
    r.autoClear = true;
    if (this.cameras.blend > 0.5) {
      const full = this.hud.pipRect();
      const inset = full.w * 0.05;
      const rect = { x: full.x + inset, y: full.y + inset, w: full.w - inset * 2, h: full.h - inset * 2 };
      r.setViewport(rect.x, rect.y, rect.w, rect.h);
      r.setScissor(rect.x, rect.y, rect.w, rect.h);
      r.setScissorTest(true);
      const cam = this.cameras.overhead;
      cam.clearViewOffset();
      cam.aspect = rect.w / rect.h;
      cam.updateProjectionMatrix();
      r.render(this.world.scene, cam);
      this.cameras.applyViewOffset();
      r.setScissorTest(false);
      r.setViewport(0, 0, this.width, this.height);
    }
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
