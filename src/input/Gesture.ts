import * as THREE from 'three';
import { clamp } from '../util/math';
import type { Diorama } from '../scene/Diorama';
import type { Scalable } from '../scene/objects/Scalable';
import type { Pillar } from '../scene/objects/Pillar';
import type { Synth } from '../audio/Synth';

type Mode = 'scale' | 'rotate' | 'pillar';

/**
 * 片指で完結する操作。
 * - 伸縮できるものに触れて上下にドラッグ → 大きく/小さく(上=大きく)
 * - 何もない場所を左右にドラッグ → 円盤が回る
 * - 触って離すだけ → タップ(柱、海、地面が反応)
 */
export class Gesture {
  private pointerId: number | null = null;
  private mode: Mode = 'rotate';
  private target: Scalable | null = null;
  private hit: THREE.Intersection | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private startScale = 1;
  private startTime = 0;
  private moved = false;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly d: Diorama,
    private readonly synth: Synth,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pick(x: number, y: number): THREE.Intersection | null {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.d.hitTargets, false);
    return hits.length ? hits[0] : null;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.synth.unlock();
    this.d.noteInteraction();
    this.startX = this.lastX = e.clientX;
    this.startY = e.clientY;
    this.startTime = performance.now();
    this.moved = false;
    this.hit = this.pick(e.clientX, e.clientY);
    const owner = this.hit?.object.userData.owner as Scalable | undefined;
    const pillar = this.hit?.object.userData.pillar as Pillar | undefined;
    if (owner) {
      this.mode = 'scale';
      this.target = owner;
      this.startScale = owner.target;
      this.d.grab(owner);
    } else if (pillar) {
      this.mode = 'pillar';
    } else {
      this.mode = 'rotate';
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.d.noteInteraction();
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (!this.moved && Math.hypot(dx, dy) > 6) this.moved = true;
    if (this.mode === 'scale' && this.target) {
      // 指を上げるほど大きく。画面高さの約28%で2倍
      const per = this.el.clientHeight * 0.28;
      const v = clamp(this.startScale * Math.pow(2, -dy / per), this.target.minScale, this.target.maxScale);
      this.d.setScale(this.target, v);
    } else if (this.mode === 'rotate') {
      const ddx = e.clientX - this.lastX;
      this.d.rotate(ddx * 0.008);
    }
    this.lastX = e.clientX;
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const quick = performance.now() - this.startTime < 600;
    if (this.mode === 'scale' && this.target) {
      this.d.release(this.target);
    } else if (this.mode === 'pillar') {
      if (!this.moved && quick) this.d.tapPillar();
    } else if (!this.moved && quick && this.hit) {
      this.d.tapWorld(this.hit);
    }
    this.pointerId = null;
    this.target = null;
    this.hit = null;
  };
}
