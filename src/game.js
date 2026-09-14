// ゲーム本体: 状態・更新・描画。文字やUI部品は一切描かない。
import { N, SIDES, SIDE_INFO, parseLevel, composite, bfs, nearestReachable, canFold, canUnfold, inZone } from './paper.js';
import { nextFoldHint } from './solver.js';
import { LEVELS } from './levels.js';
import { renderFaces } from './faces.js';
import { drawHana, drawGrandma, drawMom, drawSparkle, drawDesk, drawTree, drawFlower, SCENES, INK } from './art.js';
import * as sfx from './audio.js';
import { attachInput } from './input.js';

const SAVE_KEY = 'orimichi.level';
const WALK_SPEED = 2.4; // tiles / s
const BLOCK_CAP = 0.75;
const STIFF_CAP = 0.28;
const HINT_FIRST = 8;
const HINT_REPEAT = 12;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  const G = {
    W: 0, H: 0, dpr: 1, S: 0, px: 0, py: 0, T: 0, M: 0, P: 0,
    stack: { x: 0, y: 0, s: 0 },
    desk: null,
    facesCache: new Map(),
    levelIndex: 0,
    level: null,
    fold: null,
    theta: { L: 0, R: 0, T: 0, B: 0 },
    active: null, // { side, mode:'drag'|'settle', target, startTheta, d0, bumped }
    hint: null, // { side, t, dur, base }
    hana: null,
    grandma: { pose: 'wave' },
    phase: 'play',
    phaseT: 0,
    flight: null, // { faces, from, to, dir }
    thumbs: [],
    particles: [],
    rain: [],
    time: 0,
    nextHintAt: HINT_FIRST,
    down: null,
    dark: null,
  };

  // ---------- レイアウト ----------
  function resize() {
    G.dpr = Math.min(window.devicePixelRatio || 1, 3);
    G.W = window.innerWidth;
    G.H = window.innerHeight;
    canvas.width = Math.round(G.W * G.dpr);
    canvas.height = Math.round(G.H * G.dpr);
    canvas.style.width = G.W + 'px';
    canvas.style.height = G.H + 'px';
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    const landscape = G.W > G.H;
    G.S = Math.floor(Math.min(G.W, G.H) * 0.86);
    G.T = Math.floor(G.S / (N + 2 * 0.12));
    G.M = Math.round(G.T * 0.12);
    G.P = N * G.T + 2 * G.M;
    G.px = Math.round((G.W - G.P) / 2);
    G.py = Math.round((G.H - G.P) / 2);
    if (landscape) {
      G.stack = { x: G.px / 2, y: G.H / 2, s: Math.min(G.px * 0.62, G.P * 0.3) };
    } else {
      G.stack = { x: G.W / 2, y: G.py / 2, s: Math.min(G.py * 0.62, G.P * 0.3) };
    }
    G.desk = document.createElement('canvas');
    G.desk.width = Math.round(G.W * G.dpr);
    G.desk.height = Math.round(G.H * G.dpr);
    const dg = G.desk.getContext('2d');
    dg.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    drawDesk(dg, G.W, G.H);
    G.facesCache.clear();
    G.dark = document.createElement('canvas');
    G.dark.width = Math.round(G.P * G.dpr);
    G.dark.height = Math.round(G.P * G.dpr);
    G.rain = [];
    for (let i = 0; i < 70; i++) G.rain.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.5 });
  }

  function faces(i) {
    const key = `${i}:${G.T}`;
    if (!G.facesCache.has(key)) {
      if (G.facesCache.size > 3) G.facesCache.delete(G.facesCache.keys().next().value);
      G.facesCache.set(key, renderFaces(parseLevel(LEVELS[i], i), G.T));
    }
    return G.facesCache.get(key);
  }

  function makeThumb(i) {
    const f = renderFaces(parseLevel(LEVELS[i], i), 56);
    const c = document.createElement('canvas');
    c.width = c.height = f.P;
    c.getContext('2d').drawImage(f.front, 0, 0);
    return c;
  }

  // ---------- ステージ ----------
  function loadLevel(i) {
    G.levelIndex = i;
    if (i >= LEVELS.length) {
      G.level = null;
      G.phase = 'finale';
      G.phaseT = 0;
      return;
    }
    G.level = parseLevel(LEVELS[i], i);
    G.fold = null;
    G.active = null;
    G.hint = null;
    for (const s of SIDES) G.theta[s] = 0;
    const st = G.level.start;
    G.hana = {
      r: st.r, c: st.c, x: st.c + 0.5, y: st.r + 0.5,
      path: [], seg: 0, facing: Math.sign(G.level.goal.c - st.c) || 1,
      pose: 'stand', poseUntil: 0, phase: 0, lookAt: null, stepIdx: 0,
    };
    G.grandma.pose = 'wave';
    G.phase = 'play';
    G.phaseT = 0;
    G.nextHintAt = G.time + HINT_FIRST;
    try { localStorage.setItem(SAVE_KEY, String(i)); } catch (e) { /* ignore */ }
  }

  function hanaTile() {
    // 歩行中は向かっているタイルを基準にする
    if (G.hana.path.length) return G.hana.path[0];
    return { r: G.hana.r, c: G.hana.c };
  }

  // ---------- 歩行 ----------
  function walkTo(target) {
    const grid = composite(G.level, G.fold);
    const from = hanaTile();
    const reach = bfs(grid, from);
    let dest = target;
    let look = null;
    if (!reach.has(target.r, target.c)) {
      dest = nearestReachable(reach, target) || from;
      look = target;
    }
    const path = reach.pathTo(dest.r, dest.c) || [from];
    const rest = path.slice(1);
    G.hana.path = G.hana.path.length ? [G.hana.path[0], ...rest] : rest;
    G.hana.lookAt = look;
    if (!G.hana.path.length) {
      if (look) startLook(look);
    } else {
      G.hana.pose = 'walk';
    }
  }

  function startLook(target) {
    const h = G.hana;
    const dx = target.c + 0.5 - h.x;
    if (Math.abs(dx) > 0.1) h.facing = Math.sign(dx);
    h.pose = 'look';
    h.poseUntil = G.time + 1.3;
    h.lookAt = null;
  }

  function updateHana(dt) {
    const h = G.hana;
    if (h.path.length) {
      const nxt = h.path[0];
      const tx = nxt.c + 0.5;
      const ty = nxt.r + 0.5;
      const dx = tx - h.x;
      const dy = ty - h.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = WALK_SPEED * dt;
      if (Math.abs(dx) > 0.05) h.facing = Math.sign(dx);
      const prevPhase = h.phase;
      h.phase = (h.phase + dt * 3.2) % 1;
      if (Math.floor(prevPhase * 2) !== Math.floor(h.phase * 2)) sfx.step(h.stepIdx++);
      if (dist <= stepLen) {
        h.x = tx;
        h.y = ty;
        h.r = nxt.r;
        h.c = nxt.c;
        h.path.shift();
        if (!h.path.length) {
          h.pose = 'stand';
          if (h.lookAt) startLook(h.lookAt);
          if (h.r === G.level.goal.r && h.c === G.level.goal.c && G.phase === 'play' && goalVisible()) startClear();
        }
      } else {
        h.x += (dx / dist) * stepLen;
        h.y += (dy / dist) * stepLen;
      }
    } else if (h.pose !== 'stand' && h.pose !== 'hug' && G.time > h.poseUntil) {
      h.pose = 'stand';
    }
  }

  function goalVisible() {
    const g = composite(G.level, G.fold);
    return g[G.level.goal.r][G.level.goal.c] === G.level.front[G.level.goal.r][G.level.goal.c];
  }

  // 折りが確定したあと、消えた/覆われた道の分だけ経路を切り詰める
  function truncatePath() {
    const grid = composite(G.level, G.fold);
    const h = G.hana;
    let prev = { r: h.r, c: h.c };
    for (let i = 0; i < h.path.length; i++) {
      const p = h.path[i];
      const reach = bfs(grid, prev);
      if (!reach.has(p.r, p.c)) {
        h.path = h.path.slice(0, i);
        break;
      }
      prev = p;
    }
    if (!h.path.length) h.pose = 'stand';
  }

  // ---------- 折り ----------
  function tileFromPoint(p) {
    return { u: (p.x - G.px - G.M) / G.T, v: (p.y - G.py - G.M) / G.T };
  }

  function candidateSides(u, v) {
    const slack = 0.6;
    const out = [];
    if (G.fold === null) {
      if (u < 1 && u > -slack && v > -slack && v < N + slack) out.push('L');
      if (u > N - 1 && u < N + slack && v > -slack && v < N + slack) out.push('R');
      if (v < 1 && v > -slack && u > -slack && u < N + slack) out.push('T');
      if (v > N - 1 && v < N + slack && u > -slack && u < N + slack) out.push('B');
    } else {
      const info = SIDE_INFO[G.fold];
      const a = info.axis === 'x' ? u : v;
      const b = info.axis === 'x' ? v : u;
      if (a >= info.landIdx - 0.2 && a <= info.landIdx + 1.2 && b > -slack && b < N + slack) out.push(G.fold);
    }
    return out;
  }

  function foldAllowed(side) {
    const ht = hanaTile();
    if (G.fold === null) return canFold(G.level, null, side, ht) ? 'ok' : G.level.sides.includes(side) ? 'hana' : 'stiff';
    if (side !== G.fold) return 'stiff';
    return canUnfold(G.fold, ht) ? 'ok' : 'hana';
  }

  function beginDrag(side, p) {
    const unfolding = G.fold === side;
    G.active = { side, mode: 'drag', startTheta: unfolding ? Math.PI : 0, d0: unfolding ? -1 : 1, start: tileFromPoint(p), bumped: false, crossed: false };
    G.hint = null;
    sfx.rustle(0.8);
  }

  function moveDrag(p) {
    const a = G.active;
    if (!a || a.mode !== 'drag') return;
    const info = SIDE_INFO[a.side];
    const q = tileFromPoint(p);
    const delta = info.axis === 'x' ? q.u - a.start.u : q.v - a.start.v;
    let theta = Math.acos(clamp(a.d0 + delta * info.out, -1, 1));
    const allowed = foldAllowed(a.side);
    const unfolding = a.startTheta > 0;
    if (allowed !== 'ok') {
      const cap = allowed === 'hana' ? BLOCK_CAP : STIFF_CAP;
      const capped = unfolding ? Math.max(theta, Math.PI - cap) : Math.min(theta, cap);
      if (capped !== theta && !a.bumped) {
        a.bumped = true;
        if (allowed === 'hana') {
          sfx.boing();
          G.hana.pose = 'duck';
          G.hana.poseUntil = G.time + 0.6;
        } else {
          sfx.flutter();
        }
      }
      theta = capped;
    }
    const wasCrossed = a.crossed;
    a.crossed = unfolding ? theta < Math.PI / 2 : theta > Math.PI / 2;
    if (a.crossed !== wasCrossed) sfx.rustle(1);
    G.theta[a.side] = theta;
  }

  function endDrag() {
    const a = G.active;
    if (!a || a.mode !== 'drag') return;
    const theta = G.theta[a.side];
    const allowed = foldAllowed(a.side) === 'ok';
    const unfolding = a.startTheta > 0;
    let target;
    if (allowed && !unfolding && theta > Math.PI / 2) target = Math.PI;
    else if (allowed && unfolding && theta < Math.PI / 2) target = 0;
    else target = a.startTheta;
    if (target === a.startTheta) sfx.flutter();
    a.mode = 'settle';
    a.target = target;
  }

  function updateSettle(dt) {
    const a = G.active;
    if (!a || a.mode !== 'settle') return;
    const cur = G.theta[a.side];
    const diff = a.target - cur;
    const step = Math.sign(diff) * Math.max(Math.abs(diff) * dt * 10, dt * 4);
    let next = Math.abs(step) >= Math.abs(diff) ? a.target : cur + step;
    G.theta[a.side] = next;
    if (next === a.target) {
      if (a.target === Math.PI && a.startTheta === 0) {
        // 確定直前にハナが入り込んでいたら戻す
        if (!canFold(G.level, null, a.side, hanaTile()) && !canFold(G.level, null, a.side, G.hana)) {
          a.target = 0;
          sfx.boing();
          return;
        }
        G.fold = a.side;
        sfx.snap();
        spawnDust(a.side);
        truncatePath();
      } else if (a.target === 0 && a.startTheta === Math.PI) {
        G.fold = null;
        sfx.unsnap();
        truncatePath();
      }
      G.active = null;
    }
  }

  function spawnDust(side) {
    const info = SIDE_INFO[side];
    for (let i = 0; i < 10; i++) {
      const t = Math.random() * N;
      const a = info.landIdx + (info.out > 0 ? 0.05 : 0.95);
      const x = info.axis === 'x' ? a : t;
      const y = info.axis === 'x' ? t : a;
      G.particles.push({ x, y, vx: (Math.random() - 0.5) * 0.6, vy: -0.3 - Math.random() * 0.5, life: 0.5 + Math.random() * 0.3, age: 0, col: 'rgba(255,250,235,0.8)', s: 0.03 + Math.random() * 0.03, kind: 'dot' });
    }
  }

  // ---------- ヒント ----------
  function updateHint(dt) {
    if (G.phase !== 'play') return;
    if (G.hint) {
      G.hint.t += dt;
      const k = G.hint.t / G.hint.dur;
      if (k >= 1) {
        G.theta[G.hint.side] = G.hint.base;
        G.hint = null;
      } else {
        const w = Math.sin(k * Math.PI * 2) ** 2 * 0.42;
        G.theta[G.hint.side] = G.hint.base === 0 ? w : Math.PI - w;
      }
      return;
    }
    if (G.active || G.time < G.nextHintAt) return;
    const h = nextFoldHint(G.level, G.fold, hanaTile());
    G.nextHintAt = G.time + HINT_REPEAT;
    if (!h) return;
    G.hint = { side: h.side, t: 0, dur: 1.4, base: h.type === 'fold' ? 0 : Math.PI };
    sfx.breeze();
  }

  // ---------- クリア / ページめくり ----------
  function startClear() {
    G.phase = 'clear';
    G.phaseT = 0;
    G.hana.path = [];
    G.hana.pose = 'stand';
    sfx.chime();
  }

  function updateClear(dt) {
    const t = G.phaseT;
    const h = G.hana;
    const gx = G.level.goal.c + 0.5;
    if (t > 0.3) {
      h.facing = 1;
      h.x += (gx - 0.14 - h.x) * Math.min(1, dt * 6);
      h.pose = 'hug';
      G.grandma.pose = 'hug';
      if (t - dt <= 0.3) sfx.hug();
    }
    if (t > 0.4 && Math.random() < dt * 14) {
      G.particles.push({ x: gx + (Math.random() - 0.5) * 0.8, y: G.level.goal.r + 0.3 + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.4, life: 0.9, age: 0, col: Math.random() < 0.5 ? '#ffd84a' : '#ff8fb8', s: 0.06 + Math.random() * 0.05, kind: 'star' });
    }
    if (t > 2.0) startTurn();
  }

  function startTurn() {
    const f = faces(G.levelIndex);
    const thumb = makeThumb(G.levelIndex);
    G.flight = { face: f.front, thumb, dir: 'out', rot: (Math.random() - 0.5) * 0.5 };
    G.phase = 'turn';
    G.phaseT = 0;
    sfx.whoosh();
    loadLevel(G.levelIndex + 1);
    G.phase = 'turn';
  }

  function updateTurn(dt) {
    if (G.phaseT > 1.1) {
      G.thumbs.push({ c: G.flight.thumb, rot: G.flight.rot });
      G.flight = null;
      G.phase = G.level ? 'play' : 'finale';
      G.phaseT = 0;
      G.nextHintAt = G.time + HINT_FIRST;
    }
  }

  function startBack() {
    if (G.levelIndex === 0 || !G.thumbs.length) return;
    const prev = G.levelIndex - 1;
    const f = faces(prev);
    const th = G.thumbs.pop();
    G.flight = { face: f.front, thumb: th.c, dir: 'in', rot: th.rot };
    G.phase = 'back';
    G.phaseT = 0;
    sfx.whoosh();
    loadLevel(prev);
    G.phase = 'back';
  }

  function updateBack() {
    if (G.phaseT > 1.0) {
      G.flight = null;
      G.phase = 'play';
      G.phaseT = 0;
      G.nextHintAt = G.time + HINT_FIRST;
    }
  }

  function restart() {
    G.phase = 'scatter';
    G.phaseT = 0;
    sfx.whoosh();
  }

  function updateScatter() {
    if (G.phaseT > 1.0) {
      G.thumbs = [];
      loadLevel(0);
    }
  }

  // ---------- 入力 ----------
  function onDown(p) {
    sfx.unlock();
    G.nextHintAt = G.time + HINT_FIRST;
    G.down = { p, sides: [] };
    if (G.phase !== 'play') return;
    const { u, v } = tileFromPoint(p);
    G.down.sides = candidateSides(u, v);
  }

  function onDragStart(start, cur) {
    if (G.phase !== 'play' || !G.down || !G.down.sides.length || G.active) return;
    let side = G.down.sides[0];
    if (G.down.sides.length > 1) {
      const dx = Math.abs(cur.x - start.x);
      const dy = Math.abs(cur.y - start.y);
      const horiz = dx >= dy;
      side = G.down.sides.find((s) => (SIDE_INFO[s].axis === 'x') === horiz) || side;
    }
    beginDrag(side, start);
    moveDrag(cur);
  }

  function onDragMove(start, cur) {
    moveDrag(cur);
  }

  function onDragEnd() {
    sfx.unlock();
    endDrag();
    G.down = null;
  }

  function onTap(p) {
    sfx.unlock();
    G.down = null;
    if (G.phase === 'finale') {
      if (G.phaseT > 2.5) restart();
      return;
    }
    if (G.phase !== 'play') return;
    // 積まれた紙をタップ → 1面戻る
    if (Math.hypot(p.x - G.stack.x, p.y - G.stack.y) < G.stack.s * 0.6 && G.thumbs.length) {
      startBack();
      return;
    }
    const { u, v } = tileFromPoint(p);
    if (u < -0.5 || v < -0.5 || u > N + 0.5 || v > N + 0.5) return;
    const target = { r: clamp(Math.floor(v), 0, N - 1), c: clamp(Math.floor(u), 0, N - 1) };
    walkTo(target);
  }

  // ---------- 更新 ----------
  function update(dt) {
    G.time += dt;
    G.phaseT += dt;
    // 端の呼吸(つまめることの合図)
    if (G.level) {
      for (const s of SIDES) {
        if (G.active && G.active.side === s) continue;
        if (G.hint && G.hint.side === s) continue;
        if (G.fold === s) G.theta[s] = Math.PI;
        else if (G.fold === null && G.level.sides.includes(s)) G.theta[s] = 0.13 + 0.07 * Math.sin(G.time * 1.4 + SIDES.indexOf(s) * 1.7);
        else G.theta[s] = 0;
      }
    }
    if (G.phase === 'play') {
      updateHana(dt);
      updateSettle(dt);
      updateHint(dt);
    } else if (G.phase === 'clear') updateClear(dt);
    else if (G.phase === 'turn') updateTurn(dt);
    else if (G.phase === 'back') updateBack();
    else if (G.phase === 'scatter') updateScatter();
    for (const p of G.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.3 * dt;
    }
    G.particles = G.particles.filter((p) => p.age < p.life);
    if (G.level && SCENES[G.level.scene].rain) {
      for (const d of G.rain) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.25;
        if (d.y > 1.1) { d.y = -0.1; d.x = Math.random() * 1.2; }
        if (d.x < -0.1) d.x += 1.2;
      }
    }
  }

  // ---------- 描画 ----------
  function drawFlap(f, side, theta) {
    const info = SIDE_INFO[side];
    const L = f.T + f.M;
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    const creasePx = (info.axis === 'x' ? G.px : G.py) + f.M + info.crease * f.T;
    // 元の位置を机に戻す
    ctx.save();
    ctx.beginPath();
    if (info.axis === 'x') ctx.rect(info.out > 0 ? creasePx : creasePx - L, G.py, L, f.P);
    else ctx.rect(G.px, info.out > 0 ? creasePx : creasePx - L, f.P, L);
    ctx.clip();
    ctx.drawImage(G.desk, 0, 0, G.desk.width, G.desk.height, 0, 0, G.W, G.H);
    ctx.restore();
    // 影
    if (sn > 0.02) {
      const edge = creasePx + info.out * L * cs;
      const lo = Math.min(creasePx, edge);
      const hi = Math.max(creasePx, edge);
      ctx.fillStyle = `rgba(40,25,10,${0.12 * sn})`;
      if (info.axis === 'x') ctx.fillRect(lo, G.py, hi - lo, f.P);
      else ctx.fillRect(G.px, lo, f.P, hi - lo);
      const bw = f.T * (0.08 + 0.3 * sn);
      const dir = cs >= 0 ? info.out : -info.out;
      const sh = Math.min(1, sn * 4);
      const g0 = info.axis === 'x' ? ctx.createLinearGradient(edge, 0, edge + dir * bw, 0) : ctx.createLinearGradient(0, edge, 0, edge + dir * bw);
      g0.addColorStop(0, `rgba(40,25,10,${0.3 * sh})`);
      g0.addColorStop(1, 'rgba(40,25,10,0)');
      ctx.fillStyle = g0;
      if (info.axis === 'x') ctx.fillRect(Math.min(edge, edge + dir * bw), G.py, bw, f.P);
      else ctx.fillRect(G.px, Math.min(edge, edge + dir * bw), f.P, bw);
    }
    // フラップ本体
    ctx.save();
    if (info.axis === 'x') ctx.translate(creasePx, G.py);
    else ctx.translate(G.px, creasePx);
    let dx = 0;
    let dy = 0;
    if (cs >= 0) {
      if (info.axis === 'x') { ctx.scale(Math.max(cs, 0.001), 1); dx = info.out > 0 ? 0 : -L; }
      else { ctx.scale(1, Math.max(cs, 0.001)); dy = info.out > 0 ? 0 : -L; }
      if (info.axis === 'x') ctx.drawImage(f.front, info.out > 0 ? f.M + info.crease * f.T : 0, 0, L, f.P, dx, 0, L, f.P);
      else ctx.drawImage(f.front, 0, info.out > 0 ? f.M + info.crease * f.T : 0, f.P, L, 0, dy, f.P, L);
    } else {
      if (info.axis === 'x') { ctx.scale(Math.max(-cs, 0.001), 1); dx = info.out > 0 ? -L : 0; }
      else { ctx.scale(1, Math.max(-cs, 0.001)); dy = info.out > 0 ? -L : 0; }
      if (info.axis === 'x') ctx.drawImage(f.backs[side], dx, 0);
      else ctx.drawImage(f.backs[side], 0, dy);
    }
    ctx.fillStyle = `rgba(30,20,10,${0.3 * sn})`;
    if (info.axis === 'x') ctx.fillRect(dx, 0, L, f.P);
    else ctx.fillRect(0, dy, f.P, L);
    ctx.restore();
  }

  function drawPaperShadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(x + w * 0.02, y + h * 0.03, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(x + w * 0.008, y + h * 0.012, w, h);
  }

  function tileX(u) { return G.px + G.M + u * G.T; }
  function tileY(v) { return G.py + G.M + v * G.T; }

  function drawCharacters(f) {
    const lv = G.level;
    const t = G.time;
    const st = lv.front[lv.start.r][lv.start.c];
    if (st.deco === 'house') drawMom(ctx, tileX(lv.start.c + 0.8), tileY(lv.start.r + 0.66), G.T, t);
    if (goalVisible()) {
      const gx = tileX(lv.goal.c + 0.62);
      const gy = tileY(lv.goal.r + 0.78);
      const bounce = G.phase === 'clear' && G.phaseT > 0.3 ? Math.abs(Math.sin(G.phaseT * 8)) * G.T * 0.04 : 0;
      drawGrandma(ctx, gx, gy - bounce, G.T, t, G.grandma.pose, -1);
    }
    const h = G.hana;
    const bounce = G.phase === 'clear' && G.phaseT > 0.3 ? Math.abs(Math.sin(G.phaseT * 8 + 1)) * G.T * 0.04 : 0;
    drawHana(ctx, tileX(h.x), tileY(h.y + 0.28) - bounce, G.T, { facing: h.facing, phase: h.phase, pose: h.pose });
  }

  function drawOverlays(f) {
    const pal = f.pal;
    if (pal.dark) {
      const d = G.dark.getContext('2d');
      d.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, G.P, G.P);
      d.fillStyle = 'rgba(8,4,20,0.62)';
      d.fillRect(0, 0, G.P, G.P);
      d.globalCompositeOperation = 'destination-out';
      const lights = [{ x: G.hana.x, y: G.hana.y, r: 1.3 }];
      const lv = G.level;
      if (goalVisible()) lights.push({ x: lv.goal.c + 0.5, y: lv.goal.r + 0.5, r: 1.0 });
      const grid = composite(lv, G.fold);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] && grid[r][c].deco === 'lantern') lights.push({ x: c + 0.5, y: r + 0.4, r: 1.1 });
      for (const l of lights) {
        const cx = G.M + l.x * G.T;
        const cy = G.M + l.y * G.T;
        const rad = l.r * G.T * (1 + 0.03 * Math.sin(G.time * 7 + l.x));
        const g = d.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = g;
        d.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
      ctx.drawImage(G.dark, 0, 0, G.dark.width, G.dark.height, G.px, G.py, G.P, G.P);
    }
    if (pal.rain) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(G.px, G.py, G.P, G.P);
      ctx.clip();
      ctx.strokeStyle = 'rgba(70,90,140,0.35)';
      ctx.lineWidth = Math.max(1, G.T * 0.015);
      ctx.lineCap = 'round';
      for (const d of G.rain) {
        const x = G.px + d.x * G.P;
        const y = G.py + d.y * G.P;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - G.T * 0.05, y + G.T * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of G.particles) {
      const a = 1 - p.age / p.life;
      const x = tileX(p.x);
      const y = tileY(p.y);
      if (p.kind === 'star') drawSparkle(ctx, x, y, p.s * G.T * (0.6 + a), p.col, a);
      else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(x, y, p.s * G.T, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawStack(skipTop) {
    const st = G.stack;
    const n = G.thumbs.length - (skipTop ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const th = G.thumbs[i];
      let ox = 0;
      let oy = 0;
      let rot = th.rot;
      if (G.phase === 'scatter') {
        const k = ease(Math.min(1, G.phaseT));
        ox = (i % 2 ? 1 : -1) * k * G.W * 0.8;
        oy = -k * G.H * (0.4 + i * 0.05);
        rot += k * 3;
      }
      ctx.save();
      ctx.translate(st.x + ox + i * 1.5, st.y + oy - i * 1.5);
      ctx.rotate(rot);
      drawPaperShadow(-st.s / 2, -st.s / 2, st.s, st.s);
      ctx.drawImage(th.c, -st.s / 2, -st.s / 2, st.s, st.s);
      ctx.restore();
    }
  }

  function drawFlight() {
    const fl = G.flight;
    if (!fl) return;
    const k = ease(clamp(G.phaseT / 1.0, 0, 1));
    const from = fl.dir === 'out' ? { x: G.px + G.P / 2, y: G.py + G.P / 2, s: G.P, r: 0 } : { x: G.stack.x, y: G.stack.y, s: G.stack.s, r: fl.rot };
    const to = fl.dir === 'out' ? { x: G.stack.x, y: G.stack.y, s: G.stack.s, r: fl.rot } : { x: G.px + G.P / 2, y: G.py + G.P / 2, s: G.P, r: 0 };
    const lift = Math.sin(k * Math.PI);
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k - lift * G.T * 0.6;
    const s = (from.s + (to.s - from.s) * k) * (1 + lift * 0.08);
    const r = from.r + (to.r - from.r) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.fillStyle = `rgba(0,0,0,${0.15 + lift * 0.15})`;
    ctx.fillRect(-s / 2 + s * 0.02 + lift * s * 0.05, -s / 2 + s * 0.03 + lift * s * 0.08, s, s);
    ctx.drawImage(fl.face, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  function drawFinale() {
    // おばあちゃんの家でお茶。文字なし。
    const P = G.P;
    const T = G.T;
    const x0 = G.px;
    const y0 = G.py;
    const f = renderFinaleFace();
    ctx.drawImage(f, x0, y0, P, P);
    const t = G.time;
    // 湯気
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i * 0.33) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
      ctx.lineWidth = T * 0.03;
      ctx.beginPath();
      const sx = x0 + P * 0.5 + (i - 1) * T * 0.12;
      const sy = y0 + P * 0.58 - ph * T * 0.5;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + T * 0.06, sy - T * 0.12, sx, sy - T * 0.24);
      ctx.stroke();
    }
    drawGrandma(ctx, x0 + P * 0.62, y0 + P * 0.72, T * 1.4, t, 'wave', -1);
    drawHana(ctx, x0 + P * 0.38, y0 + P * 0.72, T * 1.4, { facing: 1, phase: 0, pose: G.phaseT % 2 < 1 ? 'stand' : 'look' });
    if (Math.random() < 0.15) {
      G.particles.push({ x: Math.random() * N, y: N + 0.2, vx: (Math.random() - 0.5) * 0.2, vy: -0.5 - Math.random() * 0.4, life: 2.5, age: 0, col: Math.random() < 0.5 ? '#ffd84a' : '#ff8fb8', s: 0.05, kind: 'star' });
    }
  }

  let finaleFace = null;
  function renderFinaleFace() {
    if (finaleFace && finaleFace.width === Math.round(G.P)) return finaleFace;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(G.P);
    const g = c.getContext('2d');
    const T = G.T;
    const P = G.P;
    g.fillStyle = '#f5ecd9';
    g.fillRect(0, 0, P, P);
    g.fillStyle = SCENES.village.grass;
    g.fillRect(0, P * 0.55, P, P * 0.45);
    // 大きな家
    g.fillStyle = '#f7efdc';
    g.fillRect(P * 0.2, P * 0.28, P * 0.6, P * 0.3);
    g.fillStyle = '#5b8bd6';
    g.beginPath();
    g.moveTo(P * 0.14, P * 0.3);
    g.lineTo(P * 0.5, P * 0.06);
    g.lineTo(P * 0.86, P * 0.3);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = T * 0.035;
    g.lineJoin = 'round';
    g.strokeRect(P * 0.2, P * 0.28, P * 0.6, P * 0.3);
    g.beginPath();
    g.moveTo(P * 0.14, P * 0.3);
    g.lineTo(P * 0.5, P * 0.06);
    g.lineTo(P * 0.86, P * 0.3);
    g.stroke();
    g.fillStyle = '#9fd3ef';
    g.fillRect(P * 0.28, P * 0.36, P * 0.12, P * 0.12);
    g.fillRect(P * 0.6, P * 0.36, P * 0.12, P * 0.12);
    g.strokeRect(P * 0.28, P * 0.36, P * 0.12, P * 0.12);
    g.strokeRect(P * 0.6, P * 0.36, P * 0.12, P * 0.12);
    // テーブルとカップ
    g.fillStyle = '#c4915c';
    g.fillRect(P * 0.4, P * 0.6, P * 0.2, P * 0.05);
    g.fillRect(P * 0.47, P * 0.65, P * 0.06, P * 0.08);
    g.strokeRect(P * 0.4, P * 0.6, P * 0.2, P * 0.05);
    g.fillStyle = '#ffffff';
    g.fillRect(P * 0.46, P * 0.55, P * 0.08, P * 0.05);
    g.strokeRect(P * 0.46, P * 0.55, P * 0.08, P * 0.05);
    drawTree(g, P * 0.1, P * 0.62, T * 1.2);
    drawTree(g, P * 0.92, P * 0.66, T * 1.0);
    for (let i = 0; i < 14; i++) drawFlower(g, P * (0.05 + Math.random() * 0.9), P * (0.8 + Math.random() * 0.18), T * 0.06, SCENES.village.flower[i % 3]);
    finaleFace = c;
    return c;
  }

  function render() {
    ctx.drawImage(G.desk, 0, 0, G.desk.width, G.desk.height, 0, 0, G.W, G.H);
    drawStack(G.phase === 'back');
    if (G.phase === 'finale' || (G.phase === 'turn' && !G.level)) {
      drawPaperShadow(G.px, G.py, G.P, G.P);
      drawFinale();
      drawParticles();
      drawFlight();
      return;
    }
    if (!G.level) return;
    const f = faces(G.levelIndex);
    drawPaperShadow(G.px, G.py, G.P, G.P);
    ctx.drawImage(f.front, G.px, G.py);
    // フラップ: 折られている辺→呼吸している辺→操作中の辺 の順
    const order = SIDES.slice().sort((a, b) => (G.active && G.active.side === a ? 1 : 0) - (G.active && G.active.side === b ? 1 : 0));
    for (const s of order) {
      const th = G.theta[s];
      if (th > 0.001) drawFlap(f, s, th);
    }
    if (G.phase !== 'back') drawCharacters(f);
    drawOverlays(f);
    drawParticles();
    drawFlight();
  }

  // ---------- 起動 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function start() {
    resize();
    window.addEventListener('resize', () => resize());
    window.addEventListener('orientationchange', () => setTimeout(resize, 150));
    let saved = 0;
    try { saved = clamp(parseInt(localStorage.getItem(SAVE_KEY) || '0', 10) || 0, 0, LEVELS.length); } catch (e) { /* ignore */ }
    for (let i = 0; i < Math.min(saved, LEVELS.length); i++) G.thumbs.push({ c: makeThumb(i), rot: (Math.random() - 0.5) * 0.5 });
    loadLevel(saved);
    attachInput(canvas, { onDown, onDragStart, onDragMove, onDragEnd, onTap });
    requestAnimationFrame(frame);
  }

  return { start, G, loadLevel };
}
