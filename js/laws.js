// 円の法則 (物理) と、法則ごとの描画上のしるし。
// 種類: grow / shrink / push / flee / follow / wall / sticky / merge / split / piece / orbit / dye / paint / warp / flow
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isWall = (e) => e.type === 'wall';
  const isField = (e) => e.type === 'flow' || e.type === 'warp' || e.type === 'paint';
  const isMover = (e) => !isWall(e) && !isField(e) && !e.captured && !e.dead && !(e.type === 'orbit' && !e.free);
  const PAINT_ORDER = ['#FF3B30', '#3D5AFE', '#2ECC40', '#FFD600'];

  // 帯の中にいるか。中なら流れの速度ベクトル (px/s) を返す
  function flowAt(f, p, S) {
    const dx = p.x - f.x, dy = p.y - f.y;
    const u = dx * f.dirX + dy * f.dirY, v = -dx * f.dirY + dy * f.dirX;
    if (Math.abs(u) > f.len / 2 || Math.abs(v) > f.wid / 2) return null;
    return { x: f.dirX * f.speed * S, y: f.dirY * f.speed * S };
  }

  // 渦: 中心近くに入った円を、対の渦から出す
  function warpCheck(e, warps, A) {
    let inside = null;
    for (const w of warps) if (dist(e, w) < w.r * 1.1) inside = w;
    if (!inside) { e.inWarp = null; return; }
    if (e.inWarp === inside.id) return;
    if (dist(e, inside) > inside.r * 0.6) return;
    const pair = warps.find(w => w.id === inside.pair);
    if (!pair) return;
    e.x = pair.x; e.y = pair.y; e.inWarp = pair.id; e.warped = true; e.pop = 0.3;
    if (A) A.warp();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function keepInBox(e, box, bounce) {
    const r = e.r;
    if (e.x < box.x0 + r) { e.x = box.x0 + r; e.vx = Math.abs(e.vx) * bounce; }
    if (e.x > box.x1 - r) { e.x = box.x1 - r; e.vx = -Math.abs(e.vx) * bounce; }
    if (e.y < box.y0 + r) { e.y = box.y0 + r; e.vy = Math.abs(e.vy) * bounce; }
    if (e.y > box.y1 - r) { e.y = box.y1 - r; e.vy = -Math.abs(e.vy) * bounce; }
  }

  // 壁との衝突: 重なりを解消し、壁を少し凹ませる
  function collideWalls(e, walls, box, A, dt) {
    let hit = false;
    for (const w of walls) {
      const d = dist(e, w);
      const min = e.r + w.r;
      if (d < min && d > 1e-3) {
        const nx = (e.x - w.x) / d, ny = (e.y - w.y) / d;
        const over = min - d;
        e.x += nx * over; e.y += ny * over;
        const vn = e.vx * nx + e.vy * ny;
        if (vn < 0) { e.vx -= nx * vn * 1.3; e.vy -= ny * vn * 1.3; }
        w.dent = { nx: -nx, ny: -ny, amt: clamp(over / w.r * 3, 0.15, 1) };
        w.dentT = 1;
        if (!e.wallTouch && A) A.wall();
        hit = true;
      }
    }
    e.wallTouch = hit;
  }

  // 画面の端や角に押し込まれた円は、内側へゆっくり戻る (行き詰まりを作らない)
  // 戻る幅は「じぶんの円が裏側に入れる」だけ空ける
  function edgeRepel(e, box, dt) {
    const S = box.s, m = e.r + 0.18 * S;
    const f = (over) => clamp(over / m, 0, 1) * 1.6 * S * dt;
    if (e.x < box.x0 + m) e.vx += f(box.x0 + m - e.x);
    if (e.x > box.x1 - m) e.vx -= f(e.x - (box.x1 - m));
    if (e.y < box.y0 + m) e.vy += f(box.y0 + m - e.y);
    if (e.y > box.y1 - m) e.vy -= f(e.y - (box.y1 - m));
  }

  function integrate(e, dt, damp, maxSpeed) {
    const sp = Math.hypot(e.vx, e.vy);
    if (maxSpeed && sp > maxSpeed) { e.vx *= maxSpeed / sp; e.vy *= maxSpeed / sp; }
    const k = Math.exp(-dt * damp);
    e.vx *= k; e.vy *= k;
    e.x += e.vx * dt; e.y += e.vy * dt;
  }

  // 壁が邪魔なら、壁の縁を回り込む目標点に置き換える (ついてくる円が挟まらない)
  function blocked(e, target, walls) {
    for (const w of walls) {
      const dx = target.x - e.x, dy = target.y - e.y, L = Math.hypot(dx, dy) || 1;
      const t = clamp(((w.x - e.x) * dx + (w.y - e.y) * dy) / (L * L), 0, 1);
      if (t > 0 && Math.hypot(e.x + dx * t - w.x, e.y + dy * t - w.y) < w.r + e.r + 6) return true;
    }
    return false;
  }
  function steer(e, target, walls, box, warps) {
    // 相手が壁で見えないなら、まっすぐ行ける渦へ (渦の向こうで会える)
    if (warps && warps.length && blocked(e, target, walls)) {
      const w = warps.filter(w => !blocked(e, w, walls)).sort((a, b) => dist(a, e) - dist(b, e))[0];
      if (w) return { x: w.x, y: w.y };
    }
    for (const w of walls) {
      const dx = target.x - e.x, dy = target.y - e.y, L = Math.hypot(dx, dy) || 1;
      const t = clamp(((w.x - e.x) * dx + (w.y - e.y) * dy) / (L * L), 0, 1);
      const cx = e.x + dx * t, cy = e.y + dy * t;
      const need = w.r + e.r + 6;
      if (Math.hypot(cx - w.x, cy - w.y) >= need || t <= 0) continue;
      let px = -dy / L, py = dx / L;
      if ((e.x - w.x) * px + (e.y - w.y) * py < 0) { px = -px; py = -py; }
      const ok = (q) => q.x > box.x0 + e.r && q.x < box.x1 - e.r && q.y > box.y0 + e.r && q.y < box.y1 - e.r &&
        !walls.some(o => o !== w && Math.hypot(q.x - o.x, q.y - o.y) < o.r + e.r);
      const a = { x: w.x + px * (need + 4), y: w.y + py * (need + 4) };
      const b = { x: w.x - px * (need + 4), y: w.y - py * (need + 4) };
      if (ok(a)) return a;
      if (ok(b)) return b;
      return target;
    }
    return target;
  }

  // 追従 (ついてくる / くっついた円 / 分裂した破片)
  function follow(e, player, dt, S, stiff, damp, gapS, walls, box, warps) {
    const d = dist(e, player);
    const n = d > 1e-3 ? { x: (e.x - player.x) / d, y: (e.y - player.y) / d } : { x: 0, y: 1 };
    const want = player.r + e.r + gapS * S;
    let tgt = { x: player.x + n.x * want, y: player.y + n.y * want };
    if (walls && walls.length) tgt = steer(e, tgt, walls, box, warps);
    const tx = tgt.x, ty = tgt.y;
    e.vx += (tx - e.x) * stiff * dt; e.vy += (ty - e.y) * stiff * dt;
    e.wobble = clamp(Math.hypot(e.vx, e.vy) / S, 0, 1);
    integrate(e, dt, damp, 2.6 * S);
  }

  // 同じ種類同士の柔らかい分離 (破片が重ならない)
  function separate(list, dt) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const d = dist(a, b), min = a.r + b.r + 2;
      if (d < min && d > 1e-3) {
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d, over = (min - d) / 2;
        a.x -= nx * over; a.y -= ny * over; b.x += nx * over; b.y += ny * over;
      }
    }
  }

  function update(g) {
    const { ents, player, box, dt, A, pr } = g;
    const S = box.s;
    const walls = ents.filter(isWall);
    const flows = ents.filter(e => e.type === 'flow');
    const warps = ents.filter(e => e.type === 'warp');
    const paints = ents.filter(e => e.type === 'paint');
    const spawned = [];
    let droneAmt = 0;

    // じぶんの円 → 壁・渦・流れ
    collideWalls(player, walls, box, A, dt);
    keepInBox(player, box, 0);
    warpCheck(player, warps, A);
    player.flow = null;
    for (const f of flows) { const v = flowAt(f, player, S); if (v) player.flow = v; }

    for (const e of ents) {
      if (e === player || isWall(e) || isField(e) || e.dead) continue;
      if (e.captured) continue;
      // 回る円: 軌道の上を回り、触れると接線方向へ飛び出す
      if (e.type === 'orbit' && !e.free) {
        e.ang += e.speed * dt;
        e.x = e.ox + Math.cos(e.ang) * e.orbitR; e.y = e.oy + Math.sin(e.ang) * e.orbitR;
        if (dist(e, player) < e.r + player.r) {
          e.free = true;
          const s = Math.sign(e.speed) || 1;
          e.vx = -Math.sin(e.ang) * s * 1.1 * S; e.vy = Math.cos(e.ang) * s * 1.1 * S;
          A.launch();
        } else continue;
      }
      // 流れ: 帯の中の円は流される
      for (const f of flows) { const v = flowAt(f, e, S); if (v) { e.vx += (v.x - e.vx) * 4 * dt; e.vy += (v.y - e.vy) * 4 * dt; } }
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
        // くっついている円も一緒に縮む/膨らむ
        for (const s of ents) if (s.type === 'sticky' && s.attached && !s.captured) {
          s.scale = clamp(s.scale + dir * f * 0.75 * dt, s.minScale, s.maxScale);
          s.r = pr(s.baseR) * s.scale;
        }
        e.wobble = f;
      }
      else if (e.type === 'push' || e.type === 'merge' || e.type === 'dye' || e.type === 'orbit') {
        if (gap < 0) {
          const was = e.touching;
          e.touching = true;
          e.x += n.x * -gap; e.y += n.y * -gap;
          const pv = player.vx * n.x + player.vy * n.y;
          const push = clamp(pv, 0.3 * S, 0.9 * S); // 速すぎる弾き飛ばしはしない
          e.vx = n.x * push * 0.9 + e.vx * 0.2; e.vy = n.y * push * 0.9 + e.vy * 0.2;
          if (!was) A.bump(clamp(Math.hypot(player.vx, player.vy) / (2 * S), 0.2, 1));
        } else e.touching = false;
        edgeRepel(e, box, dt);
        integrate(e, dt, 3.0, 1.0 * S);
        collideWalls(e, walls, box, A, dt);
        keepInBox(e, box, 0.35);
        // 染まる円: 絵の具にぶつかるとその色になる
        if (e.type === 'dye') for (const pt of paints) {
          const d = dist(e, pt), min = e.r + pt.r;
          if (d < min && d > 1e-3) {
            const nx = (e.x - pt.x) / d, ny = (e.y - pt.y) / d;
            e.x += nx * (min - d); e.y += ny * (min - d);
            e.vx = nx * 0.35 * S; e.vy = ny * 0.35 * S;
            if (e.color !== pt.color) { e.color = pt.color; e.ripple = 1; pt.ripple = 1; A.dye(Math.max(0, PAINT_ORDER.indexOf(pt.color))); }
          }
        }
      }
      else if (e.type === 'flee') {
        const range = 0.38 * S;
        if (d < range) {
          const f = 1 - d / range;
          e.vx += n.x * f * 9 * S * dt; e.vy += n.y * f * 9 * S * dt;
          e.wobble = f;
        } else {
          e.wobble = 0;
          // 指が遠いと輪の方へゆっくり流れる (世界が手助けする)
          const ring = g.rings.find(r => !r.filled && g.matches(r, e));
          if (ring) { const rd = dist(ring, e); if (rd > 1) { e.vx += (ring.x - e.x) / rd * 0.5 * S * dt; e.vy += (ring.y - e.y) / rd * 0.5 * S * dt; } }
        }
        integrate(e, dt, 3, 1.5 * S);
        collideWalls(e, walls, box, null, dt);
        keepInBox(e, box, 0);
      }
      else if (e.type === 'follow' || e.type === 'piece') {
        follow(e, player, dt, S, 14, 4, 0.03, walls, box, warps);
        collideWalls(e, walls, box, null, dt);
        keepInBox(e, box, 0);
      }
      else if (e.type === 'sticky') {
        if (!e.attached) {
          const range = 0.3 * S;
          e.pull = clamp(1 - gap / range, 0, 1);
          if (gap < 0) { e.attached = true; A.stick(); e.pull = 1; }
          else if (e.pull > 0) { // 糸に引かれて少し寄る
            e.vx -= n.x * e.pull * 1.2 * S * dt; e.vy -= n.y * e.pull * 1.2 * S * dt;
            integrate(e, dt, 4, 0.6 * S);
          }
        } else {
          follow(e, player, dt, S, 60, 9, 0.0, walls, box, warps);
        }
        collideWalls(e, walls, box, null, dt);
        keepInBox(e, box, 0);
      }
      else if (e.type === 'split') {
        e.wobble = clamp(1 - gap / (0.15 * S), 0, 1);
        if (gap < 0) {
          e.dead = true; A.split();
          const pr3 = e.r / Math.sqrt(3);
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
            spawned.push({ type: 'piece', id: e.id + '_' + i, color: e.color,
              x: e.x + Math.cos(a) * e.r * 0.5, y: e.y + Math.sin(a) * e.r * 0.5,
              r: pr3, baseR: e.baseR / Math.sqrt(3), vx: Math.cos(a) * 1.2 * S, vy: Math.sin(a) * 1.2 * S });
          }
        }
      }
    }

    // 渦: 動く円はすべて通れる。近づいた円は吸い込まれる
    for (const e of ents) {
      if (!isMover(e) || e === player) continue;
      for (const w of warps) {
        const d = dist(e, w);
        if (e.inWarp !== w.id && d < w.r * 1.8 && d > 1e-3) { const f = (1 - d / (w.r * 1.8)) * 4 * S * dt; e.vx += (w.x - e.x) / d * f; e.vy += (w.y - e.y) / d * f; }
      }
      warpCheck(e, warps, A);
    }
    // 輪は、ぴったり合う円が近くを通ると優しく引き寄せる (流れや押しで少し外れても入る)
    for (const rg of g.rings) {
      if (rg.filled) continue;
      for (const e of ents) {
        if (e === player || !isMover(e) || !g.matches(rg, e) || Math.abs(e.r - rg.r) >= rg.r * 0.12) continue;
        const d = dist(rg, e);
        if (d < rg.r * 2.6 && d > 1e-3) { // 近いほど強く、流れより優先される
          const k = clamp((1 - d / (rg.r * 2.6)) * 10 * dt, 0, 1);
          e.vx = lerp(e.vx, (rg.x - e.x) / d * 0.8 * S, k); e.vy = lerp(e.vy, (rg.y - e.y) / d * 0.8 * S, k);
        }
      }
    }
    for (const e of ents) if (e.ripple > 0) e.ripple = Math.max(0, e.ripple - dt * 1.6);

    // 合体: 同じ種類が触れると1つになる (面積保存)
    const merges = ents.filter(e => e.type === 'merge' && isMover(e));
    for (let i = 0; i < merges.length; i++) for (let j = i + 1; j < merges.length; j++) {
      const a = merges[i], b = merges[j];
      if (a.dead || b.dead) continue;
      // 輪にぴったりの大きさになった円は、それ以上合体しない (大きくなりすぎて詰まない)
      const fits = (e) => g.rings.some(r => !r.filled && g.matches(r, e) && Math.abs(e.r - r.r) < r.r * 0.12);
      if (fits(a) || fits(b)) { a.wobble = b.wobble = 0; continue; }
      if (dist(a, b) < a.r + b.r) {
        const ra = a.r * a.r, rb = b.r * b.r;
        a.x = (a.x * ra + b.x * rb) / (ra + rb); a.y = (a.y * ra + b.y * rb) / (ra + rb);
        a.baseR = Math.hypot(a.baseR, b.baseR); a.r = pr(a.baseR) * a.scale;
        a.vx = (a.vx + b.vx) / 2; a.vy = (a.vy + b.vy) / 2;
        a.pop = 0.4; b.dead = true; A.merge();
      } else {
        // 互いに向けて微かに揺れる (引き合う予感)
        a.wobble = b.wobble = 0.3;
      }
    }
    if (merges.length === 1) merges[0].wobble = 0;

    // 破片・ついてくる円同士は重ならない
    separate(ents.filter(e => (e.type === 'piece' || e.type === 'follow' || (e.type === 'sticky' && e.attached)) && isMover(e)), dt);
    // 押せる円同士もぶつかる (合体する円は上で処理済み)
    separate(ents.filter(e => (e.type === 'push' || e.type === 'dye' || (e.type === 'orbit' && e.free)) && isMover(e)), dt);

    // 壁の凹みは戻る
    for (const w of walls) if (w.dentT > 0) w.dentT = Math.max(0, w.dentT - dt * 4);

    A.drone(droneAmt, player.scale);
    return spawned;
  }

  // ---- 描画上のしるし ----
  function drawFlow(ctx, f, now, S) {
    ctx.save();
    ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.dirY, f.dirX));
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath(); ctx.roundRect(-f.len / 2, -f.wid / 2, f.len, f.wid, f.wid / 2); ctx.fill();
    const n = Math.max(6, Math.round(f.len / (0.045 * S)));
    for (let i = 0; i < n; i++) {
      const p = ((now * f.speed * S / f.len) + i / n) % 1;
      const x = -f.len / 2 + p * f.len;
      const y = Math.sin(i * 12.9898) * f.wid * 0.36;
      const a = Math.sin(p * Math.PI) * 0.7;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.ellipse(x, y, 0.014 * S, 0.006 * S, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawWarp(ctx, w, now) {
    ctx.save(); ctx.translate(w.x, w.y);
    ctx.fillStyle = hexA(w.color, 0.12);
    ctx.beginPath(); ctx.arc(0, 0, w.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(w.color, 0.85); ctx.lineWidth = w.r * 0.14; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, a = -now * 3 + k * Math.PI + t * Math.PI * 1.6, rr = w.r * (0.15 + 0.8 * t);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSign(ctx, e, now) {
    if (e.type === 'orbit' && !e.free) {
      ctx.strokeStyle = hexA(e.color, 0.35); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(e.ox, e.oy, e.orbitR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#101637';
      ctx.beginPath(); ctx.arc(e.ox, e.oy, e.r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    if (e.type === 'paint') {
      const b = 1 + 0.06 * Math.sin(now * 3 + e.x);
      ctx.strokeStyle = hexA(e.color, 0.35); ctx.lineWidth = e.r * 0.1;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.25 * b, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.ripple > 0) {
      ctx.strokeStyle = hexA(e.color, e.ripple * 0.7); ctx.lineWidth = e.r * 0.12;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1 + (1 - e.ripple) * 1.5), 0, Math.PI * 2); ctx.stroke();
    }
    if (e.type === 'grow' || e.type === 'shrink') {
      const out = e.type === 'grow';
      for (let i = 0; i < 3; i++) {
        const p = ((now * 0.45 + i / 3) % 1);
        const rr = out ? e.r * (1 + p * 1.4) : e.r * (2.4 - p * 1.4);
        const a = (out ? (1 - p) : p) * 0.45 * (0.5 + 0.5 * e.pop);
        ctx.strokeStyle = hexA(e.color, a); ctx.lineWidth = e.r * 0.12;
        ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // 円本体の上に描くもの (分裂の区切り線など)
  function drawOverlay(ctx, e, now) {
    if (e.type === 'split') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = e.r * 0.06;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3) + Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * e.r * 0.92, e.y + Math.sin(a) * e.r * 0.92); ctx.stroke();
      }
    }
  }

  // くっつく円の糸
  function drawThread(ctx, e, player) {
    if (e.type !== 'sticky' || e.attached || e.captured || !(e.pull > 0)) return;
    ctx.strokeStyle = hexA(e.color, e.pull * 0.6); ctx.lineWidth = 2 + e.pull * 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
  }

  window.Laws = { update, drawSign, drawOverlay, drawThread, drawFlow, drawWarp, hexA, isWall, isField, flowAt };
})();
