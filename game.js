/* シュポッ！ミルクライン — 一本指・文字なしの搾乳ごっこ
 * 4本のティートカップを乳頭へ「シュポッ」→ 透明ホースを牛乳が流れる → 合流
 * → 流量が弱まったカップから1本ずつ「シュッ」と自動離脱。
 * 外部アセットなし。描画は Canvas 2D、音は WebAudio で合成。
 */
(function () {
  'use strict';

  // ---------- utils ----------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rr = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const bounceOut = (t) => {
    t = clamp(t, 0, 1);
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = ri(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  function cubicPts(p0, p1, p2, p3, n) {
    const pts = [], cum = [0];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      pts.push({ x, y });
      if (i > 0) cum.push(cum[i - 1] + dist(pts[i - 1].x, pts[i - 1].y, x, y));
    }
    return { pts, cum, len: cum[n] };
  }
  function pointAt(path, frac) {
    const target = clamp(frac, 0, 1) * path.len;
    const { pts, cum } = path;
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= target) {
        const seg = cum[i] - cum[i - 1] || 1;
        const t = (target - cum[i - 1]) / seg;
        return { x: lerp(pts[i - 1].x, pts[i].x, t), y: lerp(pts[i - 1].y, pts[i].y, t) };
      }
    }
    return pts[pts.length - 1];
  }
  function tracePart(ctx, path, from, to) {
    // 経路の from..to (0..1) 区間をパスとして構築
    const a = clamp(from, 0, 1) * path.len, b = clamp(to, 0, 1) * path.len;
    if (b - a <= 0.5) return false;
    const { pts, cum } = path;
    const pa = pointAt(path, from);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] > a && cum[i] < b) ctx.lineTo(pts[i].x, pts[i].y);
    }
    const pb = pointAt(path, to);
    ctx.lineTo(pb.x, pb.y);
    return true;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- audio (synthesized) ----------
  const Audio = {
    ctx: null, master: null, flowGain: null, flowNode: null, unlocked: false,
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        // 流れの音（ループノイズ）
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 4; }
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
        this.flowGain = this.ctx.createGain(); this.flowGain.gain.value = 0;
        src.connect(bp).connect(this.flowGain).connect(this.master);
        src.start();
        this.flowNode = src;
      } catch (e) { /* 無音でも遊べる */ }
    },
    unlock() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      this.unlocked = true;
    },
    noise(dur, opts) {
      if (!this.ctx) return;
      const c = this.ctx, t0 = c.currentTime;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.Q.value = opts.q || 1;
      f.frequency.setValueAtTime(opts.f0 || 1500, t0);
      if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.3, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    },
    tone(f0, f1, dur, opts) {
      if (!this.ctx) return;
      const c = this.ctx, t0 = c.currentTime + (opts.delay || 0);
      const o = c.createOscillator(); o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = o;
      if (opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
      node.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    // 「シュポッ」: 短い吸い込み + 明るいポッ
    shupo() {
      this.noise(0.12, { f0: 600, f1: 2400, q: 1.2, vol: 0.35, attack: 0.02 });
      this.tone(260, 640, 0.13, { vol: 0.28, delay: 0.06, type: 'sine' });
      this.tone(900, 1300, 0.06, { vol: 0.08, delay: 0.1, type: 'triangle' });
    },
    // 「シュッ」: 空気が抜ける音 + 小さなポク
    shu() {
      this.noise(0.22, { f0: 3200, f1: 700, q: 0.8, vol: 0.32, attack: 0.005, type: 'bandpass' });
      this.tone(520, 300, 0.09, { vol: 0.14, delay: 0.05, type: 'triangle' });
    },
    grab() { this.tone(420, 520, 0.05, { vol: 0.08, type: 'triangle' }); },
    plop() { this.tone(240, 140, 0.12, { vol: 0.12, type: 'sine' }); },
    pump(strength) {
      this.tone(95, 60, 0.18, { vol: 0.16 * strength, type: 'sine' });
      this.noise(0.09, { f0: 1200, f1: 500, q: 0.7, vol: 0.05 * strength });
    },
    setFlow(level) {
      if (!this.flowGain || !this.ctx) return;
      const t = this.ctx.currentTime;
      this.flowGain.gain.cancelScheduledValues(t);
      this.flowGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.11, t, 0.15);
    },
    moo() {
      if (!this.ctx) return;
      const c = this.ctx, t0 = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, t0);
      o.frequency.linearRampToValueAtTime(175, t0 + 0.2);
      o.frequency.linearRampToValueAtTime(120, t0 + 0.75);
      const lfo = c.createOscillator(); lfo.frequency.value = 6;
      const lg = c.createGain(); lg.gain.value = 5;
      lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t0); f.frequency.linearRampToValueAtTime(900, t0 + 0.3); f.frequency.linearRampToValueAtTime(400, t0 + 0.8);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.08);
      g.gain.setValueAtTime(0.22, t0 + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
      o.connect(f).connect(g).connect(this.master);
      o.start(t0); lfo.start(t0); o.stop(t0 + 0.9); lfo.stop(t0 + 0.9);
    },
    chime() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => this.tone(n, n, 0.35, { vol: 0.12, delay: i * 0.11, type: 'triangle' }));
    },
    clink() { this.tone(1800, 1400, 0.12, { vol: 0.08, type: 'triangle' }); this.tone(2600, 2200, 0.08, { vol: 0.04, type: 'sine' }); },
    tick() { this.tone(700, 700, 0.03, { vol: 0.04, type: 'sine' }); },
  };

  // ---------- canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let L = null; // layout

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    L = computeLayout(W, H);
    if (cow) applyLayoutToWorld();
  }

  function computeLayout(W, H) {
    const portrait = H >= W;
    const L = { portrait, W, H };
    if (portrait) {
      const cw = clamp(W * 0.13, 40, 92);
      L.cup = { w: cw, h: cw * 1.55 };
      L.spacing = Math.max(cw * 1.35, W * 0.17);
      L.udder = { x: W / 2, top: H * 0.20, bottom: H * 0.385, w: L.spacing * 3 + cw * 2.4 };
      L.teatBaseY = H * 0.385 - cw * 0.3;
      L.teatLen = clamp(H * 0.075, 40, 80);
      L.teatW = cw * 0.42;
      L.teatCX = W / 2;
      L.rack = { y: H * 0.62, cx: W / 2 };
      L.claw = { x: W * 0.5, y: H * 0.865 };
      L.jar = { x: W * 0.84, w: clamp(W * 0.2, 60, 120), h: clamp(H * 0.115, 70, 130), top: H * 0.868 };
      L.head = { x: W * 0.17, y: H * 0.075, r: clamp(W * 0.15, 40, 90), dir: 'down' };
      L.floorY = H;
      L.lift = L.cup.h * 1.05;
    } else {
      const cw = clamp(Math.min(H * 0.10, W * 0.055), 36, 84);
      L.cup = { w: cw, h: cw * 1.45 };
      L.spacing = Math.max(cw * 1.3, W * 0.05);
      L.floorY = H * 0.86;
      const uw = L.spacing * 3 + cw * 2.0;
      const body = { x: W * 0.08, y: H * 0.06, w: Math.max(W * 0.48, uw * 1.7), h: H * 0.28 };
      L.body = body;
      L.udder = { x: body.x + body.w * 0.47, top: body.y + body.h - H * 0.04, bottom: H * 0.44, w: uw };
      L.teatBaseY = L.udder.bottom - cw * 0.3;
      L.teatLen = clamp(H * 0.10, 30, 80);
      L.teatW = cw * 0.42;
      L.teatCX = L.udder.x;
      L.rack = { y: L.floorY - L.cup.h - cw * 0.35, cx: L.udder.x };
      L.claw = { x: Math.max(L.rack.cx + 1.5 * L.spacing + cw * 3.0, body.x + body.w + cw * 1.7), y: L.rack.y + L.cup.h * 0.85 };
      const jh = clamp(H * 0.34, 90, 260);
      L.jar = { x: W * 0.885, w: jh * 0.55, h: jh, top: L.floorY - jh };
      L.head = { x: body.x - W * 0.005, y: body.y + body.h * 0.3, r: clamp(Math.min(H * 0.12, body.h * 0.42), 30, 110), dir: 'side' };
      L.lift = L.cup.h * 1.0;
    }
    L.grabR = Math.max(L.cup.w * 1.4, 56);
    L.magnetR = Math.max(L.cup.w * 2.2, 90);
    L.snapR = Math.max(L.cup.w * 0.7, 26);
    L.releaseR = Math.max(L.cup.w * 3.6, 150);
    return L;
  }

  // ---------- world ----------
  let cow = null;      // 現在の牛
  let nextCow = null;  // 交代中の次の牛
  const cups = [];
  let teats = [];
  let jar = { level: 0, slosh: 0, sloshV: 0, xOff: 0, bounce: 0 };
  let particles = [];
  let phase = 'idle';  // idle | milking | draining | celebrate | transition
  let phaseT = 0;
  let idleT = 0;
  let time = 0;
  let mainFill = 0, mainDrain = 0, mainFlow = 0, mainPhase = 0;
  let cowOffset = 0;   // 牛の水平オフセット（交代演出）
  let pumpTimer = 0;
  let sched = null;    // 搾乳スケジュール
  let hintTimer = 3;   // 誘い動作タイマー
  let hintCup = -1, hintT = 0;
  let round = 0;

  const CUP_COLORS = ['#ff8fa3', '#ffd166', '#8bd48f', '#7fb8ff'];

  function makeCow() {
    const bases = ['#fffdf7', '#fff7e6', '#fbf3ea'];
    const spotColors = ['#2b2b2b', '#5a3a22', '#7a4a2a', '#3a3a3a'];
    const spotColor = spotColors[ri(0, spotColors.length - 1)];
    const spots = [];
    const n = ri(4, 8);
    for (let i = 0; i < n; i++) {
      const cx = rr(0.05, 0.95), cy = rr(0.05, 0.95), r = rr(0.06, 0.13);
      const blobs = [];
      const k = ri(2, 4);
      for (let j = 0; j < k; j++) blobs.push({ dx: rr(-r * 0.7, r * 0.7), dy: rr(-r * 0.6, r * 0.6), r: r * rr(0.55, 1) });
      spots.push({ cx, cy, blobs });
    }
    const teatOff = [], teatLenF = [];
    for (let i = 0; i < 4; i++) { teatOff.push(rr(-0.14, 0.14)); teatLenF.push(rr(0.85, 1.15)); }
    // 隣り合う乳頭の間隔を保つ（カップ同士が重ならないように）
    for (let i = 1; i < 4; i++) {
      const gap = 1 + teatOff[i] - teatOff[i - 1];
      if (gap < 0.86) teatOff[i] = teatOff[i - 1] - 1 + 0.86;
    }
    const meanOff = teatOff.reduce((a, b) => a + b, 0) / 4;
    for (let i = 0; i < 4; i++) teatOff[i] -= meanOff;
    return {
      base: bases[ri(0, bases.length - 1)], spotColor, spots, teatOff, teatLenF,
      blink: 0, blinkTimer: rr(2, 5), happy: 0, tailT: 0, mouth: 0, earT: 0,
      udderHue: rr(-6, 6),
    };
  }

  function buildTeats() {
    teats = [];
    for (let i = 0; i < 4; i++) {
      teats.push({ i, x: 0, y: 0, len: 0, cup: -1, sway: 0, swayV: 0, glow: 0 });
    }
  }
  function buildCups() {
    cups.length = 0;
    for (let i = 0; i < 4; i++) {
      cups.push({
        i, color: CUP_COLORS[i], x: 0, y: 0, home: { x: 0, y: 0 }, tx: 0, ty: 0,
        state: 'rack', // rack | drag | fly | attached | falling | returning
        teat: -1, fill: 0, drain: 0, rate: 0, flowPhase: 0, milk: 0, squash: 0,
        angle: 0, angV: 0, tween: 0, from: { x: 0, y: 0 }, pulse: 0, bob: rr(0, TAU), fillTarget: 0,
      });
    }
  }
  function applyLayoutToWorld() {
    for (let i = 0; i < 4; i++) {
      const t = teats[i];
      t.x = L.teatCX + (i - 1.5) * L.spacing + cow.teatOff[i] * L.spacing;
      t.y = L.teatBaseY;
      t.len = L.teatLen * cow.teatLenF[i];
      const c = cups[i];
      c.home.x = L.rack.cx + (i - 1.5) * L.spacing;
      c.home.y = L.rack.y;
      if (c.state === 'rack') { c.x = c.home.x; c.y = c.home.y; }
    }
  }
  function teatTip(t) {
    return { x: t.x + Math.sin(t.sway) * t.len, y: t.y + Math.cos(t.sway) * t.len };
  }
  // 装着時のカップ口の位置（乳頭の根元近くまで深く咥える）
  function cupMouthOn(t) {
    const d = t.len * 0.3;
    return { x: t.x + Math.sin(t.sway) * d, y: t.y + Math.cos(t.sway) * d };
  }
  function resetRound(newCow) {
    cow = newCow || makeCow();
    buildTeats();
    if (!cups.length) buildCups();
    for (const c of cups) { c.state = 'rack'; c.teat = -1; c.fill = 0; c.drain = 0; c.rate = 0; c.milk = 0; c.angle = 0; c.angV = 0; }
    applyLayoutToWorld();
    jar.level = 0; jar.xOff = 0; jar.slosh = 0; jar.sloshV = 0;
    mainFill = 0; mainDrain = 0; mainFlow = 0;
    sched = null;
    phase = 'idle'; phaseT = 0; idleT = 0; hintTimer = 2.5;
    cowOffset = 0;
    round++;
  }

  // ---------- hoses ----------
  function cupBottom(c) {
    // カップ下端（ホース接続口）
    const a = c.angle;
    return { x: c.x - Math.sin(a) * L.cup.h, y: c.y + Math.cos(a) * L.cup.h };
  }
  function hosePath(c) {
    const p0 = cupBottom(c);
    if (L.portrait) {
      const p3 = { x: L.claw.x + (c.i - 1.5) * L.cup.w * 0.36, y: L.claw.y - L.cup.w * 0.35 };
      const slack = Math.max(40, Math.abs(p3.y - p0.y) * 0.55);
      const p1 = { x: p0.x - Math.sin(c.angle) * slack, y: p0.y + Math.cos(c.angle) * slack };
      const p2 = { x: p3.x, y: p3.y - slack * 0.9 };
      return cubicPts(p0, p1, p2, p3, 40);
    }
    // 横画面: ホースは床に沿って右へ流れ、合流部の左側に入る
    const r = L.cup.w * 0.55;
    const p3 = { x: L.claw.x - r * 1.3, y: L.claw.y + (c.i - 1.5) * L.cup.w * 0.22 };
    const slack = Math.max(30, L.cup.h * 0.55);
    const p1 = { x: p0.x - Math.sin(c.angle) * slack, y: p0.y + Math.cos(c.angle) * slack };
    const p2 = { x: p3.x - slack * 1.2 - (3 - c.i) * L.cup.w * 0.3, y: p3.y };
    return cubicPts(p0, p1, p2, p3, 40);
  }
  function mainPath() {
    const jx = L.jar.x + jar.xOff;
    const p3 = { x: jx, y: L.jar.top + L.jar.h * 0.08 };
    let p0, p1, p2;
    if (L.portrait) {
      p0 = { x: L.claw.x, y: L.claw.y + L.cup.w * 0.25 };
      p1 = { x: L.claw.x + (jx - L.claw.x) * 0.4, y: L.claw.y + L.cup.w * 0.9 };
      p2 = { x: jx, y: L.jar.top - L.jar.h * 0.55 };
    } else {
      const r = L.cup.w * 0.55;
      p0 = { x: L.claw.x + r * 1.3, y: L.claw.y };
      p1 = { x: L.claw.x + (jx - L.claw.x) * 0.5, y: L.claw.y };
      p2 = { x: jx - L.jar.w * 0.4, y: L.jar.top - L.jar.h * 0.5 };
    }
    return cubicPts(p0, p1, p2, p3, 48);
  }

  // ---------- particles ----------
  function spawn(kind, x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = rr(0, TAU), s = rr(0.3, 1);
      particles.push(Object.assign({
        kind, x, y, vx: Math.cos(a) * s * (opts && opts.speed || 120), vy: Math.sin(a) * s * (opts && opts.speed || 120) - (opts && opts.up || 0),
        life: rr(0.4, 0.9), age: 0, r: rr(2, 5) * (opts && opts.size || 1), color: opts && opts.color || '#fff', g: opts && opts.g != null ? opts.g : 600,
      }, opts && opts.extra || {}));
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    particles = particles.filter(p => p.age < p.life);
  }
  function drawParticles() {
    for (const p of particles) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      if (p.kind === 'drop') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.8, p.r * 1.1, 0, 0, TAU); ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - k) * 40, 0, TAU); ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        const r = p.r * (0.5 + k);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + p.age * 3;
          ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          ctx.lineTo(p.x + Math.cos(a + Math.PI / 4) * r * 0.35, p.y + Math.sin(a + Math.PI / 4) * r * 0.35);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'heart') {
        drawHeart(p.x, p.y, p.r * (0.8 + 0.4 * Math.sin(p.age * 8)), p.color);
      } else if (p.kind === 'note') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.fillRect(p.x + p.r * 0.7, p.y - p.r * 3, p.r * 0.5, p.r * 3);
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawHeart(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r);
    ctx.fill();
  }

  // ---------- input ----------
  let pointerId = null;
  let dragCup = null;
  let pointer = { x: 0, y: 0 };

  function nearestFreeTeat(x, y) {
    let best = null, bd = Infinity;
    for (const t of teats) {
      if (t.cup !== -1) continue;
      const tip = teatTip(t);
      const d = dist(x, y, tip.x, tip.y);
      if (d < bd) { bd = d; best = t; }
    }
    return { teat: best, d: bd };
  }
  function pickCup(x, y) {
    let best = null, bd = Infinity;
    for (const c of cups) {
      if (c.state !== 'rack' && c.state !== 'returning' && c.state !== 'falling') continue;
      // カップ本体（中心）とホース上部を掴める
      const cx = c.x, cy = c.y + L.cup.h * 0.5;
      let d = dist(x, y, cx, cy) - L.cup.h * 0.35;
      const path = hosePath(c);
      for (let f = 0; f <= 0.35; f += 0.05) { const p = pointAt(path, f); d = Math.min(d, dist(x, y, p.x, p.y)); }
      if (d < bd) { bd = d; best = c; }
    }
    return bd < L.grabR ? best : null;
  }
  function onDown(e) {
    if (pointerId !== null) return;
    Audio.unlock();
    pointerId = e.pointerId;
    pointer.x = e.clientX; pointer.y = e.clientY;
    idleT = 0; hintTimer = 4;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (phase === 'celebrate' && phaseT > 0.8) { startTransition(); return; }
    if (phase === 'transition') return;
    const c = pickCup(pointer.x, pointer.y);
    if (c) {
      dragCup = c;
      c.state = 'drag';
      c.tx = pointer.x; c.ty = pointer.y - L.lift;
      c.angV = 0;
      Audio.grab();
      return;
    }
    // 牛・ジャーへのタッチはちょっとした反応（ごほうび）
    const hd = dist(pointer.x, pointer.y, L.head.x + cowOffset, L.head.y);
    if (hd < L.head.r * 1.3) { cowReact(); return; }
    const jx = L.jar.x + jar.xOff;
    if (Math.abs(pointer.x - jx) < L.jar.w && pointer.y > L.jar.top - 20 && pointer.y < L.jar.top + L.jar.h + 20) {
      jar.sloshV += 6; Audio.clink(); return;
    }
    // どこでもない場所: 小さな波紋（何も起きないが反応はある）
    spawn('ring', pointer.x, pointer.y, 1, { speed: 0, g: 0, color: 'rgba(255,255,255,0.7)', size: 2 });
  }
  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (dragCup) {
      dragCup.tx = pointer.x;
      dragCup.ty = pointer.y - L.lift;
    }
  }
  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (dragCup) {
      const c = dragCup; dragCup = null;
      const { teat, d } = nearestFreeTeat(c.x, c.y);
      if (teat && d < L.releaseR) {
        flyTo(c, teat);
      } else {
        returnHome(c, 'drop');
      }
    }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS Safari: スクロール・ピンチ・ダブルタップ拡大を抑止
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));

  function cowReact() {
    cow.blink = 0.18; cow.mouth = 1; cow.earT = 1;
    Audio.moo();
    spawn('note', L.head.x + cowOffset + L.head.r * 0.8, L.head.y - L.head.r * 0.6, 2, { speed: 30, up: 90, g: -40, color: '#fff', size: 1.2 });
  }

  // ---------- cup state transitions ----------
  function flyTo(c, teat) {
    c.state = 'fly'; c.teat = teat.i; teat.cup = c.i;
    c.from = { x: c.x, y: c.y }; c.tween = 0;
  }
  function attach(c, teat) {
    c.state = 'attached'; c.teat = teat.i; teat.cup = c.i;
    const m = cupMouthOn(teat);
    c.x = m.x; c.y = m.y; c.angle = 0; c.angV = 0;
    c.squash = 1; c.milk = 1; c.fillTarget = 0.14;
    teat.swayV += rr(-3, 3);
    Audio.shupo();
    spawn('ring', c.x, c.y, 1, { speed: 0, g: 0, color: 'rgba(255,255,255,0.9)', size: 3 });
    spawn('drop', c.x, c.y + 6, 5, { speed: 80, up: 60, size: 0.7, color: '#fff' });
    if (teats.every(t => t.cup !== -1) && phase === 'idle') {
      phase = 'milking'; phaseT = -0.5; // 少し間を置いて流れ始める
      makeSchedule();
    }
  }
  function returnHome(c, how) {
    if (c.teat !== -1) { teats[c.teat].cup = -1; c.teat = -1; }
    c.state = 'returning'; c.from = { x: c.x, y: c.y }; c.tween = 0; c.how = how;
    if (how === 'drop') Audio.plop();
  }
  function detach(c) {
    const teat = teats[c.teat];
    teat.swayV += rr(-4, 4);
    teat.cup = -1; c.teat = -1;
    c.state = 'falling'; c.vy = -60; c.vx = rr(-80, 80); c.angV = rr(-4, 4); c.fallT = 0;
    c.drain = 0; c.rate = 0; c.fillTarget = 0;
    Audio.shu();
    const tip = teatTip(teat);
    spawn('drop', tip.x, tip.y, 6, { speed: 90, up: 40, size: 0.6, color: '#fff' });
    spawn('ring', tip.x, tip.y, 1, { speed: 0, g: 0, color: 'rgba(255,255,255,0.7)', size: 2 });
  }

  function makeSchedule() {
    const T = rr(11, 15);
    const order = shuffle([0, 1, 2, 3]);
    const cupSched = [];
    for (let i = 0; i < 4; i++) {
      const rank = order.indexOf(i);
      cupSched.push({
        end: T * (0.42 + 0.17 * rank) + rr(-0.5, 0.5),
        base: rr(0.75, 1.2),
        rampDelay: rr(0, 0.5),
        decayDur: rr(2.0, 3.5),
      });
    }
    // 総流量を積分してジャーの満杯量に正規化
    let total = 0;
    const dt = 0.05;
    for (let t = 1.4; t < T + 2; t += dt) for (let i = 0; i < 4; i++) total += rateAt(cupSched[i], t) * dt;
    sched = { T, cups: cupSched, total };
  }
  function rateAt(s, t) {
    if (t >= s.end) return 0;
    const ramp = clamp((t - s.rampDelay) / 1.2, 0, 1);
    const decayStart = s.end - s.decayDur;
    let d = 1;
    if (t > decayStart) d = lerp(1, 0.12, easeInOut((t - decayStart) / s.decayDur));
    return s.base * easeOut(ramp) * d;
  }

  function startTransition() {
    phase = 'transition'; phaseT = 0;
    nextCow = makeCow();
    Audio.clink();
  }

  // ---------- update ----------
  function update(dt) {
    time += dt;
    phaseT += dt;
    idleT += dt;

    // 牛のまばたき・表情
    cow.blinkTimer -= dt;
    if (cow.blinkTimer <= 0) { cow.blink = 0.14; cow.blinkTimer = rr(2, 5); }
    cow.blink = Math.max(0, cow.blink - dt);
    cow.mouth = Math.max(0, cow.mouth - dt * 1.2);
    cow.earT = Math.max(0, cow.earT - dt * 2);
    cow.tailT += dt * (phase === 'celebrate' ? 9 : 1.6);

    // 乳頭のゆれ（ばね）
    for (const t of teats) {
      const target = 0;
      const free = t.cup === -1;
      const idleSway = free && phase === 'idle' ? Math.sin(time * 1.7 + t.i * 1.9) * 0.06 : 0;
      const acc = -(t.sway - target - idleSway) * 60 - t.swayV * 6;
      t.swayV += acc * dt; t.sway += t.swayV * dt;
      // 空いている乳頭のやわらかな光
      let g = 0;
      if (free && phase === 'idle') {
        g = 0.35 + 0.25 * Math.sin(time * 2.2 + t.i);
        if (dragCup) {
          const tip = teatTip(t);
          const d = dist(dragCup.x, dragCup.y, tip.x, tip.y);
          g = clamp(1.2 - d / L.magnetR, g, 1);
        }
      }
      t.glow = lerp(t.glow, g, 1 - Math.pow(0.001, dt));
    }

    // カップ
    let anyAttachedHose = false;
    for (const c of cups) {
      c.squash = Math.max(0, c.squash - dt * 4);
      c.milk = Math.max(0, c.milk - dt * 1.5);
      if (c.state === 'rack') {
        const bob = Math.sin(time * 2.6 + c.bob) * 2.5 * (phase === 'idle' ? 1 : 0.3);
        let hop = 0;
        if (hintCup === c.i && hintT > 0) hop = -Math.sin(clamp(hintT, 0, 1) * Math.PI) * L.cup.h * 0.35;
        c.x = c.home.x; c.y = c.home.y + bob + hop;
        c.angle = lerp(c.angle, Math.sin(time * 2.6 + c.bob) * 0.03, 1 - Math.pow(0.01, dt));
      } else if (c.state === 'drag') {
        // 磁石: 近い空き乳頭に引き寄せる
        let tx = c.tx, ty = c.ty;
        const { teat, d } = nearestFreeTeat(c.x, c.y);
        if (teat) {
          const tip = teatTip(teat);
          if (d < L.magnetR) {
            const k = (1 - d / L.magnetR) * 0.7;
            const m = cupMouthOn(teat);
            tx = lerp(tx, m.x, k); ty = lerp(ty, m.y, k);
          }
          if (d < L.snapR) { attach(c, teat); dragCup = null; continue; }
        }
        const k = 1 - Math.pow(0.000002, dt);
        const nx = lerp(c.x, tx, k), ny = lerp(c.y, ty, k);
        const vx = (nx - c.x) / Math.max(dt, 1e-3);
        c.x = nx; c.y = ny;
        const targetAngle = clamp(-vx * 0.0008, -0.35, 0.35);
        c.angle = lerp(c.angle, targetAngle, 1 - Math.pow(0.002, dt));
      } else if (c.state === 'fly') {
        c.tween += dt / 0.28;
        const teat = teats[c.teat];
        const m = cupMouthOn(teat);
        const k = easeInOut(c.tween);
        c.x = lerp(c.from.x, m.x, k); c.y = lerp(c.from.y, m.y, k);
        c.angle = lerp(c.angle, 0, 1 - Math.pow(0.001, dt));
        if (c.tween >= 1) { attach(c, teat); }
      } else if (c.state === 'attached') {
        const teat = teats[c.teat];
        const m = cupMouthOn(teat);
        c.x = m.x; c.y = m.y;
        c.angle = -teat.sway;
        c.fill = lerp(c.fill, c.fillTarget, 1 - Math.pow(0.02, dt));
        if (c.fillTarget >= 1 && c.fill > 0.995) c.fill = 1;
        c.pulse = phase === 'milking' ? c.rate : 0;
        if (c.fill > 0.98) anyAttachedHose = true;
      } else if (c.state === 'falling') {
        c.fallT += dt;
        c.vy += 1400 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        c.angle += c.angV * dt; c.angV *= Math.pow(0.2, dt);
        if (c.fallT > 0.22) returnHome(c, 'detach');
      } else if (c.state === 'returning') {
        const dur = c.how === 'detach' ? 0.75 : 0.55;
        c.tween += dt / dur;
        const k = c.how === 'detach' ? bounceOut(c.tween) : easeOutBack(c.tween);
        c.x = lerp(c.from.x, c.home.x, easeOut(c.tween)); c.y = lerp(c.from.y, c.home.y, k);
        c.angle = lerp(c.angle, 0, 1 - Math.pow(0.003, dt));
        if (c.tween >= 1) { c.state = 'rack'; c.x = c.home.x; c.y = c.home.y; c.angle = 0; if (c.how === 'detach') Audio.tick(); }
      }
      // ホースの排出（離脱後）
      if (c.state !== 'attached' && c.fill > 0) {
        c.drain = Math.min(1, c.drain + dt * 0.9);
        if (c.drain >= 1) { c.fill = 0; c.drain = 0; }
      }
      c.flowPhase += dt * (c.state === 'attached' ? (60 + 140 * c.rate) : 120);
    }

    // 搾乳フェーズ
    let sumRate = 0;
    if (phase === 'milking' && phaseT >= 0) {
      const t = phaseT;
      for (const c of cups) {
        if (c.state !== 'attached') continue;
        const s = sched.cups[c.i];
        c.rate = rateAt(s, t);
        c.fillTarget = 1;
        if (t >= s.end) detach(c);
        else sumRate += c.rate;
      }
      // 合流ライン: 誰かの牛乳が爪（クロー）に到達したら流れ始める
      if (anyAttachedHose && mainFill < 1) mainFill = Math.min(1, mainFill + dt * 0.8);
      if (mainFill >= 1 && sumRate > 0) {
        jar.level = Math.min(0.97, jar.level + sumRate * dt / sched.total * 0.96);
      }
      if (cups.every(c => c.state !== 'attached')) { phase = 'draining'; phaseT = 0; }
      // ポンプの音・脈動
      pumpTimer -= dt;
      if (pumpTimer <= 0 && sumRate > 0) { pumpTimer = 0.85; Audio.pump(clamp(sumRate / 3, 0.3, 1)); }
    }
    mainFlow = lerp(mainFlow, sumRate, 1 - Math.pow(0.05, dt));
    if (phase === 'draining') {
      const stillMilk = cups.some(c => c.fill > 0);
      if (!stillMilk) {
        mainDrain = Math.min(1, mainDrain + dt * 0.7);
        jar.level = Math.min(1, jar.level + dt * 0.15);
        if (mainDrain >= 1) {
          mainFill = 0; mainDrain = 0;
          jar.level = 1; jar.sloshV += 4;
          phase = 'celebrate'; phaseT = 0;
          Audio.chime(); Audio.moo();
          cow.happy = 1; cow.mouth = 1;
          spawnCelebration();
        }
      }
    }
    if (phase === 'celebrate') {
      if (phaseT > 0.4 && Math.random() < dt * 10) {
        const jx = L.jar.x + jar.xOff;
        spawn('spark', jx + rr(-L.jar.w, L.jar.w), L.jar.top + rr(-30, L.jar.h), 1, { speed: 30, g: -30, color: Math.random() < 0.5 ? '#fff6b0' : '#ffffff', size: 1.8, extra: { life: 1.0 } });
      }
      if (phaseT > 0.4 && Math.random() < dt * 2.5) {
        spawn('heart', L.head.x + cowOffset + rr(-L.head.r, L.head.r), L.head.y - L.head.r * 0.9, 1, { speed: 20, up: 60, g: -25, color: '#ff8fa3', size: 1.8, extra: { life: 1.6 } });
      }
      if (phaseT > 3.6) startTransition();
    }
    if (phase === 'transition') {
      // 満杯ジャーが右へ退場 → 牛が交代 → 空ジャーが戻る
      const t = phaseT;
      const outT = clamp(t / 0.9, 0, 1);
      jar.xOff = easeInOut(outT) * (W * 0.6);
      if (t > 0.6) {
        const k = easeInOut(clamp((t - 0.6) / 1.6, 0, 1));
        cowOffset = -k * (W * 1.3);
        cow.tailT += dt * 4;
      }
      if (t > 2.3) {
        const c2 = nextCow || makeCow();
        resetRound(c2);
        nextCow = null;
        cowOffset = W * 1.3;
        jar.xOff = -(W * 0.6);
        phase = 'enter'; phaseT = 0;
      }
    }
    if (phase === 'enter') {
      const k = easeInOut(clamp(phaseT / 1.5, 0, 1));
      cowOffset = (1 - k) * (W * 1.3);
      jar.xOff = -(1 - easeOut(clamp((phaseT - 0.6) / 0.9, 0, 1))) * (W * 0.6);
      if (phaseT >= 1.6) { phase = 'idle'; phaseT = 0; cowOffset = 0; jar.xOff = 0; hintTimer = 2; }
    }
    mainPhase += dt * (40 + 120 * clamp(mainFlow, 0, 2));
    Audio.setFlow(phase === 'milking' ? clamp(mainFlow / 2.5, 0, 1) * (mainFill > 0.9 ? 1 : 0.5) : (phase === 'draining' ? 0.35 : 0));

    // 誘い: 空いている乳頭から時々「ぽたっ」と一滴
    if (phase === 'idle' && Math.random() < dt * 0.6) {
      const free = teats.filter(t => t.cup === -1);
      if (free.length) {
        const t = free[ri(0, free.length - 1)];
        const tip = teatTip(t);
        spawn('drop', tip.x, tip.y + 2, 1, { speed: 0, up: 0, g: 700, size: 1.1, color: '#fff', extra: { life: 0.9 } });
        t.swayV += rr(-0.6, 0.6);
      }
    }
    // 誘い動作: ラックのカップが小さく跳ねる
    if (phase === 'idle' && !dragCup) {
      hintTimer -= dt;
      if (hintTimer <= 0) {
        const free = cups.filter(c => c.state === 'rack');
        if (free.length) { hintCup = free[ri(0, free.length - 1)].i; hintT = 1; }
        hintTimer = rr(2.5, 4.5);
      }
    }
    hintT = Math.max(0, hintT - dt * 2);

    // ジャーの揺れ
    jar.bounce = Math.max(0, jar.bounce - dt * 0.9);
    const acc = -jar.slosh * 70 - jar.sloshV * 4;
    jar.sloshV += acc * dt; jar.slosh += jar.sloshV * dt;
    if (mainFlow > 0.1 && phase === 'milking') jar.sloshV += Math.sin(time * 5) * dt * 3;

    updateParticles(dt);
  }
  function spawnCelebration() {
    const jx = L.jar.x + jar.xOff;
    spawn('spark', jx, L.jar.top, 26, { speed: 220, up: 160, g: 200, color: '#fff6b0', size: 2.0, extra: { life: 1.3 } });
    spawn('spark', jx, L.jar.top + L.jar.h * 0.5, 12, { speed: 120, up: 60, g: 100, color: '#ffffff', size: 1.4, extra: { life: 1.1 } });
    spawn('ring', jx, L.jar.top + L.jar.h * 0.5, 1, { speed: 0, g: 0, color: 'rgba(255,240,170,0.9)', size: 4, extra: { life: 0.9 } });
    spawn('heart', L.head.x + cowOffset + L.head.r * 0.6, L.head.y - L.head.r * 0.8, 6, { speed: 50, up: 80, g: -30, color: '#ff8fa3', size: 2.4, extra: { life: 1.8 } });
    jar.bounce = 1;
  }

  // ---------- drawing ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#cfe9ff'); g.addColorStop(0.6, '#e8f4ff'); g.addColorStop(1, '#fdf6e3');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 床（藁色）
    if (!L.portrait) {
      ctx.fillStyle = '#e9d9a6';
      ctx.fillRect(0, L.floorY, W, H - L.floorY);
      ctx.fillStyle = '#f4e7bf';
      ctx.fillRect(0, L.floorY, W, 6);
    }
  }

  function drawCowSpots(rect, cw) {
    ctx.fillStyle = cw.spotColor;
    for (const s of cw.spots) {
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.ellipse(rect.x + (s.cx + b.dx) * rect.w, rect.y + (s.cy + b.dy) * rect.h, b.r * rect.w, b.r * rect.h * 1.1, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawHead(hx, hy, r, cw, dir) {
    const blink = cw.blink > 0;
    ctx.save();
    ctx.translate(hx, hy);
    const earW = r * 0.55, earH = r * 0.28;
    const earAng = cw.earT * 0.4;
    // 耳
    ctx.fillStyle = cw.base; ctx.strokeStyle = '#d9c9b0'; ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * r * 0.85, -r * 0.2); ctx.rotate(s * (0.6 - earAng));
      ctx.beginPath(); ctx.ellipse(0, 0, earW, earH, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f7c6d0'; ctx.beginPath(); ctx.ellipse(0, 0, earW * 0.6, earH * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cw.base;
      ctx.restore();
    }
    // 角
    ctx.fillStyle = '#f0d9a8';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.45, -r * 0.85, r * 0.16, r * 0.28, s * 0.4, 0, TAU); ctx.fill(); }
    // 顔
    ctx.fillStyle = cw.base;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.05, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.05, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = cw.spotColor;
    ctx.beginPath(); ctx.ellipse(-r * 0.75, -r * 0.5, r * 0.5, r * 0.6, 0.5, 0, TAU); ctx.fill();
    ctx.restore();
    // 鼻口
    ctx.fillStyle = '#f7c6d0';
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.62, r * 0.42, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d98ba0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.25, r * 0.5, r * 0.09, r * 0.12, 0, 0, TAU); ctx.fill(); }
    // 口（うれしいと大きく）
    ctx.strokeStyle = '#c97a90'; ctx.lineWidth = Math.max(2, r * 0.06); ctx.lineCap = 'round';
    ctx.beginPath();
    if (cw.mouth > 0.2) { ctx.arc(0, r * 0.68, r * 0.22, 0.15, Math.PI - 0.15); } else { ctx.arc(0, r * 0.62, r * 0.2, 0.3, Math.PI - 0.3); }
    ctx.stroke();
    // 目
    const ey = -r * 0.05, ex = r * 0.38;
    for (const s of [-1, 1]) {
      if (blink || cw.happy > 0 && phase === 'celebrate') {
        ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.beginPath(); ctx.arc(s * ex, ey + r * 0.05, r * 0.14, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(s * ex, ey, r * 0.16, r * 0.19, 0, 0, TAU); ctx.fill();
        const px = dir === 'down' ? 0 : -r * 0.03, py = dir === 'down' ? r * 0.06 : r * 0.02;
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(s * ex + px, ey + py, r * 0.1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * ex + px - r * 0.03, ey + py - r * 0.04, r * 0.035, 0, TAU); ctx.fill();
      }
    }
    // ほっぺ
    ctx.fillStyle = 'rgba(255,150,170,0.35)';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.62, r * 0.28, r * 0.16, r * 0.1, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function drawUdderAndTeats(cw, ox) {
    const u = L.udder;
    const ux = u.x + ox;
    // 乳房
    ctx.fillStyle = `hsl(${345 + cw.udderHue}, 85%, 87%)`;
    const uh = u.bottom - u.top;
    const rad = Math.min(u.w * 0.28, uh * 0.9);
    ctx.beginPath();
    ctx.moveTo(ux - u.w / 2 - uh * 0.15, u.top - 2);
    ctx.lineTo(ux + u.w / 2 + uh * 0.15, u.top - 2);
    ctx.quadraticCurveTo(ux + u.w / 2 + uh * 0.1, u.top + uh * 0.5, ux + u.w / 2 - rad * 0.2, u.bottom - rad * 0.55);
    ctx.quadraticCurveTo(ux + u.w / 2 - rad * 0.6, u.bottom, ux + u.w / 2 - rad, u.bottom);
    ctx.lineTo(ux - u.w / 2 + rad, u.bottom);
    ctx.quadraticCurveTo(ux - u.w / 2 + rad * 0.6, u.bottom, ux - u.w / 2 + rad * 0.2, u.bottom - rad * 0.55);
    ctx.quadraticCurveTo(ux - u.w / 2 - uh * 0.1, u.top + uh * 0.5, ux - u.w / 2 - uh * 0.15, u.top - 2);
    ctx.closePath(); ctx.fill();
    // 乳房のくぼみ（4つの区画をやわらかく示す）
    ctx.strokeStyle = 'rgba(220,120,150,0.18)'; ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      const tx = (teats[i - 1].x + teats[i].x) / 2 + ox;
      ctx.beginPath(); ctx.moveTo(tx, u.bottom - uh * 0.35); ctx.quadraticCurveTo(tx, u.bottom - uh * 0.1, tx, u.bottom); ctx.stroke();
    }
    // 乳房のハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(ux - u.w * 0.2, u.top + (u.bottom - u.top) * 0.35, u.w * 0.16, (u.bottom - u.top) * 0.18, 0, 0, TAU); ctx.fill();
    // 乳頭
    for (const t of teats) {
      const bx = t.x + ox, by = t.y;
      const tw = L.teatW;
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(-t.sway);
      // 空いている乳頭の光（誘い）
      if (t.glow > 0.02) {
        const g = ctx.createRadialGradient(0, t.len, 0, 0, t.len, tw * 2.4);
        g.addColorStop(0, `rgba(255,255,255,${0.75 * t.glow})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, t.len, tw * 2.4, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `hsl(${345 + cw.udderHue}, 70%, 80%)`;
      roundRect(ctx, -tw / 2, -tw * 0.2, tw, t.len + tw * 0.2, tw / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, -tw * 0.35, 0, tw * 0.25, t.len * 0.7, tw * 0.12); ctx.fill();
      ctx.restore();
    }
  }

  function drawCowPortrait(cw, ox) {
    // 上部に大きなお腹、その下に乳房。後ろ脚は両端。
    const bellyBottom = L.udder.top + (L.udder.bottom - L.udder.top) * 0.25;
    const rect = { x: -W * 0.15 + ox, y: -H * 0.2, w: W * 1.3, h: bellyBottom + H * 0.2 };
    // 脚
    ctx.fillStyle = cw.base;
    for (const s of [-1, 1]) {
      const lx = W / 2 + s * W * 0.47 + ox;
      roundRect(ctx, lx - W * 0.06, bellyBottom - 20, W * 0.12, H * 0.30, W * 0.05); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; roundRect(ctx, lx - W * 0.065, bellyBottom - 20 + H * 0.26, W * 0.13, H * 0.045, 8); ctx.fill();
      ctx.fillStyle = cw.base;
    }
    // お腹
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y);
    ctx.lineTo(rect.x + rect.w, bellyBottom - H * 0.06);
    ctx.bezierCurveTo(W * 0.85 + ox, bellyBottom + H * 0.03, W * 0.15 + ox, bellyBottom + H * 0.03, rect.x, bellyBottom - H * 0.06);
    ctx.closePath();
    ctx.fillStyle = cw.base; ctx.fill();
    ctx.clip();
    drawCowSpots(rect, cw);
    ctx.restore();
    // 頭（左上から覗く）
    drawHead(L.head.x + ox, L.head.y, L.head.r, cw, 'down');
    drawUdderAndTeats(cw, ox);
  }

  function drawCowLandscape(cw, ox) {
    const b = L.body;
    const bx = b.x + ox;
    // しっぽ
    ctx.strokeStyle = cw.base; ctx.lineWidth = Math.max(6, b.h * 0.06); ctx.lineCap = 'round';
    const tailSw = Math.sin(cw.tailT) * 0.5;
    ctx.beginPath(); ctx.moveTo(bx + b.w - 10, b.y + b.h * 0.25);
    ctx.quadraticCurveTo(bx + b.w + b.w * 0.12, b.y + b.h * 0.5 + tailSw * 40, bx + b.w + b.w * 0.06 + tailSw * 50, b.y + b.h * 0.95);
    ctx.stroke();
    ctx.fillStyle = cw.spotColor;
    ctx.beginPath(); ctx.arc(bx + b.w + b.w * 0.06 + tailSw * 50, b.y + b.h * 0.95, b.h * 0.07, 0, TAU); ctx.fill();
    // 脚
    const legW = b.w * 0.075, legTop = b.y + b.h * 0.6, legH = L.floorY - legTop + 4;
    const walk = phase === 'transition' || phase === 'enter' ? Math.sin(time * 14) * 10 : 0;
    const legs = [bx + b.w * 0.04, bx + b.w * 0.14, bx + b.w * 0.82, bx + b.w * 0.93];
    legs.forEach((lx, i) => {
      const w = i % 2 ? walk : -walk;
      ctx.fillStyle = cw.base;
      roundRect(ctx, lx + w * 0.3, legTop, legW, legH, legW * 0.4); ctx.fill();
      ctx.fillStyle = '#5a4a3a';
      roundRect(ctx, lx + w * 0.3 - 2, L.floorY - legH * 0.1, legW + 4, legH * 0.1 + 4, 5); ctx.fill();
    });
    // 胴体
    ctx.save();
    roundRect(ctx, bx, b.y, b.w, b.h, b.h * 0.45);
    ctx.fillStyle = cw.base; ctx.fill();
    ctx.clip();
    drawCowSpots({ x: bx, y: b.y, w: b.w, h: b.h }, cw);
    ctx.restore();
    // 首・頭
    ctx.fillStyle = cw.base;
    ctx.beginPath(); ctx.ellipse(bx + 6, b.y + b.h * 0.35, b.h * 0.3, b.h * 0.33, 0, 0, TAU); ctx.fill();
    drawHead(L.head.x + ox, L.head.y, L.head.r, cw, 'side');
    drawUdderAndTeats(cw, ox);
  }

  function drawRack() {
    // ラック: カップ4本の定位置（空いている場所が見える）
    const y = L.rack.y;
    const w = L.spacing * 3 + L.cup.w * 2.2;
    ctx.fillStyle = 'rgba(120,140,160,0.25)';
    roundRect(ctx, L.rack.cx - w / 2, y + L.cup.h * 0.55, w, L.cup.h * 0.16, 8); ctx.fill();
    if (!L.portrait) {
      ctx.fillStyle = 'rgba(120,140,160,0.18)';
      roundRect(ctx, L.rack.cx - w / 2 - 6, L.floorY - 8, w + 12, 12, 6); ctx.fill();
    }
    for (const c of cups) {
      // 空いたスロット
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = -time * 20;
      roundRect(ctx, c.home.x - L.cup.w * 0.55, c.home.y - 6, L.cup.w * 1.1, L.cup.h + 12, L.cup.w * 0.4);
      ctx.fillStyle = `${c.color}22`; ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawHose(c) {
    const path = hosePath(c);
    // 透明ホース
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const tw = Math.max(9, L.cup.w * 0.28);
    if (tracePart(ctx, path, 0, 1)) {
      ctx.strokeStyle = 'rgba(150,200,240,0.35)'; ctx.lineWidth = tw + 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(225,245,255,0.55)'; ctx.lineWidth = tw; ctx.stroke();
    }
    // 牛乳
    if (c.fill > 0.005) {
      const from = c.state === 'attached' ? 0 : c.drain;
      const to = c.fill;
      if (tracePart(ctx, path, from, to)) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = tw * 0.72; ctx.stroke();
        // 流れの筋（動く点線）
        ctx.strokeStyle = 'rgba(185,215,240,0.75)'; ctx.lineWidth = tw * 0.22;
        ctx.setLineDash([tw * 0.6, tw * 1.5]); ctx.lineDashOffset = -c.flowPhase;
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // ハイライト
    if (tracePart(ctx, path, 0, 1)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(2, tw * 0.15);
      ctx.save(); ctx.translate(-tw * 0.22, -tw * 0.22); ctx.stroke(); ctx.restore();
    }
  }

  function drawMainLine() {
    const path = mainPath();
    const tw = Math.max(12, L.cup.w * 0.36);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (tracePart(ctx, path, 0, 1)) {
      ctx.strokeStyle = 'rgba(150,200,240,0.35)'; ctx.lineWidth = tw + 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(225,245,255,0.55)'; ctx.lineWidth = tw; ctx.stroke();
    }
    if (mainFill > 0.005) {
      if (tracePart(ctx, path, mainDrain, mainFill)) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = tw * 0.72; ctx.stroke();
        ctx.strokeStyle = 'rgba(185,215,240,0.75)'; ctx.lineWidth = tw * 0.22;
        ctx.setLineDash([tw * 0.7, tw * 1.6]); ctx.lineDashOffset = -mainPhase; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (tracePart(ctx, path, 0, 1)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(2, tw * 0.15);
      ctx.save(); ctx.translate(-tw * 0.22, -tw * 0.22); ctx.stroke(); ctx.restore();
    }
    // クロー（合流部）
    const r = L.cup.w * 0.55;
    ctx.fillStyle = '#c9d3dc';
    ctx.beginPath(); ctx.ellipse(L.claw.x, L.claw.y, r * 1.5, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e6edf3';
    ctx.beginPath(); ctx.ellipse(L.claw.x - r * 0.3, L.claw.y - r * 0.25, r * 0.7, r * 0.35, 0, 0, TAU); ctx.fill();
    // 中の牛乳窓
    ctx.fillStyle = mainFill > 0.05 ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(L.claw.x, L.claw.y + r * 0.1, r * 0.6, r * 0.35, 0, 0, TAU); ctx.fill();
  }

  function drawCup(c) {
    const cw = L.cup.w, ch = L.cup.h;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    const pulse = c.state === 'attached' && phase === 'milking' ? 1 + 0.035 * Math.sin(time * 7.4) * c.pulse : 1;
    const sq = 1 + c.squash * 0.25;
    ctx.scale(sq * pulse, (2 - sq) / pulse);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, -cw / 2 + 4, 6, cw, ch, cw * 0.4); ctx.fill();
    // 本体（半透明）
    const g = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    g.addColorStop(0, 'rgba(200,225,245,0.85)'); g.addColorStop(0.35, 'rgba(240,250,255,0.9)'); g.addColorStop(1, 'rgba(180,205,230,0.85)');
    ctx.fillStyle = g;
    roundRect(ctx, -cw / 2, 0, cw, ch, cw * 0.4); ctx.fill();
    // 中の牛乳（装着時のしずく）
    if (c.milk > 0 || (c.state === 'attached' && c.fill > 0.1)) {
      const lvl = c.state === 'attached' ? clamp(0.25 + 0.15 * Math.sin(time * 7.4) * c.pulse + c.milk * 0.3, 0, 0.7) : c.milk * 0.4;
      ctx.save(); roundRect(ctx, -cw / 2, 0, cw, ch, cw * 0.4); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(-cw / 2, ch * 0.18, cw, ch * lvl);
      ctx.restore();
    }
    // 色バンド
    ctx.fillStyle = c.color;
    roundRect(ctx, -cw / 2, ch * 0.55, cw, ch * 0.14, 4); ctx.fill();
    // 口（ライナー）
    ctx.fillStyle = '#4b4f57';
    ctx.beginPath(); ctx.ellipse(0, 0, cw / 2, cw * 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2e33';
    ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.3, cw * 0.13, 0, 0, TAU); ctx.fill();
    // 底のニップル
    ctx.fillStyle = '#9aa7b5';
    roundRect(ctx, -cw * 0.16, ch - 2, cw * 0.32, cw * 0.25, 4); ctx.fill();
    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, -cw * 0.36, ch * 0.12, cw * 0.14, ch * 0.7, cw * 0.07); ctx.fill();
    ctx.restore();
  }

  function drawJar() {
    const jx = L.jar.x + jar.xOff, w = L.jar.w, h = L.jar.h, top = L.jar.top;
    ctx.save();
    if (jar.bounce > 0) {
      const b = Math.sin(jar.bounce * Math.PI * 3) * jar.bounce * 0.12;
      ctx.translate(jx, top + h); ctx.scale(1 - b, 1 + b); ctx.translate(-jx, -(top + h));
    }
    // 台
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.ellipse(jx, top + h + 4, w * 0.75, w * 0.15, 0, 0, TAU); ctx.fill();
    // ジャー本体（ガラス）
    roundRect(ctx, jx - w / 2, top, w, h, w * 0.18);
    ctx.fillStyle = 'rgba(220,240,255,0.5)'; ctx.fill();
    // 牛乳
    ctx.save(); roundRect(ctx, jx - w / 2, top, w, h, w * 0.18); ctx.clip();
    const lvl = jar.level;
    const surfY = top + h - h * 0.94 * lvl - 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(jx - w, top + h + 10);
    ctx.lineTo(jx - w, surfY);
    const amp = clamp(jar.slosh * 12, -h * 0.08, h * 0.08);
    for (let i = 0; i <= 12; i++) {
      const x = jx - w / 2 + (w * i) / 12;
      ctx.lineTo(x, surfY + amp * Math.sin((i / 12) * Math.PI * 2 + time * 2) + Math.sin(time * 6 + i) * (mainFlow > 0.1 ? 1.5 : 0.3));
    }
    ctx.lineTo(jx + w, surfY);
    ctx.lineTo(jx + w, top + h + 10);
    ctx.closePath(); ctx.fill();
    // 泡
    if (lvl > 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 4; i++) {
        const x = jx - w * 0.3 + (w * 0.6 * i) / 3, r = 3 + (i % 2) * 2;
        ctx.beginPath(); ctx.arc(x, surfY - 2 + Math.sin(time * 3 + i) * 2, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // 縁と反射
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    roundRect(ctx, jx - w / 2, top, w, h, w * 0.18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(ctx, jx - w * 0.4, top + h * 0.1, w * 0.12, h * 0.75, w * 0.06); ctx.fill();
    // フタ（口の輪）
    ctx.fillStyle = '#c9d3dc';
    roundRect(ctx, jx - w * 0.55, top - w * 0.12, w * 1.1, w * 0.2, w * 0.08); ctx.fill();
    ctx.restore();
  }

  function draw() {
    drawBackground();
    if (L.portrait) drawCowPortrait(cow, cowOffset); else drawCowLandscape(cow, cowOffset);
    drawRack();
    drawJar();
    drawMainLine();
    // ホース（掴んでいるカップ以外）
    for (const c of cups) if (c !== dragCup) drawHose(c);
    if (dragCup) drawHose(dragCup);
    // カップ（掴んでいるカップは最後）
    const order = cups.slice().sort((a, b) => (a === dragCup) - (b === dragCup));
    for (const c of order) drawCup(c);
    drawParticles();
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  resetRound();
  requestAnimationFrame(frame);

  // デバッグ/テスト用フック（表示には影響しない）
  window.__milk = {
    get phase() { return phase; }, get cups() { return cups; }, get teats() { return teats; }, get L() { return L; },
    get jar() { return jar; }, get round() { return round; }, teatTip, get cow() { return cow; },
  };
})();
