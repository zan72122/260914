import * as THREE from 'three';
import { Moon } from './objects/Moon';
import { Tree } from './objects/Tree';
import { House } from './objects/House';
import { Pillar } from './objects/Pillar';
import { Sea } from './objects/Sea';
import { Sky } from './objects/Sky';
import { Island, islandHeightAt, makeDisc, makeShelf } from './objects/Island';
import { Scalable } from './objects/Scalable';
import { Effects } from './Effects';
import { seaLevelFor, SEA_MAX, SEA_MIN } from '../rules/TideRule';
import { damp } from '../util/math';
import type { Synth } from '../audio/Synth';

const IDLE_HINT_SEC = 8;

export class Diorama {
  /** 指で回せる円盤とその上のもの */
  readonly world = new THREE.Group();
  readonly moon = new Moon();
  readonly tree: Tree;
  readonly house: House;
  readonly pillar = new Pillar();
  readonly sea = new Sea();
  readonly island = new Island();
  readonly sky = new Sky();
  readonly effects = new Effects();
  readonly scalables: Scalable[];
  /** レイキャスト対象 */
  readonly hitTargets: THREE.Object3D[];

  private readonly synth: Synth;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private targetRot = 0;
  private lastInteraction = 0;
  private time = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, synth: Synth) {
    this.synth = synth;
    scene.add(this.sky);
    scene.add(this.world);
    scene.add(this.moon);
    scene.add(this.effects.group);

    this.world.add(makeDisc());
    this.world.add(this.island);
    this.world.add(this.sea);
    const shelf = makeShelf();
    shelf.position.set(3.05, 0, 0.9);
    this.world.add(shelf);
    this.pillar.position.set(3.05, 0.2, 0.9);
    this.world.add(this.pillar);

    this.tree = new Tree(this.world, synth);
    this.tree.position.set(1.05, islandHeightAt(1.05, 0.55) - 0.05, 0.55);
    this.world.add(this.tree);

    this.house = new House(this.world, synth);
    this.house.position.set(-0.55, islandHeightAt(-0.55, -0.35) - 0.03, -0.35);
    this.house.rotation.y = 0.35;
    this.world.add(this.house);

    this.scalables = [this.moon, this.tree, this.house];
    this.hitTargets = [
      this.moon.hitProxy,
      this.tree.hitProxy,
      this.house.hitProxy,
      this.pillar.hitProxy,
      this.sea,
      this.island,
      shelf,
    ];

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x9a7a5a, 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
    this.sun.position.set(5, 8, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -5;
    sc.right = 5;
    sc.top = 5;
    sc.bottom = -5;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);
    // 手前からのやわらかい補助光(円盤の側面が黒くならないように)
    const fill = new THREE.DirectionalLight(0xffe4d0, 0.5);
    fill.position.set(-3, 4, 10);
    scene.add(fill);
    this.world.rotation.y = -0.4;
    this.targetRot = -0.4;
  }

  /** 画面の向きに合わせて月の位置を決める(常に画面内に見える) */
  layoutMoon(camera: THREE.Camera, portrait: boolean): void {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const p = camera.position.clone().addScaledVector(fwd, 14);
    if (portrait) p.addScaledVector(right, 2.0).addScaledVector(up, 6.2);
    else p.addScaledVector(right, 6.6).addScaledVector(up, 3.4);
    this.moon.position.copy(p);
    this.sun.position.copy(p).normalize().multiplyScalar(12);
  }

  noteInteraction(): void {
    this.lastInteraction = this.time;
  }

  grab(s: Scalable): void {
    s.grabbed = true;
    s.bounce();
    s.hitProxy.getWorldPosition(this.tmp);
    this.effects.ring(this.tmp, 0xfff3c4, s.scale.x * (s.hitProxy.geometry as THREE.SphereGeometry).parameters.radius);
    this.effects.showGuide(s);
    this.synth.pop();
    this.synth.tone(true, s.target);
  }

  setScale(s: Scalable, v: number): void {
    s.target = v;
    this.synth.tone(true, v);
  }

  release(s: Scalable): void {
    s.grabbed = false;
    this.effects.hideGuide();
    this.synth.tone(false, s.target);
  }

  rotate(delta: number): void {
    this.targetRot += delta;
  }

  /** 伸縮対象でも柱でもない場所をタップ: それでも世界は反応する */
  tapWorld(hit: THREE.Intersection): void {
    const onSea = hit.object === this.sea;
    this.effects.ripple(hit.point, onSea ? 0xdff6ff : 0xfff0c0);
    this.synth.ripple();
  }

  tapPillar(): void {
    this.pillar.hitProxy.getWorldPosition(this.tmp);
    if (!this.pillar.exposed) {
      // まだ水の中: 波紋だけ
      this.tmp.y = this.world.position.y + this.sea.level;
      this.effects.ripple(this.tmp);
      this.synth.ripple();
      return;
    }
    if (!this.pillar.found) {
      this.pillar.celebrate();
      this.tmp.y += 0.5;
      this.effects.burst(this.tmp);
      this.effects.ring(this.tmp, 0xffe27a, 2);
      this.synth.chime();
      return;
    }
    // 2回目のタップ: はじめに戻る
    this.pillar.reset();
    for (const s of this.scalables) s.target = 1;
    this.effects.ring(this.tmp, 0xffffff, 1.5);
    this.synth.rewind();
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.time = t;
    const grabbing = this.scalables.some((s) => s.grabbed);

    for (const s of this.scalables) s.update(dt, t);

    const level = seaLevelFor(this.moon.value);
    this.sea.level = level;
    this.sea.update(t);
    this.island.setSeaLevel(level);
    this.pillar.setSeaLevel(level);
    this.pillar.update(dt, t);
    this.tree.seaLevel = level;
    this.synth.setWaveLevel((level - SEA_MIN) / (SEA_MAX - SEA_MIN));

    // 月が大きいほど夜が明るい
    const bright = 0.6 + 0.5 * this.moon.value;
    this.sun.intensity = 1.0 * bright + this.effects.shimmerAmount * 1.0;
    this.hemi.intensity = 0.9 + 0.3 * this.moon.value + this.effects.shimmerAmount * 0.8;

    this.world.rotation.y = damp(this.world.rotation.y, this.targetRot, 10, dt);

    // 放置時: 月がひとりでに明滅して「ここを触って」と誘う
    const idle = t - this.lastInteraction > IDLE_HINT_SEC && !grabbing && !this.pillar.found;
    this.moon.setPulse(idle);

    this.sky.update(t);
    this.effects.update(dt, t, camera);
  }
}
