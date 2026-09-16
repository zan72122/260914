// particles.js
// 使い回し（プール）付きの上限つきパーティクル。
// iPhone で 60fps を保つため、総数を必ず上限で切る。

const MAX = 420;

export class Particles {
  constructor(max = MAX) {
    this.max = max;
    this.list = [];
    this.pool = [];
  }

  clear() {
    while (this.list.length) this.pool.push(this.list.pop());
  }

  spawn(p) {
    if (this.list.length >= this.max) {
      // 一番古いものを再利用（見た目上いちばん影響が小さい）
      const old = this.list.shift();
      this.pool.push(old);
    }
    const o = this.pool.pop() || {};
    o.type = p.type;
    o.x = p.x; o.y = p.y;
    o.vx = p.vx || 0; o.vy = p.vy || 0;
    o.g = p.g || 0;
    o.drag = p.drag == null ? 0 : p.drag;
    o.r = p.r || 2;
    o.gr = p.gr || 0;          // 半径の成長速度
    o.life = p.life || 1;
    o.maxLife = o.life;
    o.rot = p.rot || 0;
    o.vr = p.vr || 0;
    o.hue = p.hue || 0;        // 種類ごとの解釈（色の指標）
    o.wob = p.wob || 0;        // 横ゆれ量
    o.seed = Math.random() * 6.28;
    o.alpha = p.alpha == null ? 1 : p.alpha;
    this.list.push(o);
    return o;
  }

  update(dt, t) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      o.life -= dt;
      if (o.life <= 0) {
        list.splice(i, 1);
        this.pool.push(o);
        continue;
      }
      o.vy += o.g * dt;
      if (o.drag) {
        const k = Math.max(0, 1 - o.drag * dt);
        o.vx *= k; o.vy *= k;
      }
      o.x += (o.vx + (o.wob ? Math.sin(t * 2.1 + o.seed) * o.wob : 0)) * dt;
      o.y += o.vy * dt;
      o.r += o.gr * dt;
      o.rot += o.vr * dt;
    }
  }

  count(type) {
    let n = 0;
    for (const o of this.list) if (o.type === type) n++;
    return n;
  }
}
