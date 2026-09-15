import * as THREE from 'three';
import { levels } from '../levels';
import { PALETTES, type Level, type Palette } from '../levels/schema';
import { loadProgress } from '../core/progress';
import { attachTouchInput } from '../input/touch';
import { resumeAudio } from '../audio/context';
import { startBgm } from '../audio/bgm';
import { playEnterIsland, playFirework } from '../audio/sfx';
import { createStage, CAMERA_SECONDS, type Stage } from '../render/scene';
import {
  expandFrame,
  frameFromPoints,
  ISO_EX,
  MAP_MARGIN,
  type Frame,
} from '../render/fit';
import { createPropField, createGoalFlag, makeRng, type PropPlacement } from '../render/props';
import { createVehicleBodies } from '../render/vehicle';
import { createConfetti } from '../render/fx';
import { causticsTexture } from '../render/textures';

/**
 * 地図画面(5.5-1 / 3.2)。海に浮かぶ 10 個の島。
 * 文字は一切出さない。島の並びと小道だけで «順番» を示す(3.2)。
 *
 * この画面は一度作ったら捨てない。プレイ画面へ入るときは «隠す» だけにして、
 * 戻ってきたら進行状況の差分(旗・走る乗り物・次の島)だけを反映する。
 * 10 島ぶんの島・装飾・水面を作り直すと、戻るたびに一瞬固まってしまうため。
 */

/** 島 1 つの半径(ワールド) */
const ISLAND_R = 1.5;
/** 当たり判定は見た目の 1.4 倍(5.2) */
const HIT_SCALE = 1.4;
/** 明滅リングまで含めた島の外径。カメラの枠はこれで測る(リングが画面外に切れないように) */
const ISLAND_OUTER = ISLAND_R * 1.45;

/**
 * 画面上の «真下» に当たる地面の方向。
 * アイソメでは 1 進むと画面が 1/√3 だけ下がるので、画面 1 ぶんは √3 進む。
 */
const GROUND_DOWN = new THREE.Vector3(1, 0, 1).normalize();
const DOWN_PER_SCREEN = Math.sqrt(3);

/** 画面座標(横 u / 縦 v、下が正)をワールド座標に直す */
function worldOf(u: number, v: number): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(ISO_EX, u)
    .addScaledVector(GROUND_DOWN, v * DOWN_PER_SCREEN);
}

/**
 * 島の並び(5.5 / 3.3-(4))。画面の «向き» ごとに 2 つ持つ。
 *
 * 横画面は 5 列 × 2 段、縦画面は 3 列 × 4 段の蛇行。
 * どちらも画面座標で組み立てるので、島は画面いっぱいに大きく映る。
 * 縦画面で島が小さくなり «押したくならない» のを避けるための切り替え(5.2)。
 */
const LANDSCAPE_LAYOUT: readonly { u: number; v: number }[] = [
  { u: -9.0, v: 0 },
  { u: -4.5, v: 0 },
  { u: 0, v: 0 },
  { u: 4.5, v: 0 },
  { u: 9.0, v: 0 },
  { u: 9.0, v: 5.6 },
  { u: 4.5, v: 5.6 },
  { u: 0, v: 5.6 },
  { u: -4.5, v: 5.6 },
  { u: -9.0, v: 5.6 },
];

const PORTRAIT_LAYOUT: readonly { u: number; v: number }[] = [
  { u: -4.3, v: 0 },
  { u: 0, v: 0 },
  { u: 4.3, v: 0 },
  { u: 4.3, v: 7.0 },
  { u: 0, v: 7.0 },
  { u: -4.3, v: 7.0 },
  { u: -4.3, v: 14.0 },
  { u: 0, v: 14.0 },
  { u: 4.3, v: 14.0 },
  { u: 4.3, v: 21.0 },
];

/** 並べ替えのトゥイーン時間 */
const RELAYOUT_SECONDS = 0.7;
/** 小道の点の最大数 */
const MAX_DOTS = 220;

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

export interface MapDebug {
  islands(): { index: number; cleared: boolean; next: boolean; x: number; y: number; z: number }[];
  project(x: number, y: number, z: number): { x: number; y: number };
  /** 島の «見た目の» 直径(CSS px)。iPhone 縦での大きさを E2E で測るため(5.2) */
  islandDiameterPx(): number;
  portrait(): boolean;
}

export interface MapScreen {
  readonly debug: MapDebug;
  /** 地図を表示する。from を渡すとその島からズームアウトして現れる */
  show(from?: number): void;
  /** 地図を隠す(作り直さずに取っておく) */
  hide(): void;
  dispose(): void;
}

export interface MapOptions {
  /** 島をタップして中に入るとき */
  onEnter(level: Level, index: number): void;
  /** 島をタップした瞬間(カメラが寄り始めるところ)。遷移時間の実測に使う */
  onEnterStart?(index: number): void;
}

