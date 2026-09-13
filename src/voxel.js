import * as THREE from 'three';
import { BASE_Y } from './levels.js';
import { tween, after, ease } from './tween.js';
import { sfx } from './audio.js';

// ブロック（ボクセル）管理。凍った(static)状態で空中に浮き、触られると目覚めて落ちる。
// N=ふつう I=てつ G=ガラス C=くも
export function createBlocks({ scene, phys, fx, onShake }) {
  const { CANNON, world } = phys;
  const group = new THREE.Group();
  scene.add(group);

  const cubeGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const shardGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
  const cloudGeo = (() => {
    const g = new THREE.Group();
    const s1 = new THREE.SphereGeometry(0.58, 14, 10);
    const s2 = new THREE.SphereGeometry(0.42, 12, 8);
    return { s1, s2, g };
  })();

  const mats = {
    N: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.0 }),
    I: new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.28, metalness: 0.85 }),
    G: new THREE.MeshPhysicalMaterial({ color: 0xd8f6ff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.45, transmission: 0.0 }),
    C: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fb8ff, emissiveIntensity: 0.35, roughness: 1 }),
  };
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });
  const edgeGeo = new THREE.EdgesGeometry(cubeGeo);

  let blocks = [];        // 生存ブロック（frozen / falling）
  let byKey = new Map();  // 凍ったブロックの位置索引
  let shards = [];
  let level = null;
  let hue = 0.6;
  let time = 0;
  let killY = -6;

  const key = (x, y, z) => `${x},${y},${z}`;
  const normalColor = (h) => new THREE.Color().setHSL(h, 0.8, 0.5);

  function makeMesh(t) {
    if (t === 'C') {
      const g = new THREE.Group();
      const a = new THREE.Mesh(cloudGeo.s1, mats.C); g.add(a);
      const b = new THREE.Mesh(cloudGeo.s2, mats.C); b.position.set(0.38, 0.12, 0.2); g.add(b);
      const c = new THREE.Mesh(cloudGeo.s2, mats.C); c.position.set(-0.36, 0.05, -0.15); g.add(c);
      return g;
    }
    const m = new THREE.Mesh(cubeGeo, mats[t]);
    if (t !== 'G') m.add(new THREE.LineSegments(edgeGeo, edgeMat));
    return m;
  }

  function addBody(pos, t, kind, ref, half = 0.5) {
    const body = new CANNON.Body({
      mass: 0, type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      material: t === 'I' ? phys.mat.iron : t === 'C' ? phys.mat.cloud : phys.mat.def,
    });
    body.userData = { kind, ref };
    world.addBody(body);
    return body;
  }

  function spawnBlock(def, visible = true) {
    const pos = new THREE.Vector3(def.x, def.y + BASE_Y, def.z);
    const mesh = makeMesh(def.t);
    mesh.position.copy(pos);
    mesh.visible = visible;
    group.add(mesh);
    const b = { ...def, pos, mesh, body: null, state: 'frozen', age: 0, key: key(def.x, def.y, def.z) };
    b.body = addBody(pos, def.t, 'block', b);
    blocks.push(b);
    byKey.set(b.key, b);
    return b;
  }

  function removeBlock(b) {
    if (b.state === 'gone') return;
    b.state = 'gone';
    world.removeBody(b.body);
    group.remove(b.mesh);
    byKey.delete(b.key);
    const i = blocks.indexOf(b); if (i >= 0) blocks.splice(i, 1);
  }

  function spawnShard(b, dir, n) {
    if (shards.length > 160) { const s = shards.shift(); world.removeBody(s.body); group.remove(s.mesh); }
    const mat = b.t === 'C' ? mats.C : mats[b.t];
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
      const mesh = new THREE.Mesh(shardGeo, mat);
      const p = b.mesh.position.clone().add(off);
      mesh.position.copy(p);
      group.add(mesh);
      const body = new CANNON.Body({ mass: 0.25, shape: new CANNON.Box(new CANNON.Vec3(0.23, 0.23, 0.23)), position: new CANNON.Vec3(p.x, p.y, p.z) });
      body.userData = { kind: 'shard' };
      body.velocity.set(dir.x * 3 + off.x * 8 + (Math.random() - 0.5) * 3, dir.y * 3 + 2 + Math.random() * 3, dir.z * 3 + off.z * 8);
      body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      world.addBody(body);
      shards.push({ mesh, body, age: 0 });
    }
  }

  const colorOf = (t) => t === 'N' ? normalColor(hue) : t === 'I' ? 0xb8c2d6 : t === 'G' ? 0xd8f6ff : 0xffffff;

  function shatter(b, dir = new THREE.Vector3(0, 0, -1)) {
    if (b.state === 'gone') return;
    const p = b.mesh.position.clone();
    fx.dust(p, colorOf(b.t), b.t === 'G' ? 18 : 12);
    if (b.t === 'G') sfx.glass(); else if (b.t === 'I') { sfx.thud(); sfx.shatter(0.5); } else sfx.shatter();
    spawnShard(b, dir, b.t === 'I' ? 5 : 4);
    removeBlock(b);
    wakeAbove(b, 0.06);
  }

  function wake(b, vel = new THREE.Vector3(0, 0, 0)) {
    if (b.state !== 'frozen') return;
    b.state = 'falling';
    byKey.delete(b.key);
    phys.makeDynamic(b.body, b.t === 'I' ? 3 : 1);
    b.body.velocity.set(vel.x, vel.y, vel.z);
    b.body.angularVelocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    sfx.wake();
    wakeAbove(b, 0.09);
  }

  // 「上に乗っていたもの」は支えを失って落ちる。段ごとに少し遅らせて重力のダンスを見せる。
  function wakeAbove(b, delay) {
    const up = byKey.get(key(b.x, b.y + 1, b.z));
    if (up && up.state === 'frozen') after(delay, () => { if (up.t === 'G') shatter(up); else wake(up); });
  }

  // くもが消える → つながっていた塊が丸ごと落ちる（BFS 順に遅延）
  function pop(c) {
    if (c.state === 'gone') return;
    const p = c.mesh.position.clone();
    fx.sparkle(p, 0xffffff, 24);
    sfx.pop();
    removeBlock(c);
    const seen = new Set([c.key]);
    const q = [[c.x, c.y, c.z, 0]];
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    while (q.length) {
      const [x, y, z, d] = q.shift();
      for (const [dx, dy, dz] of dirs) {
        const k = key(x + dx, y + dy, z + dz);
        if (seen.has(k)) continue;
        const nb = byKey.get(k);
        if (!nb || nb.state !== 'frozen') continue;
        seen.add(k);
        q.push([nb.x, nb.y, nb.z, d + 1]);
        after(0.05 + d * 0.06, () => { if (nb.state === 'frozen') { if (nb.t === 'C') pop(nb); else wake(nb, new THREE.Vector3((Math.random() - 0.5), -1, (Math.random() - 0.5))); } });
      }
    }
  }

  function explode(center) {
    fx.explode(center);
    sfx.boom();
    onShake(0.5);
    const R = 2.4;
    const list = blocks.slice();
    for (const b of list) {
      if (b.state === 'gone') continue;
      const d = b.mesh.position.distanceTo(center);
      if (d > R) continue;
      const dir = b.mesh.position.clone().sub(center).normalize();
      const delay = d * 0.03;
      after(delay, () => {
        if (b.state === 'gone') return;
        if (b.t === 'C') pop(b);
        else if (b.t === 'I') { if (b.state === 'frozen') wake(b, dir.multiplyScalar(9)); else b.body.velocity.vadd(new CANNON.Vec3(dir.x * 9, dir.y * 9, dir.z * 9), b.body.velocity); }
        else shatter(b, dir);
      });
    }
  }

  // ボールが凍った/落下中ブロックに当たった。戻り値: 'consumed' ならボールは消える
  function hitByBall(b, ball, contactPoint) {
    if (b.state === 'gone') return 'none';
    const dir = ball.body.velocity.length() > 0.01 ? new THREE.Vector3().copy(ball.body.velocity).normalize() : new THREE.Vector3(0, 0, -1);
    if (ball.type === 'B') { explode(new THREE.Vector3().copy(ball.body.position)); return 'consumed'; }
    if (b.t === 'C') { pop(b); return 'slow'; }
    if (b.t === 'G') { shatter(b, dir); return 'slow'; }
    if (b.t === 'N') { shatter(b, dir); return ball.type === 'I' ? 'none' : 'slow'; }
    // I
    if (ball.type === 'I') { shatter(b, dir); onShake(0.25); return 'slow'; }
    fx.sparkle(new THREE.Vector3().copy(contactPoint || ball.body.position), 0xfff3b0, 8);
    sfx.ting();
    onShake(0.12);
    return 'bounce';
  }

  // 落下物が凍ったブロックに触れた
  function debrisContact(b, other) {
    if (b.state !== 'frozen') return;
    const speed = other.velocity.length();
    if (speed < 1.2) return;
    const v = new THREE.Vector3().copy(other.velocity).multiplyScalar(0.35);
    if (b.t === 'G') shatter(b, v.clone().normalize());
    else if (b.t === 'C') pop(b);
    else if (b.t === 'N') wake(b, v);
    else if (other.mass >= 1 && speed > 5) wake(b, v.multiplyScalar(0.5));
  }

  function bbox() {
    const box = new THREE.Box3();
    for (const b of blocks) box.expandByPoint(b.pos);
    box.min.subScalar(0.5); box.max.addScalar(0.5);
    return box;
  }

  function clear() {
    for (const b of blocks.slice()) removeBlock(b);
    for (const s of shards) { world.removeBody(s.body); group.remove(s.mesh); }
    shards = []; blocks = []; byKey = new Map();
  }

  function load(lv) {
    clear();
    level = lv; hue = lv.hue; time = 0;
    mats.N.color.copy(normalColor(hue));
    for (const d of lv.blocks) spawnBlock(d, false);
    const box = bbox();
    killY = box.min.y - 7;
    return box;
  }

  // 上から降りてくる（レベル開始）
  function enterAnim(done) {
    const list = blocks.slice();
    let maxDelay = 0;
    for (const b of list) {
      const delay = 0.1 + (b.y * 0.05) + Math.random() * 0.15;
      maxDelay = Math.max(maxDelay, delay);
      b.mesh.visible = true;
      b.mesh.position.y = b.pos.y + 12;
      b.mesh.scale.setScalar(0.01);
      tween({ dur: 0.9, delay, ease: ease.outCubic, update: (k) => {
        b.mesh.position.y = b.pos.y + 12 * (1 - k);
        b.mesh.scale.setScalar(0.01 + 0.99 * Math.min(1, k * 1.5));
      }, done: () => { b.mesh.position.copy(b.pos); b.mesh.scale.setScalar(1); } });
    }
    sfx.descend();
    after(maxDelay + 0.95, done);
  }

  // 巻き戻し: 消えたブロックが下から浮き上がって元の形に戻る
  function rewindAnim(done) {
    sfx.rewind();
    for (const s of shards) { world.removeBody(s.body); group.remove(s.mesh); }
    shards = [];
    // 落下中のものは、その場から元の位置へ戻す
    const falling = blocks.filter((b) => b.state === 'falling');
    for (const b of falling) {
      world.removeBody(b.body);
      const from = b.mesh.position.clone(), fq = b.mesh.quaternion.clone();
      b.body = addBody(b.pos, b.t, 'block', b);
      b.state = 'frozen'; byKey.set(b.key, b);
      tween({ dur: 1.1, delay: 0.1, ease: ease.inOutCubic, update: (k) => {
        b.mesh.position.lerpVectors(from, b.pos, k);
        b.mesh.quaternion.slerpQuaternions(fq, new THREE.Quaternion(), k);
      } });
    }
    // 消えたブロックを再生成して下から浮上
    const have = new Set(blocks.map((b) => b.key));
    let maxDelay = 0;
    for (const d of level.blocks) {
      if (have.has(key(d.x, d.y, d.z))) continue;
      const b = spawnBlock(d, true);
      const delay = 0.15 + Math.random() * 0.4 + d.y * 0.04;
      maxDelay = Math.max(maxDelay, delay);
      b.mesh.position.y = b.pos.y - 6;
      b.mesh.scale.setScalar(0.01);
      tween({ dur: 1.0, delay, ease: ease.outBack, update: (k) => {
        b.mesh.position.y = b.pos.y - 6 * (1 - k);
        b.mesh.scale.setScalar(Math.min(1, 0.01 + k * 1.2));
      }, done: () => { b.mesh.position.copy(b.pos); b.mesh.scale.setScalar(1); } });
      fx.sparkle(b.pos, colorOf(b.t), 3);
    }
    after(Math.max(1.3, maxDelay + 1.05), done);
  }

  function update(dt) {
    time += dt;
    for (const b of blocks.slice()) {
      if (b.state === 'falling') {
        b.age += dt;
        b.mesh.position.copy(b.body.position);
        b.mesh.quaternion.copy(b.body.quaternion);
        // 落ちながら隣をこすった凍ったブロックは目覚める（重力のダンスの連鎖）
        const sp = b.body.velocity.length();
        if (sp > 2.5) {
          const rx = Math.round(b.body.position.x), ry = Math.round(b.body.position.y - BASE_Y), rz = Math.round(b.body.position.z);
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
            const nb = byKey.get(key(rx + dx, ry + dy, rz + dz));
            if (nb && nb.state === 'frozen' && nb.mesh.position.distanceTo(b.mesh.position) < 1.08) debrisContact(nb, b.body);
          }
        }
        // 凍ったブロックの上に乗って止まったら、下のブロックが支えを失って落ちる
        b.rest = sp < 0.6 && b.age > 0.3 ? (b.rest || 0) + dt : 0;
        if (b.rest > 0.35) {
          b.rest = 0;
          const rx = Math.round(b.body.position.x), ry = Math.round(b.body.position.y - BASE_Y), rz = Math.round(b.body.position.z);
          let found = false;
          for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nb = byKey.get(key(rx + dx, ry - 1, rz + dz));
            if (nb && nb.state === 'frozen') { found = true; if (nb.t === 'C') pop(nb); else if (nb.t === 'G') shatter(nb); else wake(nb); }
          }
          if (!found) b.body.velocity.y -= 2; // 何にも乗っていないのに止まっている → 軽く押す
        }
        if (b.body.position.y < killY || b.age > 9) {
          fx.sparkle(b.mesh.position, colorOf(b.t), 10);
          sfx.vanish();
          removeBlock(b);
        }
      } else if (b.t === 'C' && b.mesh.scale.x > 0.99) {
        b.mesh.position.y = b.pos.y + Math.sin(time * 1.7 + b.x * 1.3 + b.z) * 0.08;
        b.mesh.rotation.y = Math.sin(time * 0.6 + b.x) * 0.1;
      }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.age += dt;
      s.mesh.position.copy(s.body.position);
      s.mesh.quaternion.copy(s.body.quaternion);
      if (s.body.position.y < killY || s.age > 5) {
        if (s.body.position.y < killY) fx.sparkle(s.mesh.position, 0xffffff, 2);
        world.removeBody(s.body); group.remove(s.mesh); shards.splice(i, 1);
      }
    }
  }

  return {
    load, enterAnim, rewindAnim, update, clear, hitByBall, debrisContact, bbox,
    count: () => blocks.length,
    frozenCount: () => blocks.filter((b) => b.state === 'frozen').length,
    movingCount: () => blocks.filter((b) => b.state === 'falling').length + shards.length,
    center: () => bbox().getCenter(new THREE.Vector3()),
    killY: () => killY,
    normalColor: () => normalColor(hue),
  };
}
