// Circles風 wordless パズル。文字・ボタンは一切使わない。
(function () {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const A = window.GameAudio;
  const LEVELS = window.LEVELS;
  const STORAGE_KEY = 'circles.level';

  // ---------- 画面 ----------
  let W = 1, H = 1, dpr = 1;
  let box = { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1, s: 1 }; // セーフエリア内の描画領域

  function readInset(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = readInset('--sat'), b = readInset('--sab'), l = readInset('--sal'), r = readInset('--sar');
    box = { x0: l, y0: t, x1: W - r, y1: H - b };
    box.w = box.x1 - box.x0; box.h = box.y1 - box.y0; box.s = Math.min(box.w, box.h);
    relayout();
  }
  const px = (nx) => box.x0 + nx * box.w;
  const py = (ny) => box.y0 + ny * box.h;
  const pr = (nr) => nr * box.s;

  // ---------- 状態 ----------
  let levelIndex = 0;
  let level = null;      // 現在のレベル定義
  let ents = [];         // 動く円 (player 含む)
  let player = null;
  let ring = null;
  let phase = 'play';    // play | capture | expand | enter | celebrate
  let phaseT = 0;
  let nextBg = null;
  let bgColor = '#fff';
  let particles = [];
  let now = 0, lastTouch = 0, demoT = -1;
  const pointer = { down: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 };
  const ghost = { active: false, t: 0 };

  function loadProgress() {
    try { const v = parseInt(localStorage.getItem(STORAGE_KEY), 10); if (v >= 0 && v < LEVELS.length) return v; } catch (e) {}
    return 0;
  }
  function saveProgress(i) { try { localStorage.setItem(STORAGE_KEY, String(i)); } catch (e) {} }

  function makeEnt(def, id, kind) {
    return {
      id, kind, type: def.type || kind,
      nx: def.x, ny: def.y, x: px(def.x), y: py(def.y),
      nr: def.r, r: pr(def.r), baseR: def.r, scale: 1,
      minScale: def.minScale || 1, maxScale: def.maxScale || 1,
      color: def.color || window.COLORS.player,
      vx: 0, vy: 0, pop: 0, touching: false, captured: false, wobble: 0,
    };
  }

  function loadLevel(i, opts) {
    levelIndex = i;
    level = LEVELS[i];
    bgColor = level.bg;
    document.body.style.background = bgColor;
    ents = [];
    player = makeEnt(level.player, 'player', 'player');
    ents.push(player);
    for (const d of level.items) ents.push(makeEnt(d, d.id, d.type));
    ring = { def: level.ring, target: null, glow: 0, fill: 0, x: 0, y: 0, r: 0 };
    ring.target = ents.find(e => e.id === level.ring.target);
    relayout();
    phase = opts && opts.enter ? 'enter' : 'play';
    phaseT = 0;
    for (const e of ents) e.pop = phase === 'enter' ? 0 : 1;
    ghost.active = false; demoT = -1;
  }

  function relayout() {
    if (!level) return;
    for (const e of ents) { e.x = px(e.nx); e.y = py(e.ny); e.r = pr(e.baseR) * e.scale; }
    const d = level.ring;
    ring.r = pr(d.r);
    if (d.corner) { // 右上の角に固定 (逃げる円を追い込む)
      ring.x = box.x1 - ring.r * 1.5; ring.y = box.y0 + ring.r * 1.5;
    } else { ring.x = px(d.x); ring.y = py(d.y); }
  }
  function storeNorm(e) { e.nx = (e.x - box.x0) / box.w; e.ny = (e.y - box.y0) / box.h; }

  // ---------- 入力 ----------
  let activeId = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (activeId !== null) return;
    activeId = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    pointer.down = true; pointer.x = pointer.px = ev.clientX; pointer.y = pointer.py = ev.clientY;
    lastTouch = now; ghost.active = false;
    A.unlock(); A.touch();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== activeId) return;
    pointer.x = ev.clientX; pointer.y = ev.clientY; lastTouch = now;
  });
  function up(ev) {
    if (ev.pointerId !== activeId) return;
    activeId = null; pointer.down = false; lastTouch = now;
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));

  // ---------- ユーティリティ ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function keepInBox(e, bounce) {
    const r = e.r;
    if (e.x < box.x0 + r) { e.x = box.x0 + r; e.vx = Math.abs(e.vx) * bounce; }
    if (e.x > box.x1 - r) { e.x = box.x1 - r; e.vx = -Math.abs(e.vx) * bounce; }
    if (e.y < box.y0 + r) { e.y = box.y0 + r; e.vy = Math.abs(e.vy) * bounce; }
    if (e.y > box.y1 - r) { e.y = box.y1 - r; e.vy = -Math.abs(e.vy) * bounce; }
  }

  // ---------- 更新 ----------
  function update(dt) {
    const S = box.s;
    phaseT += dt;
    for (const e of ents) e.pop = Math.min(1, e.pop + dt * 2.2);

    if (phase === 'enter' && phaseT > 0.6) { phase = 'play'; phaseT = 0; }

    if (phase === 'play' || phase === 'enter') {
      // じぶんの円: 指についてくる
      if (pointer.down && !player.captured) {
        const k = 1 - Math.exp(-dt * 30);
        const ox = player.x, oy = player.y;
        player.x = lerp(player.x, pointer.x, k); player.y = lerp(player.y, pointer.y, k);
        player.vx = (player.x - ox) / dt; player.vy = (player.y - oy) / dt;
      } else { player.vx *= 0.8; player.vy *= 0.8; }
      keepInBox(player, 0);

      // 法則
      let droneAmt = 0;
      for (const e of ents) {
        if (e === player) continue;
        const d = dist(e, player);
        const gap = d - (e.r + player.r);
        const n = d > 1e-3 ? { x: (e.x - player.x) / d, y: (e.y - player.y) / d } : { x: 0, y: -1 };

        if (e.type === 'grow' || e.type === 'shrink') {
          const range = 0.14 * S;
          const f = clamp(1 - gap / range, 0, 1);
          const dir = e.type === 'grow' ? 1 : -1;
          const before = player.scale;
          player.scale = clamp(player.scale + dir * f * 0.75 * dt, player.minScale, player.maxScale);
          if (player.scale !== before) droneAmt += dir * f;
          e.wobble = f;
        }
        if (e.type === 'push') {
          if (gap < 0) {
            const wasTouching = e.touching;
            e.touching = true;
            // 重なりを解消して速度を与える (物理的因果)
            e.x += n.x * -gap; e.y += n.y * -gap;
            const pv = player.vx * n.x + player.vy * n.y;
            const push = Math.max(pv, 0.3 * S) ;
            e.vx = n.x * push * 0.9 + e.vx * 0.2; e.vy = n.y * push * 0.9 + e.vy * 0.2;
            if (!wasTouching) A.bump(clamp(Math.hypot(player.vx, player.vy) / (2 * S), 0.2, 1));
          } else e.touching = false;
          const damp = Math.exp(-dt * 2.2);
          e.vx *= damp; e.vy *= damp;
          e.x += e.vx * dt; e.y += e.vy * dt;
          keepInBox(e, 0.35);
        }
        if (e.type === 'flee' && !e.captured) {
          const range = 0.38 * S;
          if (d < range) {
            const f = 1 - d / range;
            e.vx += n.x * f * 9 * S * dt; e.vy += n.y * f * 9 * S * dt;
            e.wobble = f;
          } else {
            e.wobble = 0;
            // 指が遠いと輪の方へゆっくり流れる (世界が手助けする)
            const rd = dist(ring, e);
            if (rd > 1) { e.vx += (ring.x - e.x) / rd * 0.5 * S * dt; e.vy += (ring.y - e.y) / rd * 0.5 * S * dt; }
          }
          const sp = Math.hypot(e.vx, e.vy), max = 1.5 * S;
          if (sp > max) { e.vx *= max / sp; e.vy *= max / sp; }
          const damp = Math.exp(-dt * 3);
          e.vx *= damp; e.vy *= damp;
          e.x += e.vx * dt; e.y += e.vy * dt;
          keepInBox(e, 0);
        }
        if (e.type === 'follow' && !e.captured) {
          const want = player.r + e.r + 0.03 * S;
          const tx = player.x + n.x * want, ty = player.y + n.y * want;
          e.vx += (tx - e.x) * 14 * dt; e.vy += (ty - e.y) * 14 * dt;
          const sp = Math.hypot(e.vx, e.vy), max = 2.2 * S;
          if (sp > max) { e.vx *= max / sp; e.vy *= max / sp; }
          const damp = Math.exp(-dt * 4);
          e.vx *= damp; e.vy *= damp;
          e.x += e.vx * dt; e.y += e.vy * dt;
          keepInBox(e, 0);
          e.wobble = clamp(sp / S, 0, 1);
        }
      }
      A.drone(droneAmt, player.scale);
      player.r = pr(player.baseR) * player.scale;
      for (const e of ents) storeNorm(e);

      // 輪: 合う円が近いと光り、入れば満たされる
      const t = ring.target;
      const sizeOk = Math.abs(t.r - ring.r) < ring.r * 0.2;
      const rd = dist(ring, t);
      ring.glow = lerp(ring.glow, sizeOk ? clamp(1 - rd / (ring.r * 3.5), 0, 1) : 0, 1 - Math.exp(-dt * 8));
      const captureR = t === player ? ring.r * 0.6 : ring.r * 1.0;
      if (phase === 'play' && sizeOk && rd < captureR) {
        t.captured = true; phase = 'capture'; phaseT = 0;
        A.enter(); A.drone(0, 1);
      }
    }

    if (phase === 'capture') {
      const t = ring.target;
      const k = 1 - Math.exp(-dt * 12);
      t.x = lerp(t.x, ring.x, k); t.y = lerp(t.y, ring.y, k);
      t.r = lerp(t.r, ring.r, k);
      ring.fill = Math.min(1, phaseT / 0.45);
      ring.glow = 1;
      if (phaseT > 0.7) {
        const last = levelIndex === LEVELS.length - 1;
        if (last) { phase = 'celebrate'; phaseT = 0; spawnParticles(); A.celebrate(); saveProgress(0); }
        else { phase = 'expand'; phaseT = 0; nextBg = LEVELS[levelIndex + 1].bg; A.swell(); saveProgress(levelIndex + 1); }
      }
    }
    if (phase === 'expand' && phaseT > 1.1) {
      loadLevel((levelIndex + 1) % LEVELS.length, { enter: true });
    }
    if (phase === 'celebrate') {
      for (const p of particles) {
        p.vy += 0.9 * S * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      }
      if (phaseT > 2.8) { particles = []; phase = 'expand'; phaseT = 0; nextBg = LEVELS[0].bg; A.swell(); }
    }

    // 無操作時の誘い
    const idle = now - lastTouch;
    if (phase === 'play' && level.demo && !pointer.down && idle > 2.5) {
      if (demoT < 0 || now - demoT > 4.5) { demoT = now; ghost.active = true; ghost.t = 0; }
    }
    if (ghost.active) { ghost.t += dt / 1.6; if (ghost.t >= 1) ghost.active = false; }
  }

  function spawnParticles() {
    const S = box.s;
    const colors = Object.values(window.COLORS);
    particles = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.2) * S;
      particles.push({ x: ring.x, y: ring.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4 * S,
        r: (0.012 + Math.random() * 0.03) * S, color: colors[i % colors.length], life: 2 + Math.random() });
    }
  }

  // ---------- 描画 ----------
  function drawCircle(e, scale) {
    const r = e.r * (scale == null ? 1 : scale);
    if (r <= 0.5) return;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = r * 0.5; ctx.shadowOffsetY = r * 0.18;
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(e.x - r * 0.3, e.y - r * 0.35, r * 0.38, r * 0.26, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawAura(e) {
    // あたたかい円: 外へ広がる波 / つめたい円: 内へ縮む波
    const out = e.type === 'grow';
    for (let i = 0; i < 3; i++) {
      const p = ((now * 0.45 + i / 3) % 1);
      const rr = out ? e.r * (1 + p * 1.4) : e.r * (2.4 - p * 1.4);
      const a = (out ? (1 - p) : p) * 0.45 * (0.5 + 0.5 * e.pop);
      ctx.strokeStyle = hexA(e.color, a); ctx.lineWidth = e.r * 0.12;
      ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawRing() {
    const breath = 1 + 0.035 * Math.sin(now * 2.2);
    const r = ring.r * breath;
    const col = ring.target.color;
    ctx.save();
    if (ring.glow > 0.01) { ctx.shadowColor = hexA(col, ring.glow); ctx.shadowBlur = r * 0.9 * ring.glow; }
    ctx.lineWidth = r * 0.16 * (1 + 0.3 * ring.glow);
    ctx.strokeStyle = hexA(col, 0.55 + 0.45 * ring.glow);
    ctx.beginPath(); ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // 中身が空であることを示す薄い影
    ctx.fillStyle = hexA(col, 0.06 + 0.1 * ring.glow);
    ctx.beginPath(); ctx.arc(ring.x, ring.y, r * 0.92, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
    if (!level) return;

    drawRing();

    // デモのゴースト (レベル1のみ): じぶんの円から輪へ流れる
    if (ghost.active) {
      const t = easeInOut(ghost.t);
      const gx = lerp(player.x, ring.x, t), gy = lerp(player.y, ring.y, t);
      const a = Math.sin(ghost.t * Math.PI) * 0.45;
      ctx.fillStyle = hexA(player.color, a);
      ctx.beginPath(); ctx.arc(gx, gy, player.r, 0, Math.PI * 2); ctx.fill();
    }

    const idle = now - lastTouch;
    for (const e of ents) {
      if (e === player) continue;
      const s = easeOut(e.pop);
      if (e.type === 'grow' || e.type === 'shrink') drawAura(e);
      let jx = 0, jy = 0;
      if (e.type === 'flee' && e.wobble > 0) { jx = Math.sin(now * 40) * e.r * 0.08 * e.wobble; jy = Math.cos(now * 37) * e.r * 0.08 * e.wobble; }
      const tmp = { x: e.x + jx, y: e.y + jy, r: e.r, color: e.color };
      drawCircle(tmp, s);
    }
    // じぶんの円 (無操作時は脈動して誘う)
    let ps = easeOut(player.pop);
    if (phase === 'play' && !pointer.down && idle > 2.5) ps *= 1 + 0.06 * Math.sin(now * 5);
    drawCircle(player, ps);

    // 輪が満たされる
    if (ring.fill > 0) {
      ctx.fillStyle = hexA(ring.target.color, ring.fill);
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r * 1.08, 0, Math.PI * 2); ctx.fill();
    }

    if (phase === 'celebrate') {
      for (const p of particles) {
        if (p.life <= 0) continue;
        ctx.fillStyle = hexA(p.color, clamp(p.life, 0, 1));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 場面転換: 輪が広がって次の背景になる
    if (phase === 'expand') {
      const t = easeInOut(clamp(phaseT / 1.0, 0, 1));
      const maxR = Math.hypot(Math.max(ring.x, W - ring.x), Math.max(ring.y, H - ring.y)) + 10;
      const r = lerp(ring.r, maxR, t);
      ctx.fillStyle = nextBg;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(ring.target.color, 1 - t); ctx.lineWidth = ring.r * 0.16;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ---------- ループ ----------
  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts; now = ts / 1000;
    update(dt); draw();
    requestAnimationFrame(frame);
  }

  resize();
  loadLevel(loadProgress(), { enter: true });
  lastTouch = performance.now() / 1000;
  requestAnimationFrame(frame);

  // 自動テスト用フック (文字を表示しない)
  window.__game = { get ghost() { return ghost; }, get levelIndex() { return levelIndex; }, get phase() { return phase; }, get ents() { return ents; }, get ring() { return ring; }, get player() { return player; }, get box() { return box; }, loadLevel };
})();