export function createMapScreen(container: HTMLElement, opts: MapOptions): MapScreen {
  const stage: Stage = createStage(container);
  stage.setPalette(SEA_PALETTE);
  stage.setMargin(MAP_MARGIN); // 地図は余白を詰めて島を大きく見せる

  let portrait = (container.clientHeight || window.innerHeight) > (container.clientWidth || window.innerWidth);
  const layoutOf = (): readonly { u: number; v: number }[] => (portrait ? PORTRAIT_LAYOUT : LANDSCAPE_LAYOUT);

  // --- 海 ---
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
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
  causticTex.repeat.set(100, 100);
  const caustics = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshBasicMaterial({ map: causticTex, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(0, -0.33, 0);
  stage.root.add(caustics);

  // --- 島を結ぶ小道(点線、3.2)。同じ形なので 1 つの InstancedMesh にまとめる(R4) ---
  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xf0e0b4 }),
    MAX_DOTS,
  );
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.frustumCulled = false;
  stage.root.add(dots);

  // --- 島 ---
  interface IslandView {
    readonly index: number;
    readonly level: Level;
    readonly group: THREE.Group;
    readonly highlight: THREE.Mesh;
    readonly vehicles: THREE.Group[];
    cleared: boolean;
    flag?: THREE.Group | undefined;
    /** 並べ替えトゥイーン */
    readonly from: THREE.Vector3;
    readonly to: THREE.Vector3;
  }
  const islands: IslandView[] = [];
  const hitObjects: THREE.Object3D[] = [];

  levels.forEach((level, i) => {
    const palette = PALETTES[level.theme];
    const group = new THREE.Group();
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
    group.add(createPropField(placements, palette).group);

    // 次に遊べる島だけ明滅して誘う(3.3-(2))。全島ぶん作っておき、表示だけ切り替える
    const highlight = new THREE.Mesh(
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
    highlight.visible = false;
    group.add(highlight);

    // 当たり判定(見えない円盤。見た目の 1.4 倍、5.2)
    const hit = new THREE.Mesh(
      new THREE.CircleGeometry(ISLAND_R * HIT_SCALE, 20),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.rotation.x = -Math.PI / 2;
    hit.position.y = 0.2;
    hit.userData['toolIndex'] = i;
    group.add(hit);
    hitObjects.push(hit);

    islands.push({
      index: i,
      level,
      group,
      highlight,
      vehicles: [],
      cleared: false,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
    });
  });

  // --- 全 10 面クリア後の祝祭(Q2 / 5.5) ---
  const confetti = createConfetti(120);
  stage.root.add(confetti.group);
  let fireworkTimer = 0.8;
  let allCleared = false;
  let nextIndex = 0;

  // --- 配置(画面の向きで切り替える) ---
  let relayoutT = -1;

  function placeDots(): void {
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < islands.length - 1; i++) {
      const a = islands[i]!.group.position;
      const b = islands[i + 1]!.group.position;
      const len = a.distanceTo(b);
      const steps = Math.max(2, Math.round(len / 0.75));
      for (let k = 1; k < steps && n < MAX_DOTS; k++) {
        const f = k / steps;
        const x = a.x + (b.x - a.x) * f;
        const z = a.z + (b.z - a.z) * f;
        // 島の内側には置かない
        if (Math.hypot(x - a.x, z - a.z) < ISLAND_R * 1.15) continue;
        if (Math.hypot(x - b.x, z - b.z) < ISLAND_R * 1.15) continue;
        m.makeTranslation(x, -0.18, z);
        dots.setMatrixAt(n++, m);
      }
    }
    // 余ったインスタンスは潰して見えなくする
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = n; i < MAX_DOTS; i++) dots.setMatrixAt(i, hide);
    dots.instanceMatrix.needsUpdate = true;
    dots.count = MAX_DOTS;
  }

  function targetsForLayout(): THREE.Vector3[] {
    const layout = layoutOf();
    return islands.map((_, i) => {
      const at = layout[i] ?? { u: 0, v: 0 };
      return worldOf(at.u, at.v);
    });
  }

  /** 島 1 つを囲む枠 */
  function islandFrame(index: number): Frame {
    const c = islands[index]?.group.position ?? new THREE.Vector3();
    return expandFrame(framePointsOf(c), 1.35);
  }

  /** 島 1 つを囲む点(枠の材料)。明滅リングと旗まで入れる */
  function cornersOf(c: THREE.Vector3): THREE.Vector3[] {
    return [
      c.clone().addScaledVector(ISO_EX, ISLAND_OUTER),
      c.clone().addScaledVector(ISO_EX, -ISLAND_OUTER),
      c.clone().add(new THREE.Vector3(0, 1.7, 0)), // 旗の高さぶん上
      c.clone().addScaledVector(GROUND_DOWN, ISLAND_OUTER * DOWN_PER_SCREEN * 0.7),
    ];
  }

  function framePointsOf(c: THREE.Vector3): Frame {
    return frameFromPoints(cornersOf(c));
  }

  /** 10 島すべてが入る枠 */
  function wholeFrame(): Frame {
    const pts: THREE.Vector3[] = [];
    for (const isle of islands) pts.push(...cornersOf(isle.group.position));
    return frameFromPoints(pts);
  }

  function applyLayout(animate: boolean): void {
    const targets = targetsForLayout();
    islands.forEach((isle, i) => {
      isle.from.copy(isle.group.position);
      isle.to.copy(targets[i]!);
    });
    if (animate) {
      relayoutT = 0;
    } else {
      islands.forEach((isle) => isle.group.position.copy(isle.to));
      placeDots();
      stage.fit(wholeFrame());
    }
    stage.requestRender();
  }

  applyLayout(false);

  /** 進行状況の差分だけを反映する(作り直さない) */
  function refreshProgress(): void {
    const cleared = new Set(loadProgress().cleared);
    nextIndex = levels.findIndex((l) => !cleared.has(l.id));
    allCleared = nextIndex < 0;
    for (const isle of islands) {
      const done = cleared.has(isle.level.id);
      isle.highlight.visible = isle.index === nextIndex;
      if (!isle.highlight.visible) isle.group.position.y = 0;
      if (done && !isle.cleared) {
        isle.cleared = true;
        const palette = PALETTES[isle.level.theme];
        // クリア済みの島には旗が立つ(3.2:「クリア!」テキストの置き換え)
        const flag = createGoalFlag(palette);
        flag.position.set(0, 0.15, 0);
        flag.scale.setScalar(1.3);
        isle.group.add(flag);
        isle.flag = flag;
        // クリア済みの島では乗り物が周回している(5.5)
        for (const body of createVehicleBodies(isle.level.vehicle)) {
          body.scale.setScalar(0.8);
          isle.group.add(body);
          isle.vehicles.push(body);
        }
      }
    }
    stage.requestRender();
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
    opts.onEnterStart?.(index);
    playEnterIsland();
    stage.animateFit(islandFrame(index), CAMERA_SECONDS);
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
        stage.animateFit(islandFrame(nextIndex >= 0 ? nextIndex : 0), CAMERA_SECONDS);
      },
      onPinchOut() {
        stage.animateFit(wholeFrame(), CAMERA_SECONDS);
      },
      locked: () => entering >= 0,
    },
  );

  const tmp = new THREE.Vector3();
  let visible = false;

  stage.onFrame((dt, t) => {
    // 海のゆらぎ。水面は «ゆっくり動くもの» なので 30fps に間引く(R4 / R5)
    causticTex.offset.x = (causticTex.offset.x + dt * 0.02) % 1;
    causticTex.offset.y = (causticTex.offset.y + dt * 0.012) % 1;
    stage.requestSlowRender();

    // 画面の向きが変わったら島を並べ替える(トゥイーン)
    if (relayoutT >= 0) {
      relayoutT = Math.min(RELAYOUT_SECONDS, relayoutT + dt);
      const p = relayoutT / RELAYOUT_SECONDS;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      for (const isle of islands) isle.group.position.lerpVectors(isle.from, isle.to, e);
      placeDots();
      stage.fit(wholeFrame());
      if (relayoutT >= RELAYOUT_SECONDS) relayoutT = -1;
      stage.requestRender();
    }

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
      if (!isle.highlight.visible) continue;
      const s = 0.5 + 0.5 * Math.sin((t / 1.5) * Math.PI * 2);
      (isle.highlight.material as THREE.MeshBasicMaterial).opacity = 0.35 + s * 0.6;
      if (relayoutT < 0) isle.group.position.y = s * 0.06;
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

  // 画面の向きが変わったら配置を組み直す(5.3 のデバウンス済みの resize から呼ばれる)
  const onResize = (): void => {
    if (!visible) return;
    const nowPortrait =
      (container.clientHeight || window.innerHeight) > (container.clientWidth || window.innerWidth);
    if (nowPortrait !== portrait) {
      portrait = nowPortrait;
      applyLayout(true);
    } else {
      stage.fit(wholeFrame());
    }
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

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
      islandDiameterPx() {
        const c = islands[0]?.group.position ?? new THREE.Vector3();
        const rect = stage.renderer.domElement.getBoundingClientRect();
        const toPx = (p: THREE.Vector3): number =>
          ((p.clone().project(stage.camera).x + 1) / 2) * rect.width;
        // 島は円盤なので、画面上の «横» の直径がそのまま見た目の大きさになる
        const a = toPx(c.clone().addScaledVector(ISO_EX, ISLAND_R));
        const b = toPx(c.clone().addScaledVector(ISO_EX, -ISLAND_R));
        return Math.abs(a - b);
      },
      portrait: () => portrait,
    },
    show(from) {
      visible = true;
      portrait = (container.clientHeight || window.innerHeight) > (container.clientWidth || window.innerWidth);
      stage.setVisible(true);
      stage.setPalette(SEA_PALETTE);
      stage.setMargin(MAP_MARGIN);
      refreshProgress();
      applyLayout(false);
      if (from !== undefined) {
        // 島から出てきた: その島から全体へズームアウト(7.4: 0.8s)
        stage.fit(islandFrame(from));
        stage.animateFit(wholeFrame(), CAMERA_SECONDS);
      }
      entering = -1;
      stage.start();
    },
    hide() {
      visible = false;
      stage.stop();
      stage.setVisible(false);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      input.dispose();
      stage.dispose();
    },
  };
}
