import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _right = new THREE.Vector3();
const _view = new THREE.Vector3();

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

  panTo(point, dur = 2.2) {
    this.pan = { point: point.clone(), t: 0, dur };
  }

  update(dt, girl) {
    const cam = this.camera;
    const gp = _a.copy(girl.pos); gp.y += 1.15;

    // In portrait the horizontal field of view is narrow, so the look target
    // must stay much closer to the girl or she slides out of frame.
    // bias the framing toward the current focus, but only a little: the girl
    // must always stay comfortably inside the frame, portrait included
    const target = gp.clone();
    if (this.focus) {
      _b.copy(this.focus).sub(gp);
      const maxBias = (this.portrait ? 1.6 : 3.0) * this.focusWeight * 2;
      if (_b.length() > maxBias) _b.setLength(maxBias);
      target.add(_b);
    }

    // camera sits behind the girl, blended toward "down the street" so it
    // never whips around when she turns
    const behind = new THREE.Vector3(
      Math.sin(girl.heading + Math.PI), 0, Math.cos(girl.heading + Math.PI)
    );
    behind.lerp(new THREE.Vector3(0.16, 0, 1).normalize(), 0.55).normalize();
    if (this.focus) {
      // sit on the far side of the girl from whatever she should be looking at,
      // so the current target is always straight ahead in the frame
      _b.copy(girl.pos).sub(this.focus); _b.y = 0;
      if (_b.lengthSq() > 0.25) {
        _b.normalize();
        behind.lerp(_b, 0.8).normalize();
      }
    }

    let dist = (this.portrait ? 10.4 : 8.6) * this.zoom;
    let height = (this.portrait ? 5.6 : 4.4) * (0.62 + this.zoom * 0.38);

    // make sure the girl herself never leaves the frame horizontally
    _view.copy(behind).negate();
    _right.copy(_view).cross(UP).normalize();
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.aspect);
    _b.copy(gp).sub(target);
    const needH = Math.abs(_b.dot(_right));
    const fitH = (needH * 2.2) / Math.tan(hFov / 2);
    dist = Math.min(18, Math.max(dist, fitH));

    const desired = target.clone().addScaledVector(behind, dist);
    desired.y = height;

    let lookTarget = target.clone();
    lookTarget.y += 0.25;

    if (this.pan) {
      this.pan.t += dt;
      const k = Math.min(1, this.pan.t / this.pan.dur);
      const e = Math.sin(k * Math.PI);
      lookTarget.lerp(this.pan.point, e * 0.8);
      desired.lerp(
        this.pan.point.clone().addScaledVector(behind, dist * 0.95).setY(height + 1.5),
        e * 0.45
      );
      if (k >= 1) this.pan = null;
    }

    const k1 = this.snapNext ? 1 : Math.min(1, dt * 2.0);
    const k2 = this.snapNext ? 1 : Math.min(1, dt * 2.8);
    this.pos.lerp(desired, k1);
    this.look.lerp(lookTarget, k2);
    this.snapNext = false;

    this.shake = Math.max(0, this.shake - dt * 2);
    const sx = (Math.random() - 0.5) * this.shake * 0.25;
    const sy = (Math.random() - 0.5) * this.shake * 0.25;
    cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    cam.lookAt(this.look);
  }
}
