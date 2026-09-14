import * as THREE from 'three';
import type { Game } from '../main';
import { SNAP_RADIUS, type V2 } from '../track/geometry';

type Target =
  | { kind: 'ground' }
  | { kind: 'train' }
  | { kind: 'prop'; id: string }
  | { kind: 'track'; segId: string }
  | { kind: 'toy'; type: string }
  | { kind: 'control'; name: string }
  | { kind: 'none' };

const TAP_MOVE = 14; // px
const LONG_PRESS = 0.5; // s

/**
 * Turns pointer events into the handful of wordless interactions:
 * draw rails, tap/hold the train, drag props, pull toys out of the box,
 * hold to lift things, drop them back into the box, and cab controls.
 */
export class Controller {
  private pointerId: number | null = null;
  private secondId: number | null = null;
  private down = new THREE.Vector2();
  private last = new THREE.Vector2();
  private moved = false;
  private downAt = 0;
  private held = false;
  private target: Target = { kind: 'none' };
  private stroke: V2[] = [];
  private snapStartNode: string | null = null;
  private pinchStart = 0;
  private second = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private hoverV = new THREE.Vector3();
  active = false;

  constructor(private game: Game, private canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get drawing(): boolean {
    return this.active && this.target.kind === 'ground' && this.stroke.length > 0;
  }

  private groundPoint(px: number, py: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.ndc.set((px / this.game.width) * 2 - 1, -(py / this.game.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.game.cameras.view);
    return this.ray.ray.intersectPlane(this.groundPlane, out);
  }

  private pick(px: number, py: number): Target {
    const g = this.game;
    this.ndc.set((px / g.width) * 2 - 1, -(py / g.height) * 2 + 1);
    // HUD first
    this.ray.setFromCamera(this.ndc, g.hud.camera);
    const hudHits = this.ray.intersectObjects(g.hud.scene.children, true);
    for (const h of hudHits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.control && g.hud.cabGroup.visible) return { kind: 'control', name: o.userData.control as string };
        if (o.userData.toyType && g.hud.box.visible) return { kind: 'toy', type: o.userData.toyType as string };
        o = o.parent;
      }
    }
    if (g.hud.box.visible && g.hud.overBox(px, py)) return { kind: 'none' };
    if (g.cameras.mode === 'cab') return { kind: 'none' };
    // world
    this.ray.setFromCamera(this.ndc, g.cameras.view);
    const hits = this.ray.intersectObjects([g.train.group, g.props.group, g.tracks.group, g.world.ground], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o === g.train.group) return { kind: 'train' };
        if (o.userData.propId) return { kind: 'prop', id: o.userData.propId as string };
        if (o.userData.segId) return { kind: 'track', segId: o.userData.segId as string };
        if (o === g.world.ground) return { kind: 'ground' };
        o = o.parent;
      }
    }
    return { kind: 'ground' };
  }

  private onDown = (e: PointerEvent): void => {
    this.game.audio.unlock();
    if (this.pointerId !== null) {
      // second finger: only used for pinch-in to leave the cab
      if (this.secondId === null) {
        this.secondId = e.pointerId;
        this.second.set(e.clientX, e.clientY);
        this.pinchStart = this.second.distanceTo(this.last);
      }
      return;
    }
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.down.set(e.clientX, e.clientY);
    this.last.copy(this.down);
    this.moved = false;
    this.downAt = performance.now();
    this.held = false;
    this.active = true;
    this.stroke = [];
    this.target = this.pick(e.clientX, e.clientY);
    const g = this.game;
    switch (this.target.kind) {
      case 'ground': {
        const p = this.groundPoint(e.clientX, e.clientY);
        if (p) {
          const start: V2 = [p.x, p.z];
          const node = g.graph.nearestFreeNode(start, SNAP_RADIUS);
          this.snapStartNode = node?.id ?? null;
          this.stroke.push(node ? node.pos : start);
        }
        break;
      }
      case 'track': {
        // Starting on an open rail end extends it; otherwise it's a hold-to-lift candidate.
        const p = this.groundPoint(e.clientX, e.clientY);
        if (p) {
          const node = g.graph.nearestFreeNode([p.x, p.z], SNAP_RADIUS);
          if (node) {
            this.target = { kind: 'ground' };
            this.snapStartNode = node.id;
            this.stroke.push(node.pos);
          }
        }
        break;
      }
      case 'toy': {
        const p = this.groundPoint(e.clientX, e.clientY);
        g.beginToyDrag(this.target.type, p ?? new THREE.Vector3());
        this.target = { kind: 'prop', id: g.dragging?.id ?? '' };
        this.held = true;
        break;
      }
      case 'prop': {
        g.beginPropDrag(this.target.id);
        break;
      }
      case 'control': {
        if (this.target.name === 'lever') g.hud.setLeverFromScreenY(e.clientY);
        else if (this.target.name === 'cord') g.pullWhistle();
        break;
      }
      default:
        break;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const g = this.game;
    if (e.pointerId === this.secondId && this.pointerId !== null) {
      this.second.set(e.clientX, e.clientY);
      const d = this.second.distanceTo(this.last);
      if (g.cameras.mode === 'cab' && this.pinchStart > 0 && d < this.pinchStart - 60) {
        g.leaveCab();
        this.pinchStart = 0;
      }
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    const cur = new THREE.Vector2(e.clientX, e.clientY);
    if (!this.moved && cur.distanceTo(this.down) > TAP_MOVE) this.moved = true;
    this.last.copy(cur);
    switch (this.target.kind) {
      case 'ground': {
        const p = this.groundPoint(e.clientX, e.clientY);
        if (p) {
          const lastPt = this.stroke[this.stroke.length - 1];
          const np: V2 = [p.x, p.z];
          if (!lastPt || Math.hypot(lastPt[0] - np[0], lastPt[1] - np[1]) > 0.08) this.stroke.push(np);
          g.previewStroke(this.stroke, this.snapStartNode);
        }
        break;
      }
      case 'prop': {
        if (g.dragging) {
          const p = this.groundPoint(e.clientX, e.clientY, this.hoverV);
          if (p) g.moveDrag(p, g.hud.overBox(e.clientX, e.clientY));
        }
        break;
      }
      case 'track': {
        if (this.held) {
          const p = this.groundPoint(e.clientX, e.clientY, this.hoverV);
          if (p) g.moveDrag(p, g.hud.overBox(e.clientX, e.clientY));
        }
        break;
      }
      case 'control': {
        if (this.target.name === 'lever') g.hud.setLeverFromScreenY(e.clientY);
        break;
      }
      case 'none': {
        // swipe down in the cab while stopped leaves the cab
        if (g.cameras.mode === 'cab' && !g.train.isMoving && cur.y - this.down.y > 120) {
          g.leaveCab();
          this.target = { kind: 'ground' };
          this.stroke = [];
        }
        break;
      }
      default:
        break;
    }
  };

  private onUp = (e: PointerEvent): void => {
    const g = this.game;
    if (e.pointerId === this.secondId) {
      this.secondId = null;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.secondId = null;
    this.active = false;
    const overBox = g.hud.overBox(e.clientX, e.clientY) && g.hud.box.visible;
    switch (this.target.kind) {
      case 'ground':
        g.finishStroke(this.stroke, this.snapStartNode);
        break;
      case 'train':
        if (!this.moved && !this.held) g.tapTrain();
        break;
      case 'prop':
        g.endDrag(overBox);
        break;
      case 'track':
        if (this.held) g.endDrag(overBox);
        else if (!this.moved) g.nudgeTrack(this.target.segId);
        break;
      case 'control':
        if (this.target.name === 'pip' && !this.moved) g.leaveCab();
        break;
      default:
        break;
    }
    this.stroke = [];
    this.snapStartNode = null;
    this.target = { kind: 'none' };
  };

  update(_dt: number): void {
    if (!this.active || this.held) return;
    if (this.moved) return;
    if (performance.now() - this.downAt < LONG_PRESS * 1000) return;
    const g = this.game;
    this.held = true;
    switch (this.target.kind) {
      case 'train':
        g.enterCab();
        break;
      case 'track':
        g.beginTrackLift(this.target.segId);
        break;
      case 'prop':
        g.liftProp(this.target.id);
        break;
      default:
        break;
    }
  }
}
