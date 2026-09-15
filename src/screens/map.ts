import * as THREE from 'three';
import { levels } from '../levels';
import { PALETTES, type Level, type Palette } from '../levels/schema';
import { loadProgress } from '../core/progress';
import { attachTouchInput } from '../input/touch';
import { resumeAudio } from '../audio/context';
import { startBgm } from '../audio/bgm';
import { playEnterIsland, playFirework } from '../audio/sfx';
import { createStage, CAMERA_SECONDS, type Stage } from '../render/scene';
import { createPropField, createGoalFlag, makeRng, type PropPlacement } from '../render/props';
import { createVehicleBodies } from '../render/vehicle';
import { createConfetti } from '../render/fx';
import { causticsTexture } from '../render/textures';

/**
 * 地図画面(5.5-1 / 3.2)。海に浮かぶ 10 個の島。
 * 文字は一切出さない。島の並びと小道だけで «順番» を示す(3.2)。
 */

/** 島 1 つの半径 */
const ISLAND_R = 1.5;

/** 海のパレット(地図画面の空と光) */
const SEA_PALETTE: Palette = {
  ground: '#5FC8D8',
  road: '#8C8378',
  accent: '#F2E3B0',
  sky: '#9FD9F0',
  water: '#4FBFD6',
  glow: '#FFF3C4',
  flag: '#FFFFFF',
  night: false,
  sideDarken: 0.24,
  hemi: 1.0,
  sun: 1.4,
  sunColor: '#FFF9EC',
  caustics: true,
  bridge: false,
  props: [],
};

/** 10 個の島の並び(5.5 / 3.3-(4): 画面上で左にある島は地図でも左にある) */
const LAYOUT: readonly { x: number; z: number }[] = [
  { x: -6.5, z: -4.6 },
  { x: -2.2, z: -5.1 },
  { x: 2.0, z: -4.3 },
  { x: 6.2, z: -2.7 },
  { x: 6.9, z: 1.4 },
  { x: 2.6, z: 0.6 },
  { x: -1.7, z: 0.0 },
  { x: -5.9, z: 0.8 },
  { x: -2.4, z: 4.6 },
  { x: 2.4, z: 5.2 },
];

export interface MapDebug {
  islands(): { index: number; cleared: boolean; next: boolean; x: number; y: number; z: number }[];
  project(x: number, y: number, z: number): { x: number; y: number };
}

export interface MapScreen {
  readonly debug: MapDebug;
  dispose(): void;
}

export interface MapOptions {
  /** 島をタップして中に入るとき */
  onEnter(level: Level, index: number): void;
  /** 直前に遊んでいた島。そこからズームアウトして始める */
  readonly from?: number | undefined;
}

function islandBox(i: number): THREE.Box3 {
  const p = LAYOUT[i] ?? { x: 0, z: 0 };
  const r = ISLAND_R * 1.35;
  return new THREE.Box3(
    new THREE.Vector3(p.x - r, 0, p.z - r),
    new THREE.Vector3(p.x + r, 0.8, p.z + r),
  );
}

/**
 * 10 島すべてが入る枠。
 * アイソメでは枠の四隅に海しか映らないので、枠を少しだけ内側に詰めて島を大きく見せる。
 */
function wholeBox(): THREE.Box3 {
  const box = new THREE.Box3();
  for (let i = 0; i < LAYOUT.length; i++) box.union(islandBox(i));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * 0.86);
  return new THREE.Box3(center.clone().sub(size), center.clone().add(size));
}

