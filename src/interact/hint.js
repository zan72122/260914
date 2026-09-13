import * as THREE from 'three';
import { nextTarget, state } from '../state.js';

// 手詰まり検知と「次にさわるべき物」の脈動。
// 常に軽く脈動し、15秒触られなければ強く脈動 + 光の粒 + ハナがそちらを見る。
const FACE_OF = { lid: null, can: 'A', pot: 'A', bud: 'A', flower: 'A', string: 'B', cocoon: 'C' };
const IDS_OF = { lid: ['lid'], can: ['can'], string: ['string'], bud: ['pot'], cocoon: ['cocoon'] };

export function createHint({ scene, particles, monster, camera, nudgeTo, currentFace }) {
  let idle = 0;
  let lastTarget = undefined;
  let nodes = [];
  const baseOf = new WeakMap(); // 脈動前の基準サイズ(一度だけ記録)
  let recollect = 0;
  let moteTimer = 0;
  let rattleTimer = 0;
  let nudgeTimer = 0;
  const v = new THREE.Vector3();

  function collect(target) {
    nodes = [];
    if (!target) return;
    const ids = IDS_OF[target] || [target];
    scene.traverse((o) => {
      const it = o.userData.interactable;
      if (!it || !ids.includes(it.id) || !it.getPulseNode) return;
      // 同じ interactable を複数メッシュが共有するので重複を除く
      if (nodes.some((n) => n.inter === it)) return;
      // 蕾: 咲いていないものだけ
      if (target === 'bud' && it.pot && (!it.pot.budded || it.pot.bloomed)) return;
      const node = it.getPulseNode();
      if (!node) return;
      if (!baseOf.has(node)) baseOf.set(node, node.scale.clone());
      nodes.push({ inter: it, node, base: baseOf.get(node) });
    });
  }

  function activity() {
    idle = 0;
  }

  function update(dt, t) {
    idle += dt;
    const target = nextTarget();
    recollect -= dt;
    if (target !== lastTarget || recollect <= 0) {
      // 対象は増減しうるので、ときどき集め直す
      for (const n of nodes) n.node.scale.copy(n.base);
      lastTarget = target;
      recollect = 0.5;
      collect(target);
    }
    const strong = idle > 15;
    const amp = strong ? 0.16 : 0.06;
    for (const n of nodes) {
      const k = 1 + Math.sin(t * 4) * amp;
      n.node.scale.copy(n.base).multiplyScalar(k);
    }
    // 閉じているときに5秒放置: ふたがカタカタ
    if (!state.opened) {
      rattleTimer += dt;
      if (idle > 5 && rattleTimer > 6) { rattleTimer = 0; monster.rattle(); }
    }
    if (strong && nodes.length) {
      moteTimer -= dt;
      if (moteTimer <= 0) {
        moteTimer = 0.25;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        const p = n.inter.worldAnchor ? n.inter.worldAnchor() : n.node.getWorldPosition(v.clone());
        particles.spawn({ kind: 'mote', pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2)), vel: new THREE.Vector3(0, 0.35, 0), life: 1.2, size: 0.09, drag: 1 });
        // ハナが目標を見る
        v.copy(p).project(camera);
        monster.setLook(THREE.MathUtils.clamp(v.x, -1, 1), THREE.MathUtils.clamp(v.y, -1, 1));
      }
      // 目標が別の面にあるなら箱をそちらへ少し揺らす
      const face = FACE_OF[target];
      nudgeTimer -= dt;
      if (face && face !== currentFace() && nudgeTimer <= 0) {
        nudgeTimer = 4;
        nudgeTo(face);
      }
    }
  }

  return { update, activity };
}
