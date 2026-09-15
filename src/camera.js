import * as THREE from 'three';
import { rand } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 6, 14);
    this.look = new THREE.Vector3(0, 1.2, 0);
    this.portrait = false;
    this.aspect = 1.7;
    this.focus = null;
    this.focusWeight = 0.5;
    this.pan = null;
    this.shake = 0;
    this.zoom = 1;
    this.orbit = 0;      // swing the camera sideways for porch close-ups
    this.eyeScale = 1;   // lower the eye line for close-ups
    this.orbitCur = 0;
    this.dirOverride = null;   // force which side the camera sits on (ending)
    this.lookLift = 0.25;      // how much sky to keep above the look target
    this.shot = null;          // an explicit {pos, look} composition
    this.lerpRate = 2.0;       // how hard the camera chases; raise it for a run
    this.snapNext = true;
  }

  setViewport(w, h) {
    this.portrait = h > w;
    this.aspect = w / h;
  }

  setFocus(p, weight = 0.5) {
    this.focus = p ? p.clone() : null;
    this.focusWeight = weight;
  }

  /** lookOnly: turn the head toward something far away (the moon) without
   *  flying the camera out there. */
  panTo(point, dur = 2.2, lookOnly = false) {
    this.pan = { point: point.clone(), t: 0, dur, lookOnly };
  }

  /** compose an exact shot; pass null to hand control back to the follow rig */
  setShot(pos, look) {
    this.shot = pos ? { pos: pos.clone(), look: look.clone() } : null;
  }

  update(dt, girl) {
    const cam = this.camera;
    const gp = _a.copy(girl.pos); gp.y += 1.15;

    if (this.shot) {
      const ks = this.snapNext ? 1 : Math.min(1, dt * this.lerpRate);
      this.pos.lerp(this.shot.pos, ks);
      this.look.lerp(this.shot.look, this.snapNext ? 1 : Math.min(1, dt * this.lerpRate * 1.4));
      this.snapNext = false;
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      return;
    }

    // camera direction first: it sits behind the girl, blended toward "down the
    // street" so it never whips around when she turns, and on the far side of
    // her from whatever the world is currently inviting.
    const behind = new THREE.Vector3(
      Math.sin(girl.heading + Math.PI), 0, Math.cos(girl.heading + Math.PI)
    );
    behind.lerp(new THREE.Vector3(0.16, 0, 1).normalize(), 0.55).normalize();
    if (this.focus) {
      _b.copy(girl.pos).sub(this.focus); _b.y = 0;
      if (_b.lengthSq() > 0.25) {
        _b.normalize();
        behind.lerp(_b, 0.8).normalize();
      }
    }

    if (this.dirOverride) behind.copy(this.dirOverride).setY(0).normalize();

    this.orbitCur += (this.orbit - this.orbitCur) * (this.snapNext ? 1 : Math.min(1, dt * 1.8));
    if (Math.abs(this.orbitCur) > 1e-4) behind.applyAxisAngle(UP, this.orbitCur);

    const dist = (this.portrait ? 10.4 : 8.6) * this.zoom;
    const height = (this.portrait ? 5.6 : 4.4) * (0.62 + this.zoom * 0.38) * this.eyeScale;

    // Bias the framing toward the focus, but never further than the frustum can
    // afford: the girl has to stay comfortably inside the frame, portrait too.
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.aspect);
    const room = 0.5 * dist * Math.tan(hFov / 2);
    const target = gp.clone();
    if (this.focus) {
      _b.copy(this.focus).sub(gp);
      const maxBias = Math.min(room, 4.5) * Math.min(1, this.focusWeight * 2);
      if (_b.length() > maxBias) _b.setLength(maxBias);
      target.add(_b);
    }

    const desired = target.clone().addScaledVector(behind, dist);
    desired.y = height;

    let lookTarget = target.clone();
    lookTarget.y += this.lookLift;

    if (this.pan) {
      // a short establishing look at the next glowing house, then back to her
      this.pan.t += dt;
      const k = Math.min(1, this.pan.t / this.pan.dur);
      const e = Math.sin(k * Math.PI);
      const pd = this.pan.point;
      lookTarget.lerp(pd, e * (this.pan.lookOnly ? 0.85 : 1));
      if (!this.pan.lookOnly) {
        _b.copy(gp).sub(pd); _b.y = 0;
        if (_b.lengthSq() < 1) _b.set(0, 0, 1);
        _b.normalize();
        const panPos = pd.clone().addScaledVector(_b, this.portrait ? 13 : 11.5);
        panPos.y = this.portrait ? 6.2 : 5.4;
        desired.lerp(panPos, e);
      }
      if (k >= 1) this.pan = null;
    }

    const k1 = this.snapNext ? 1 : Math.min(1, dt * this.lerpRate);
    const k2 = this.snapNext ? 1 : Math.min(1, dt * this.lerpRate * 1.4);
    this.pos.lerp(desired, k1);
    this.look.lerp(lookTarget, k2);
    this.snapNext = false;

    this.shake = Math.max(0, this.shake - dt * 2);
    const sx = (rand() - 0.5) * this.shake * 0.25;
    const sy = (rand() - 0.5) * this.shake * 0.25;
    cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    cam.lookAt(this.look);
  }
}