export function createMapScreen(container: HTMLElement, opts: MapOptions): MapScreen {
  const stage: Stage = createStage(container);
  stage.setPalette(SEA_PALETTE);

  const progress = loadProgress();
  const clearedSet = new Set(progress.cleared);
  const isCleared = (l: Level): boolean => clearedSet.has(l.id);
  /** 次に遊べる島 = 未クリアの最初の島(明滅して誘う) */
  const nextIndex = levels.findIndex((l) => !isCleared(l));
  const allCleared = nextIndex < 0;

  // --- 海 ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 160),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(SEA_PALETTE.water) }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, 0);
  sea.receiveShadow = true;
  stage.root.add(sea);

  const causticTex = causticsTexture().clone();
  causticTex.needsUpdate = true;
  causticTex.wrapS = THREE.RepeatWrapping;
  causticTex.wrapT = THREE.RepeatWrapping;
  causticTex.repeat.set(50, 40);
  const caustics = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 160),
    new THREE.MeshBasicMaterial({ map: causticTex, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(0, -0.33, 0);
  stage.root.add(caustics);

  // --- 島を結ぶ小道(点線、3.2: 番号の代わりに並び順と小道で示す) ---
  const dotGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const dotMat = new THREE.MeshLambertMaterial({ color: 0xf0e0b4 });
  for (let i = 0; i < LAYOUT.length - 1; i++) {
    const a = LAYOUT[i]!;
    const b = LAYOUT[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.max(2, Math.round(len / 0.55));
    for (let k = 1; k < n; k++) {
      const f = k / n;
      const x = a.x + dx * f;
      const z = a.z + dz * f;
      // 島の内側には置かない
      if (Math.hypot(x - a.x, z - a.z) < ISLAND_R || Math.hypot(x - b.x, z - b.z) < ISLAND_R) continue;
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(x, -0.18, z);
      stage.root.add(dot);
    }
  }

  // --- 島 ---
  interface IslandView {
    readonly index: number;
    readonly level: Level;
    readonly group: THREE.Group;
    readonly cleared: boolean;
    readonly highlight?: THREE.Mesh | undefined;
    readonly vehicles: THREE.Group[];
    readonly vehicleKind: 'car' | 'train';
  }
  const islands: IslandView[] = [];
  const hitObjects: THREE.Object3D[] = [];

  levels.forEach((level, i) => {
    const pos = LAYOUT[i] ?? { x: 0, z: 0 };
    const palette = PALETTES[level.theme];
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    stage.root.add(group);

    // 島の本体。そのレベルのテーマ色のミニチュア(5.5)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.86, 0.5, 9),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.ground), flatShading: true }),
    );
    base.position.y = -0.1;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    const beach = new THREE.Mesh(
      new THREE.CylinderGeometry(ISLAND_R * 1.12, ISLAND_R * 1.05, 0.16, 9),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(palette.ground).lerp(new THREE.Color('#F2E3B0'), 0.45),
        flatShading: true,
      }),
    );
    beach.position.y = -0.3;
    beach.receiveShadow = true;
    group.add(beach);

    // 島の環状の道(クリア済みならここを乗り物が周回する)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ISLAND_R * 0.6, 0.075, 6, 24),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.road) }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.16;
    group.add(ring);

    // テーマの装飾を少しだけ(6.3)。操作対象より目立たせない(3.3-(1))
    const rng = makeRng(`${level.id}:island`);
    const placements: PropPlacement[] = [];
    const kinds = palette.props;
    for (let k = 0; k < 4 && kinds.length > 0; k++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      if (!kind) continue;
      const a = rng() * Math.PI * 2;
      const r = ISLAND_R * (0.75 + rng() * 0.2);
      placements.push({
        kind,
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: 0.15,
        rotY: rng() * Math.PI * 2,
        scale: 0.9,
      });
    }
    const props = createPropField(placements, palette);
    group.add(props.group);

    const cleared = isCleared(level);

    // クリア済みの島には旗が立つ(3.2:「クリア!」テキストの置き換え)
    if (cleared) {
      const flag = createGoalFlag(palette);
      flag.position.set(0, 0.15, 0);
      flag.scale.setScalar(1.3);
      group.add(flag);
    }

    // クリア済みの島では乗り物が周回している(5.5)
    const vehicles: THREE.Group[] = [];
    if (cleared) {
      for (const body of createVehicleBodies(level.vehicle)) {
        body.scale.setScalar(0.8);
        group.add(body);
        vehicles.push(body);
      }
    }

    // 次に遊べる島は明滅して誘う(3.3-(2))
    let highlight: THREE.Mesh | undefined;
    if (i === nextIndex) {
      highlight = new THREE.Mesh(
        new THREE.RingGeometry(ISLAND_R * 1.18, ISLAND_R * 1.42, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      highlight.rotation.x = -Math.PI / 2;
      highlight.position.y = -0.2;
      group.add(highlight);
    }

    // 当たり判定(見えない円盤。見た目より大きめ、5.2)
    const hit = new THREE.Mesh(
      new THREE.CircleGeometry(ISLAND_R * 1.3, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.rotation.x = -Math.PI / 2;
    hit.position.y = 0.2;
    hit.userData['toolIndex'] = i;
    group.add(hit);
    hitObjects.push(hit);

    islands.push({ index: i, level, group, cleared, highlight, vehicles, vehicleKind: level.vehicle });
  });

  // --- 全 10 面クリア後の祝祭(Q2 / 5.5) ---
  const confetti = createConfetti(120);
  stage.root.add(confetti.group);
  let fireworkTimer = 0.8;

  // --- カメラ ---
  const full = wholeBox();
  if (opts.from !== undefined) {
    // 島から出てきた: その島から全体へズームアウト(7.4: 0.8s)
    stage.fit(islandBox(opts.from));
    stage.animateFit(full, CAMERA_SECONDS);
  } else {
    stage.fit(full);
  }

  // --- 入力 ---
  let entering = -1;
  let enterTarget = 0;

  function enter(index: number): void {
    if (entering >= 0) return;
    const level = levels[index];
    if (!level) return;
    entering = CAMERA_SECONDS;
    enterTarget = index;
    playEnterIsland();
    stage.animateFit(islandBox(index), CAMERA_SECONDS);
  }

  const input = attachTouchInput(
    stage.renderer.domElement,
    stage.camera,
    { objects: hitObjects },
    {
      onPressStart() {
        /* 島は押し込みアニメを持たない */
      },
      onPressEnd() {
        /* noop */
      },
      onTap: enter,
      onFirstInput() {
        resumeAudio();
        startBgm('map');
      },
      onPinchIn() {
        // 地図画面ではピンチインで «次に遊べる島» に寄る(5.1、任意)
        const target = nextIndex >= 0 ? nextIndex : 0;
        stage.animateFit(islandBox(target), CAMERA_SECONDS);
      },
      onPinchOut() {
        stage.animateFit(full, CAMERA_SECONDS);
      },
      locked: () => entering >= 0,
    },
  );

  const tmp = new THREE.Vector3();

  stage.onFrame((dt, t) => {
    // 海のゆらぎ
    causticTex.offset.x = (causticTex.offset.x + dt * 0.02) % 1;
    causticTex.offset.y = (causticTex.offset.y + dt * 0.012) % 1;
    stage.requestIdleRender();

    // 乗り物が島を周回する(5.5)
    for (const isle of islands) {
      if (isle.vehicles.length === 0) continue;
      const speed = 0.7;
      isle.vehicles.forEach((v, k) => {
        const a = t * speed - k * 0.32 + isle.index;
        const r = ISLAND_R * 0.6;
        v.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
        v.rotation.y = -a + Math.PI / 2;
      });
      stage.requestRender();
    }

    // 次に遊べる島の明滅(1.5 秒周期、7.4)
    for (const isle of islands) {
      if (!isle.highlight) continue;
      const s = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
      (isle.highlight.material as THREE.MeshBasicMaterial).opacity = 0.35 + s * 0.6;
      isle.group.position.y = s * 0.06;
      stage.requestIdleRender();
    }

    // 全島クリアなら花火(Q2)
    if (allCleared) {
      fireworkTimer -= dt;
      if (fireworkTimer <= 0) {
        fireworkTimer = 1.6 + Math.random() * 1.2;
        const isle = islands[Math.floor(Math.random() * islands.length)];
        if (isle) {
          tmp.set(isle.group.position.x, 2.2, isle.group.position.z);
          confetti.burst(tmp);
          playFirework();
        }
      }
      confetti.tick(dt);
      stage.requestRender();
    }

    // 島に入るカメラ移動の完了待ち(7.4)
    if (entering >= 0) {
      entering -= dt;
      stage.requestRender();
      if (entering <= 0) {
        const level = levels[enterTarget];
        entering = -1;
        if (level) opts.onEnter(level, enterTarget);
      }
    }
  });

  stage.start();

  return {
    debug: {
      islands() {
        return islands.map((isle) => ({
          index: isle.index,
          cleared: isle.cleared,
          next: isle.index === nextIndex,
          x: isle.group.position.x,
          y: 0.2,
          z: isle.group.position.z,
        }));
      },
      project(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(stage.camera);
        const rect = stage.renderer.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
        };
      },
    },
    dispose() {
      input.dispose();
      stage.dispose();
    },
  };
}
