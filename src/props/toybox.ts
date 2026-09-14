import * as THREE from 'three';
import { TOYBOX_FRACTION } from '../camera/cameras';
import { damp, PALETTE, toy } from '../fx/fx';
import { buildProp, PROP_TYPES, type PropType } from './models';

/**
 * A screen-space overlay scene: the wooden toy box (overhead mode) and the cab
 * controls (lever, whistle cord, picture-in-picture frame) in cab mode.
 * Rendered on top of the world with its own orthographic camera.
 */
export class Hud {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  box = new THREE.Group();
  lid = new THREE.Mesh();
  items: { type: PropType; mesh: THREE.Object3D; base: THREE.Vector3 }[] = [];
  cabGroup = new THREE.Group();
  lever = new THREE.Group();
  leverHandle = new THREE.Mesh();
  cord = new THREE.Group();
  cordKnob = new THREE.Mesh();
  pipFrame = new THREE.Mesh();
  private t = 0;
  private open = 0;
  openTarget = 0;
  /** 0..1, lever position */
  leverValue = 0;
  cordPull = 0;
  units = 10; // screen height in HUD units
  width = 1;
  height = 1;
  portrait = true;
  private glow: THREE.Mesh;

  constructor() {
    this.camera.position.z = 30;
    this.camera.lookAt(0, 0, 0);
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(2, 6, 5);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.2));

    // Toy box
    const wood = toy(PALETTE.wood);
    const dark = toy(PALETTE.woodDark);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 1.8), wood);
    body.name = 'toybox';
    this.box.add(body);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.1, 1.5), dark);
    inner.position.y = 0.15;
    inner.name = 'toybox';
    this.box.add(inner);
    const rimF = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.18), dark);
    rimF.position.set(0, 0.6, 0.9);
    this.box.add(rimF);
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.14, 1.9), wood);
    this.lid.geometry.translate(0, 0, 0.95);
    this.lid.position.set(0, 0.68, -0.9);
    this.lid.rotation.x = -2.5;
    this.box.add(this.lid);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.6), new THREE.MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0 }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.72;
    this.box.add(this.glow);
    // Items peeking out
    PROP_TYPES.forEach((type, i) => {
      const mesh = buildProp(type, 0.3);
      const s = type === 'station' ? 0.42 : type === 'house' ? 0.62 : 0.72;
      mesh.scale.setScalar(s);
      const base = new THREE.Vector3(-1.7 + i * 0.49, 0.32, (i % 2) * 0.5 - 0.15);
      mesh.position.copy(base);
      mesh.rotation.y = -0.6 + (i % 3) * 0.5;
      mesh.traverse((c) => {
        c.userData.toyType = type;
      });
      this.box.add(mesh);
      this.items.push({ type, mesh, base });
    });
    this.box.rotation.x = 0.55;
    this.scene.add(this.box);

    // Cab controls
    this.cabGroup.visible = false;
    // lever: slot + handle
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.3), dark);
    this.lever.add(slot);
    const notches = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.1), toy(PALETTE.glow));
    notches.position.z = 0.12;
    this.lever.add(notches);
    this.leverHandle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), toy(PALETTE.loco));
    this.leverHandle.name = 'lever';
    this.leverHandle.position.set(0, -1.3, 0.5);
    this.lever.add(this.leverHandle);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10), wood);
    stick.rotation.x = Math.PI / 2;
    stick.position.set(0, -1.3, 0.05);
    stick.name = 'leverStick';
    this.lever.add(stick);
    this.lever.traverse((c) => (c.userData.control = 'lever'));
    this.cabGroup.add(this.lever);
    // whistle cord
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), toy(0xe8dcc2));
    rope.position.y = -1.1;
    rope.name = 'rope';
    this.cord.add(rope);
    this.cordKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.6, 12), wood);
    this.cordKnob.position.y = -2.4;
    this.cord.add(this.cordKnob);
    this.cord.traverse((c) => (c.userData.control = 'cord'));
    this.cabGroup.add(this.cord);
    // window frame (dashboard) at bottom
    const dash = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 0.4), toy(PALETTE.car1));
    dash.name = 'dash';
    this.cabGroup.add(dash);
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), toy(PALETTE.white));
    gauge.name = 'gauge';
    this.cabGroup.add(gauge);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 24), toy(PALETTE.wheel));
    rim.position.z = 0.01;
    gauge.add(rim);
    for (let i = 0; i < 7; i++) {
      const a = THREE.MathUtils.lerp(2.2, -2.2, i / 6) + Math.PI / 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.02), toy(i > 4 ? PALETTE.loco : PALETTE.wheel));
      tick.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0.02);
      tick.rotation.z = a - Math.PI / 2;
      gauge.add(tick);
    }
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.04), toy(PALETTE.loco));
    needle.geometry.translate(0, 0.25, 0);
    needle.position.z = 0.04;
    needle.name = 'needle';
    gauge.add(needle);
    const pin = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), toy(PALETTE.wheel));
    pin.position.z = 0.06;
    gauge.add(pin);
    // pip frame
    this.pipFrame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), wood);
    this.pipFrame.name = 'pip';
    this.pipFrame.userData.control = 'pip';
    this.cabGroup.add(this.pipFrame);
    this.scene.add(this.cabGroup);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.portrait = h >= w;
    const aspect = w / h;
    const half = this.units / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  private layout(): void {
    const half = this.units / 2;
    const aspect = this.width / this.height;
    const f = TOYBOX_FRACTION;
    if (this.portrait) {
      // bottom band
      const bandH = this.units * f;
      this.box.position.set(0, -half + bandH * 0.4, 0);
      this.box.rotation.set(0.62, 0, 0);
      this.box.scale.setScalar(Math.min(1.05, (half * aspect * 2) / 5.0));
    } else {
      const bandW = this.units * aspect * f;
      this.box.position.set(half * aspect - bandW * 0.5, -0.4, 0);
      this.box.rotation.set(0.55, -Math.PI / 2, 0);
      this.box.scale.setScalar(Math.min(1.15, (this.units * 0.9) / 5.2));
    }
    // cab controls
    const right = half * aspect;
    this.lever.position.set(right - 1.1, this.portrait ? -half + 3.6 : -1.0, 1);
    this.cord.position.set(-right + 1.0, this.portrait ? half - 1.2 : half - 0.4, 1);
    const dash = this.cabGroup.getObjectByName('dash')!;
    dash.position.set(0, -half + 0.6, 0);
    dash.scale.x = (right * 2) / 30 + 0.01;
    const gauge = this.cabGroup.getObjectByName('gauge')!;
    gauge.position.set(0, -half + 0.7, 0.3);
    // pip: top-right square (a little window back to the toy box)
    const size = this.portrait ? Math.min(3.0, right * 0.8) : 2.8;
    this.pipFrame.scale.set(size + 0.3, size + 0.3, 1);
    this.pipFrame.position.set(right - size / 2 - 0.5, half - size / 2 - 0.5, -1);
    this.pipFrame.userData.size = size;
  }

  /** Pixel rectangle (bottom-left origin) of the picture-in-picture area. */
  pipRect(): { x: number; y: number; w: number; h: number } {
    const half = this.units / 2;
    const aspect = this.width / this.height;
    const size = this.pipFrame.userData.size as number;
    const pxPerUnit = this.height / this.units;
    const cx = this.pipFrame.position.x;
    const cy = this.pipFrame.position.y;
    return {
      x: (cx - size / 2 + half * aspect) * pxPerUnit,
      y: (cy - size / 2 + half) * pxPerUnit,
      w: size * pxPerUnit,
      h: size * pxPerUnit,
    };
  }

  /** Is this screen point (pixels, top-left origin) inside the toy box band? */
  overBox(px: number, py: number): boolean {
    const f = TOYBOX_FRACTION;
    return this.portrait ? py > this.height * (1 - f) : px > this.width * (1 - f);
  }

  /** Convert a screen point to HUD units. */
  toHud(px: number, py: number): THREE.Vector2 {
    const half = this.units / 2;
    const aspect = this.width / this.height;
    return new THREE.Vector2((px / this.width - 0.5) * 2 * half * aspect, (0.5 - py / this.height) * 2 * half);
  }

  setLeverFromScreenY(py: number): void {
    const p = this.toHud(0, py);
    const local = p.y - this.lever.position.y;
    this.leverValue = THREE.MathUtils.clamp((local + 1.3) / 2.6, 0, 1);
  }

  setCab(visible: boolean): void {
    this.cabGroup.visible = visible;
    this.box.visible = !visible;
  }

  update(dt: number, speedNorm: number): void {
    this.t += dt;
    this.open = damp(this.open, this.openTarget, 8, dt);
    this.lid.rotation.x = -2.5 - this.open * 0.5;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = this.open * 0.5;
    this.items.forEach((it, i) => {
      const bob = Math.sin(this.t * 1.8 + i * 1.3) * 0.05;
      it.mesh.position.y = it.base.y + bob;
      it.mesh.rotation.y += dt * 0.15;
    });
    this.box.position.y += 0; // stable
    // lever handle
    const y = -1.3 + this.leverValue * 2.6;
    this.leverHandle.position.y = y;
    const stick = this.lever.getObjectByName('leverStick');
    if (stick) stick.position.y = y;
    // cord
    this.cordPull = damp(this.cordPull, 0, 6, dt);
    this.cord.scale.y = 1 + this.cordPull * 0.35;
    // gauge needle
    const needle = this.cabGroup.getObjectByName('needle');
    if (needle) needle.rotation.z = THREE.MathUtils.lerp(1.2, -1.2, speedNorm);
  }
}
