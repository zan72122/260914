/**
 * barium.js — バリウム (Ba) / 緑の炎 / 「広がる」世界 (DESIGN §2.5).
 *
 * かけら: 5〜7枚の薄い緑の発光パネル。
 * 未完成の世界: 夜の暗い広場。まんなかに円形の装置（ターンテーブル）。板は倒れて散らばり、
 *   広場の輪郭だけがうっすら見える。世界はまだ広がっていない。
 * 誘い（無言）: 台の上面の円い溝を光がゆっくり周回する／板が溝の方へ傾く／
 *   ヒノコが台の上でその場でくるくる回る（動きの見本）。矢印も文字も出さない。
 * 操作: 画面のどこでもよい「ぐるぐる円運動」。中心は台に固定、半径不問、方向不問、
 *   一時停止でリセットしない、逆回しも累積、指を離すと慣性で回り続ける。2.5回転で完成。
 * 世界変化: 板が1枚ずつ起き上がって溝にはまる → 装置がまばゆく発光 →
 *   緑の波紋が地面を面で走り（1.8s）草・木・湖が生まれ → 空に緑の幕花火が横一面に開く。
 * カメラ: 低い高度で装置をオービット（入力と連動） → 発光後に大きく引いた大俯瞰。
 * 音声: 波紋が地平線に届き幕が開ききった瞬間に「バリウム」を1回だけ。
 *
 * 科学ノート: 火薬もバリウム造影剤も描かない。「光の板を並べて装置を回すと光が広がる」
 *   という抽象操作だけを扱う（§2.5）。
 *
 * NO TEXT IS EVER DRAWN.
 */

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import {
  clamp, lerp, easeOutCubic, easeInOutCubic, easeOutBack, damp
} from '../core/tween.js';
import {
  glowCircle, glowLine, radialFlood, withAlpha, lerpColor, shade, vignette, softDisc,
  cachedLinear, fillRoundRect
} from '../core/draw.js';

const DEF = ELEMENT_BY_ID['barium'];

// ---- plane geometry (world units, the device sits at the origin of the plaza plane)
const PANEL_COUNT = 6;          // §2.5 "5〜7枚"
const DEVICE_R = 58;            // turntable radius
const GROOVE_R = 42;            // the circular groove the panels snap into
const RING_R = 42;              // where a standing panel lives (the OUTER groove ring)
const DECK_Y = 9;               // deck height above the ground
const PLAZA_R = 150;
const PANEL_W = 28;
const PANEL_H = 30;
const TURNS_REQUIRED = 2.5;     // §2.5 900°
const RIPPLE_SECONDS = 1.8;     // §2.5 the ripple takes 1.8s to reach the horizon
const RIPPLE_0 = 150;           // the ripple starts at the plaza edge
const RIPPLE_MAX = 60000;       // plane units — far enough to BE the horizon
const FAR = 6000;               // the furthest props
const VOICE_AT = 2.0;           // s after the device blazes: ripple at the horizon + curtain open
const LEAVE_AT = 6.0;          // s after the blaze: let the child drink in the widest view, then shrink
const LEAVE_AFTER_UP = 2.0;    // ...but never leave while a finger is still on the glass
const LEAVE_HARD = 26.0;       // safety net if an up event is ever lost
const ARM_RATIO = 0.06;        // a touch only turns the device once it has MOVED this much of S
                               // (a tap of any duration, even a wobbly one, never counts)
const DEMO_DUR = 1.7;          // the wordless demo: one panel rides the groove one full turn

export default {
  id: DEF.id,
  labelJa: DEF.labelJa,
  flameColor: DEF.flameColor,
  glowColor: DEF.glowColor,
  ambient: DEF.ambient,
  sampleShape: DEF.sampleShape,
  spectrum: DEF.spectrum,
  coreFrame: { w: 600, h: 600 },

  /**
   * @param {Object} engine
   * @param {Object|null} handoff
   * @param {(r:Object)=>void} finish
   * @returns {Object} Scene
   */
  createWorld(engine, handoff, finish) {
    const rec = engine.gestures();
    const rng = engine.rng;

    // ------------------------------------------------------------ state
    let t = 0;
    let phase = 'intro';            // intro | invite | acting | change | complete | leaving
    let turns01 = 0;                // 0..1 of the required 2.5 turns
    let spinVel = 0;                // rad/s, signed (from the recognizer, then inertia)
    let freshInput = false;
    let deviceAngle = 0;
    let orbit = 0;                  // camera orbit angle around the device
    let orbCos = 1, orbSin = 0;
    let camD = 300, camH = 100;     // camera distance / height above the plaza plane
    let changeT = -1;               // seconds since the device blazed
    let ripple = 0;                 // plane radius reached by the green wave
    let blaze = 0;
    let curtain = 0;                // 0..1 horizontal firework curtain spread
    let spoken = false;
    let sent = false;
    let spinSfx = null;
    let grooveLight = 0;            // the light that circles inside the groove
    let hinokoSpin = 0;
    let hinokoCheer = 0;
    let originD = null;             // handoff origin in design space
    let returnH = null;
    let L = null;                   // layout / projection parameters
    let circleHandle = null;
    let centerScreen = { x: 0, y: 0 };
    let panelSfxAt = -1;
    let fingerDown = false;
    let lastUpT = 0;
    let demoT = -1;                 // >=0 while the demo panel is riding the groove
    let demoSpin = 0;
    let nextDemo = 0;               // scene time of the next demo repeat
    let finger = null;              // {x,y} css px while a finger is on the glass
    let downPt = null;              // the press point; angle only counts once the finger leaves it
    let armed = false;              // true once the touch has travelled far enough to be a turn

    // ------------------------------------------------------------ props (deterministic)
    const panels = [];
    for (let i = 0; i < PANEL_COUNT; i++) {
      const a = (i / PANEL_COUNT) * Math.PI * 2 + rng.range(-0.35, 0.35) + 0.5;
      panels.push({
        i,
        a0: a,
        r0: 92 + rng.range(0, 62),
        tilt: rng.range(-0.9, 0.9),        // how the fallen plate lies
        slot: (i / PANEL_COUNT) * Math.PI * 2,
        snap: 0, stand: 0, arrive: 0,
        wob: rng.range(0, 6.28),
        locked: false
      });
    }

    /** log-uniform distance so the ripple keeps passing NEW things for the whole 1.8s */
    const farD = (u, near) => near * Math.exp(u * Math.log(FAR / near));

    const trees = [];
    for (let i = 0; i < 64; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = farD(rng.next(), 185);
      trees.push({
        x: Math.cos(a) * d, z: Math.sin(a) * d, d,
        h: (38 + rng.range(0, 30)) * (1 + d / 700), w: rng.range(0.8, 1.3)
      });
    }
    const town = [];
    for (let c = 0; c < 5; c++) {
      const ca = (c / 5) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const cd = farD(rng.range(0.08, 0.5), 430);
      for (let i = 0; i < 6; i++) {
        const a = ca + rng.sym(0.16);
        const d = cd * rng.range(0.82, 1.2);
        town.push({
          x: Math.cos(a) * d, z: Math.sin(a) * d, d,
          h: (52 + rng.range(0, 54)) * (1 + d / 650), w: (28 + rng.range(0, 20)) * (1 + d / 800)
        });
      }
    }
    const tufts = [];
    for (let i = 0; i < 120; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = farD(rng.next(), 55);
      tufts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, d, h: (10 + rng.range(0, 12)) * (1 + d / 600) });
    }
    const lakeA = rng.range(0, Math.PI * 2);
    const lakes = [0, Math.PI].map((off, i) => {
      const a = lakeA + off + rng.sym(0.3);
      const d = 1050 + i * 520;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, d, rx: 430 + i * 160, rz: 280 + i * 90 };
    });
    const stars = [];
    for (let i = 0; i < 46; i++) stars.push({ u: rng.next(), v: rng.next(), r: rng.range(0.6, 1.8) });

    // ------------------------------------------------------------ layout / projection

    function layout(w, h) {
      engine.camera.setFrame({ coreW: 600, coreH: 600, mode: 'contain' });
      const base = engine.camera.baseScale || 1;
      const vw = w / base;                      // design units visible at zoom 1
      const vh = h / base;
      const tanTilt = clamp(0.42 * Math.sqrt(vh / vw), 0.32, 0.66);
      L = {
        w, h, vw, vh,
        cx: 300,
        horizonY: 300 - vh * 0.17,
        focal: vw * 0.72,
        tanTilt,
        // live visible design rect (recomputed every frame — the camera zooms a lot)
        left: 300 - vw * 0.5, right: 300 + vw * 0.5,
        top: 300 - vh * 0.5, bottom: 300 + vh * 0.5
      };
      camH = camD * tanTilt * (changeT >= 0 ? camAltMul() : 1);
      if (handoff && handoff.origin) {
        const p = engine.camera.screenToWorld(handoff.origin.x, handoff.origin.y);
        originD = { x: p.x, y: p.y };
      } else {
        originD = { x: 300, y: L.horizonY + L.focal * tanTilt };
      }
      updateCenterScreen();
    }

    function camAltMul() { return 1 + 1.6 * easeInOutCubic(clamp(changeT / 2.2)); }

    /** project a plane point (px,pz) at height py into DESIGN space. */
    const _p = { x: 0, y: 0, k: 0, depth: 0, ok: false };
    function proj(px, pz, py) {
      const u = px * orbCos - pz * orbSin;
      const v = px * orbSin + pz * orbCos;
      const depth = camD + v;
      if (depth < 26) { _p.ok = false; _p.depth = depth; return _p; }
      const k = L.focal / depth;
      _p.x = L.cx + u * k;
      _p.y = L.horizonY + (camH - (py || 0)) * k;
      _p.k = k;
      _p.depth = depth;
      _p.ok = true;
      return _p;
    }

    function updateCenterScreen() {
      if (!L) return;
      const p = proj(0, 0, DECK_Y);
      const s = engine.camera.worldToScreen(p.ok ? p.x : L.cx, p.ok ? p.y : L.horizonY + 100);
      const c = engine.clampSafe(s.x, s.y, 6);
      centerScreen.x = c.x; centerScreen.y = c.y;
    }

    // ------------------------------------------------------------ gesture

    function installGestures() {
      circleHandle = rec.onCircle(
        { x: centerScreen.x, y: centerScreen.y },
        {
          onProgress: (p01, vel) => {
            if (changeT >= 0) return;
            turns01 = Math.max(turns01, p01);
            spinVel = clamp(vel, -9, 9);
            freshInput = true;
            if (phase === 'intro' || phase === 'invite') phase = 'acting';
            if (!spinSfx) spinSfx = engine.audio.play('spin', { f0: 190 });
          },
          onComplete: () => beginChange()
        },
        {
          turnsRequired: TURNS_REQUIRED,
          direction: 'either',       // §2.5 どちら回りでもよい
          accumulateAbs: true,       // 逆に切り返しても減らさない
          minRadiusRatio: 0.02,      // 半径は実質問わない（画面の隅でもよい）
          inertia: 0.92              // 指を離しても慣性で回り続ける
        }
      );
    }

    // ------------------------------------------------------------ the world change

    function beginChange() {
      if (changeT >= 0) return;
      phase = 'change';
      turns01 = 1;
      changeT = 0;
      blaze = 1;
      hinokoCheer = 1;
      for (const p of panels) p.locked = true;
      engine.audio.play('burst');
      engine.audio.play('spread');
      if (spinSfx) { spinSfx.stop(); spinSfx = null; }
      if (engine.camera.stopTweens) engine.camera.stopTweens();
      engine.camera.zoomTo(0.4, 2.2, 'easeInOutCubic');   // §2.5 1.2 -> 0.4 大俯瞰
      engine.camera.tiltTo(0, 2.0, 'easeInOutCubic');     // ティルトダウン -> 水平
      const s = engine.camera.worldToScreen(L.cx, L.horizonY + camH * L.focal / camD);
      engine.particles.burst(s.x, s.y, 54, {
        speed: [60, 380], life: [0.6, 1.5], r: [1.4, 3.2],
        color: [DEF.flameColor, DEF.glowColor, '#e8fff0'], drag: 0.9
      });
    }

    function climax() {
      if (spoken) return;
      spoken = true;
      phase = 'complete';
      engine.audio.speakElement(DEF.id);
      const w = engine.width, h = engine.height;
      for (let i = 0; i < 46; i++) {
        engine.particles.emit({
          x: rng.range(-w * 0.05, w * 1.05),
          y: h * 0.26 + rng.sym(h * 0.12),
          vx: rng.sym(30), vy: rng.range(10, 70),
          r: rng.range(1.0, 2.4), life: rng.range(0.8, 1.9),
          color: rng.next() < 0.5 ? DEF.flameColor : DEF.glowColor,
          drag: 0.95
        });
      }
    }

    function leave() {
      if (sent) return;
      sent = true;
      phase = 'leaving';
      const p = proj(0, 0, DECK_Y);
      const s = engine.camera.worldToScreen(p.ok ? p.x : 300, p.ok ? p.y : 300);
      returnH = makeHandoff({
        elementId: DEF.id,
        flameColor: DEF.flameColor,
        glowColor: DEF.glowColor,
        ambient: DEF.ambient,
        origin: { x: s.x, y: s.y },
        particles: engine.particles.snapshot(),
        cameraZoom: engine.camera.zoom
      });
      finish({
        worldId: DEF.id,
        completed: true,
        shelfAnchorHint: { x: s.x, y: s.y },
        returnHandoff: returnH
      });
    }

    // ------------------------------------------------------------ lifecycle

    function enter() {
      layout(engine.width, engine.height);
      if (engine.camera.stopTweens) engine.camera.stopTweens();
      engine.camera.zoom = 1.2;                 // §2.5 回している間は寄り気味
      engine.camera.tiltTo(10, 1.2, 'easeOutCubic');
      if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
      installGestures();
    }

    function exit() {
      rec.destroy();
      if (spinSfx) { spinSfx.stop(); spinSfx = null; }
    }

    // ------------------------------------------------------------ update

    function update(dt) {
      t += dt;
      if (!L) layout(engine.width, engine.height);

      // かけら（光の板）が炉から飛んできて広場に散らばる
      const arriveK = damp(0.88, dt);
      for (const p of panels) p.arrive = lerp(p.arrive, 1, arriveK);

      if (phase === 'intro' && t > 1.1) phase = 'invite';

      // ---- spin dynamics: resistance falls away as the turns accumulate
      if (!freshInput) spinVel *= Math.pow(0.9, dt * 60);
      freshInput = false;
      const light = 0.75 + 0.85 * turns01;                  // 回るほど軽くなる手応え
      if (changeT < 0) {
        deviceAngle += spinVel * dt * 0.85 * light;
        orbit += spinVel * dt * 0.17;                        // §2.5 入力と連動したオービット
      } else {
        deviceAngle += dt * (1.9 + 3.4 * clamp(1 - changeT / 2.2));
        orbit += dt * 0.16;
      }
      orbCos = Math.cos(orbit); orbSin = Math.sin(orbit);
      grooveLight += dt * (changeT < 0 ? 0.85 + Math.abs(spinVel) * 0.5 : 3.0);

      if (spinSfx) spinSfx.setLevel(clamp(0.2 + turns01 * 0.8) * clamp(0.25 + Math.abs(spinVel) * 0.22));

      // ---- the wordless demo (§2.5 誘い): one panel gets up on its own and rides the
      // groove one whole turn, so a still frame already shows WHAT the groove is for.
      if (phase === 'invite' && demoT < 0 && t >= nextDemo) { demoT = 0; demoSpin = 0; }
      if (demoT >= 0) {
        if (phase === 'acting' || changeT >= 0) { demoT = -1; demoSpin = 0; }
        else {
          demoT += dt;
          const ride = clamp((demoT - 0.28) / 0.8);
          demoSpin = easeInOutCubic(ride) * Math.PI * 2;      // exactly one lap
          if (demoT >= DEMO_DUR) { demoT = -1; demoSpin = 0; nextDemo = t + 4.0; }
        }
      }
      const demoP = demoT >= 0 ? panels[0] : null;
      const demoLift = demoT < 0 ? 0
        : easeOutCubic(clamp(demoT / 0.28)) * (1 - easeInOutCubic(clamp((demoT - 1.12) / 0.5)));

      // ---- panels stand up one by one, in order, as the turns accumulate
      const k = damp(0.86, dt);
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const threshold = (i + 0.55) / PANEL_COUNT * 0.94;
        const want = p.locked || turns01 >= threshold ? 1 : 0;
        if (want && !p.locked) {
          p.locked = true;
          if (panelSfxAt !== i) { panelSfxAt = i; engine.audio.play('snap'); }
        }
        if (p === demoP && !want) {
          p.snap = demoLift;
          p.stand = Math.max(demoLift, 0.17);
          continue;
        }
        const lean = want ? 0 : 0.17 + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.5 + p.wob));  // 溝へ傾く
        p.snap = lerp(p.snap, want, k);
        p.stand = lerp(p.stand, want ? 1 : lean, k);
      }

      // ---- ヒノコ: spins in place as a wordless demo, then cheers
      hinokoSpin += dt * (changeT >= 0 ? 5.5 : 1.0 + Math.abs(spinVel) * 0.5);
      if (hinokoCheer > 0) hinokoCheer = Math.max(0, hinokoCheer - dt * 0.35);

      // ---- the world change timeline
      if (changeT >= 0) {
        changeT += dt;
        blaze = lerp(blaze, 0.55 + 0.45 * Math.sin(t * 7), damp(0.9, dt));
        // the wave races outward at an even SCREEN speed: log growth in plane radius
        const rk = Math.pow(clamp(changeT / RIPPLE_SECONDS), 0.85);
        ripple = RIPPLE_0 * Math.exp(rk * Math.log(RIPPLE_MAX / RIPPLE_0));
        curtain = clamp((changeT - 0.55) / 1.25);
        camD = lerp(300, 700, easeInOutCubic(clamp(changeT / 2.2)));
        camH = camD * L.tanTilt * camAltMul();
        if (changeT >= VOICE_AT) climax();
        // the world only shrinks back to the shelf once the child has let go
        const settled = !fingerDown && (t - lastUpT) >= LEAVE_AFTER_UP;
        if ((changeT >= LEAVE_AT && settled) || changeT >= LEAVE_HARD) leave();
      } else {
        camH = camD * L.tanTilt;
      }

      updateCenterScreen();
      if (circleHandle) circleHandle.update({ center: { x: centerScreen.x, y: centerScreen.y } });

      // ---- living dust in the plaza light (kept sparse)
      if (changeT < 0 && engine.frameCount % 9 === 0) {
        const a = rng.range(0, Math.PI * 2);
        const pp = proj(Math.cos(a) * rng.range(40, 140), Math.sin(a) * rng.range(40, 140), rng.range(4, 40));
        if (pp.ok) {
          const s = engine.camera.worldToScreen(pp.x, pp.y);
          engine.particles.emit({
            x: s.x, y: s.y, vx: rng.sym(6), vy: -rng.range(4, 16),
            r: rng.range(0.8, 1.9), life: rng.range(0.9, 2.0),
            color: DEF.glowColor, drag: 0.98
          });
        }
      }
      if (phase === 'intro' && handoff && handoff.origin) {
        engine.particles.attract(centerScreen.x, centerScreen.y, 420, dt);
      }
    }

    // ------------------------------------------------------------ drawing helpers

    /** Fill the ground annulus between plane radii r0..r1 with the current fillStyle. */
    function groundBand(g, r0, r1) {
      const step = Math.max(1.4, 1.25 / Math.max(0.08, engine.camera.scale));
      const top = L.horizonY + step * 0.5;
      const bottom = L.bottom + step;
      for (let y = top; y < bottom; y += step) {
        const dy = y - L.horizonY;
        if (dy <= 0.001) continue;
        const depth = camH * L.focal / dy;
        if (depth < 26) continue;
        const v = depth - camD;
        const a1 = r1 * r1 - v * v;
        if (a1 <= 0) continue;
        const kk = L.focal / depth;
        const h1 = Math.sqrt(a1) * kk;
        const a0 = r0 > 0 ? r0 * r0 - v * v : -1;
        if (a0 > 0) {
          const h0 = Math.sqrt(a0) * kk;
          g.fillRect(L.cx - h1, y, h1 - h0, step + 1.1);
          g.fillRect(L.cx + h0, y, h1 - h0, step + 1.1);
        } else {
          g.fillRect(L.cx - h1, y, h1 * 2, step + 1.1);
        }
      }
    }

    /** refresh the live visible design rect (the camera zooms from 1.2 to 0.4) */
    function syncView() {
      const vr = engine.camera.viewRect;
      L.left = vr.x - 30; L.right = vr.x + vr.w + 30;
      L.top = vr.y - 30; L.bottom = vr.y + vr.h + 30;
      L.vwV = L.right - L.left;
      L.vhV = L.bottom - L.top;
    }

    function drawSky(g) {
      const spread = clamp(Math.log(Math.max(1, ripple / RIPPLE_0)) / Math.log(RIPPLE_MAX / RIPPLE_0));
      const night = lerpColor('#070b12', '#0d1a14', spread);
      const grad = cachedLinear(g, 'ba-sky' + night + Math.round(L.top), 0, L.top, 0, L.horizonY + 10, [
        [0, '#05070c'],
        [0.55, night],
        [1, lerpColor('#101c1a', DEF.ambient, 0.15 + 0.45 * spread)]
      ]);
      g.fillStyle = grad;
      g.fillRect(L.left, L.top, L.vwV, (L.horizonY + 12) - L.top);
      // stars
      g.save();
      g.globalAlpha = 0.5 * (1 - curtain * 0.7);
      g.fillStyle = '#cfe6ff';
      for (const s of stars) {
        const x = L.left + s.u * L.vwV;
        const y = L.top + s.v * Math.max(20, L.horizonY - L.top) * 0.95;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + s.u * 30);
        g.globalAlpha = 0.45 * tw * (1 - curtain * 0.7);
        const sr = s.r * L.vhV / L.vh;
        g.beginPath(); g.arc(x, y, sr, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    function drawHills(g) {
      const green = clamp((ripple - 9000) / 26000);
      const col = lerpColor('#0b1119', '#2c6b4a', green);
      const y0 = L.horizonY;
      const band = L.vhV * 0.028;
      for (let layer = 0; layer < 2; layer++) {
        g.fillStyle = layer === 0 ? shade(col, 0.72) : col;
        g.beginPath();
        g.moveTo(L.left, y0 + 2);
        const n = 30;
        for (let i = 0; i <= n; i++) {
          const x = L.left + L.vwV * (i / n);
          const ph = i * (layer ? 0.9 : 0.55) + (layer ? 1.2 : 4.1);
          const hgt = (Math.sin(ph) * 0.5 + Math.sin(ph * 2.3) * 0.28 + 0.95) * band * (layer ? 1 : 1.7);
          g.lineTo(x, y0 - hgt);
        }
        g.lineTo(L.right, y0 + 2);
        g.closePath();
        g.fill();
        if (green > 0.02) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.22 * green;
          g.fillStyle = DEF.flameColor;
          g.fill();
          g.restore();
        }
      }
    }

    /** trace the projected circle of plane radius r as a path (only when fully in front) */
    function circlePath(g, r, y, n = 44) {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = proj(Math.cos(a) * r, Math.sin(a) * r, y || 0);
        if (!p.ok) return false;
        if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.closePath();
      return true;
    }

    function drawGround(g) {
      // the dark, unspread world
      const grad = cachedLinear(g, 'ba-gr' + Math.round(L.horizonY) + '_' + Math.round(L.bottom),
        0, L.horizonY, 0, L.bottom, [
          [0, '#0a0f16'],
          [0.35, '#0c1018'],
          [1, '#10141c']
        ]);
      g.fillStyle = grad;
      g.fillRect(L.left, L.horizonY, L.vwV, L.bottom - L.horizonY);

      // the plaza: only its outline is really visible before the change (§2.5)
      if (circlePath(g, PLAZA_R, 0)) {
        g.fillStyle = withAlpha('#1a2330', 0.9);
        g.fill();
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.30 + 0.16 * Math.sin(t * 1.1);
        g.strokeStyle = withAlpha(DEF.glowColor, 0.6);
        g.lineWidth = Math.max(1.5, PLAZA_R * 0.022);
        g.stroke();
        g.restore();
      }
      // faint concentric paving rings: the plaza itself hums with the circle
      g.save();
      g.globalAlpha = 0.5;
      for (let i = 1; i <= 3; i++) {
        if (!circlePath(g, PLAZA_R * (0.42 + i * 0.19), 0, 32)) break;
        g.strokeStyle = withAlpha('#4c7f6a', 0.16);
        g.lineWidth = 1.2;
        g.stroke();
      }
      g.restore();
      // light pool the device throws on the plaza floor
      const c0 = proj(0, 0, 0);
      if (c0.ok) glowCircle(g, c0.x, c0.y, PLAZA_R * c0.k * 1.5, DEF.ambient, 0.16 + 0.5 * blazeK());

      // the green world that the ripple leaves behind
      if (ripple > RIPPLE_0 * 1.01) {
        const gg = cachedLinear(g, 'ba-grass' + Math.round(L.horizonY) + '_' + Math.round(L.bottom),
          0, L.horizonY, 0, L.bottom, [
            [0, '#3f8560'],
            [0.18, '#2f8049'],
            [0.6, '#27703f'],
            [1, '#1d5733']
          ]);
        g.fillStyle = gg;
        groundBand(g, 0, ripple);
        // the plaza stays legible as the source of it all
        if (circlePath(g, PLAZA_R, 0)) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = withAlpha(DEF.glowColor, 0.45);
          g.lineWidth = Math.max(1.2, PLAZA_R * 0.03);
          g.stroke();
          g.restore();
          g.fillStyle = gg;
        }
        // the far side of the wave is past the horizon: close the seam
        const dyEdge = camH * L.focal / (camD + ripple);
        if (dyEdge < 40) g.fillRect(L.left, L.horizonY - 1, L.vwV, dyEdge * 2 + 8);
        // the bright racing edge
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.85 * clamp(1.12 - changeT / RIPPLE_SECONDS);
        g.fillStyle = withAlpha(DEF.glowColor, 0.8);
        groundBand(g, ripple * 0.955, ripple);
        g.restore();
      }
    }

    function drawLakes(g) {
      for (const lake of lakes) drawLake(g, lake);
    }

    function drawLake(g, lake) {
      if (ripple < lake.d) return;
      const grow = clamp((ripple - lake.d) / (lake.d * 0.5));
      const n = 26;
      let started = false;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = proj(lake.x + Math.cos(a) * lake.rx * grow, lake.z + Math.sin(a) * lake.rz * grow, 0);
        if (!p.ok) { started = false; break; }
        if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      }
      if (!started) return;
      g.closePath();
      g.fillStyle = withAlpha('#2b6f9c', 0.85);
      g.fill();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 2);
      g.fillStyle = withAlpha('#a8e6ff', 0.5);
      g.fill();
      g.restore();
    }

    function drawTufts(g) {
      if (ripple < 30) return;
      g.fillStyle = withAlpha('#5fd97a', 0.75);
      for (const tf of tufts) {
        if (tf.d > ripple) continue;
        const grow = clamp((ripple - tf.d) / (tf.d * 0.45));
        const p = proj(tf.x, tf.z, 0);
        if (!p.ok || p.k < 0.05) continue;
        const hh = tf.h * grow * p.k;
        if (hh < 0.6) continue;
        const ww = hh * 0.55;
        g.beginPath();
        g.moveTo(p.x - ww, p.y);
        g.lineTo(p.x, p.y - hh);
        g.lineTo(p.x + ww, p.y);
        g.closePath();
        g.fill();
      }
    }

    function drawTrees(g) {
      for (const tr of trees) {
        if (tr.d > ripple) continue;
        const grow = easeOutBack(clamp((ripple - tr.d) / (tr.d * 0.5)));
        const p = proj(tr.x, tr.z, 0);
        if (!p.ok || p.k < 0.02) continue;
        const hh = tr.h * grow * p.k;
        if (hh < 1.2) continue;
        const ww = hh * 0.42 * tr.w;
        g.fillStyle = '#3c2a1e';
        g.fillRect(p.x - ww * 0.12, p.y - hh * 0.45, ww * 0.24, hh * 0.45);
        g.fillStyle = '#2f9350';
        g.beginPath();
        g.ellipse(p.x, p.y - hh * 0.62, ww, hh * 0.46, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = withAlpha('#79e68e', 0.55);
        g.beginPath();
        g.ellipse(p.x - ww * 0.22, p.y - hh * 0.74, ww * 0.5, hh * 0.24, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawTown(g) {
      for (const b of town) {
        const p = proj(b.x, b.z, 0);
        if (!p.ok || p.k < 0.02) continue;
        const lit = clamp((ripple - b.d) / (b.d * 0.5));
        const hh = b.h * p.k;
        const ww = b.w * p.k;
        if (hh < 1) continue;
        g.fillStyle = lerpColor('#141a22', '#20402f', lit);
        fillRoundRect(g, p.x - ww / 2, p.y - hh, ww, hh, Math.min(ww, hh) * 0.16);
        if (lit > 0.02) {
          const rows = 3;
          for (let r = 0; r < rows; r++) {
            const wy = p.y - hh * (0.25 + r * 0.26);
            const on = lit * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + r * 2.1 + b.d)));
            g.fillStyle = withAlpha(DEF.glowColor, 0.75 * on);
            g.fillRect(p.x - ww * 0.26, wy, ww * 0.18, hh * 0.1);
            g.fillRect(p.x + ww * 0.08, wy, ww * 0.18, hh * 0.1);
          }
          glowCircle(g, p.x, p.y - hh * 0.5, ww * 1.1, DEF.flameColor, 0.22 * lit);
        }
      }
    }

    function drawDevice(g) {
      // deck
      const n = 34;
      let ok = true;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = proj(Math.cos(a) * DEVICE_R, Math.sin(a) * DEVICE_R, DECK_Y);
        if (!p.ok) { ok = false; break; }
        if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      if (!ok) return;
      g.closePath();
      g.fillStyle = lerpColor('#232d3a', DEF.ambient, 0.10 + 0.5 * blazeK());
      g.fill();
      g.strokeStyle = withAlpha(DEF.glowColor, 0.35 + 0.6 * blazeK());
      g.lineWidth = 1.6;
      g.stroke();

      // the circular groove (the affordance): a faint ring with a light circling inside it
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = proj(Math.cos(a) * GROOVE_R, Math.sin(a) * GROOVE_R, DECK_Y + 0.6);
        if (!p.ok) return;
        if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.closePath();
      g.strokeStyle = withAlpha(DEF.glowColor, 0.30 + 0.35 * (1 - turns01));
      g.lineWidth = 2.6;
      g.stroke();

      // the circling light inside the groove — never an arrow (§2.5)
      const heads = changeT >= 0 ? 4 : 1;
      for (let hI = 0; hI < heads; hI++) {
        const a = grooveLight + (hI / heads) * Math.PI * 2;
        for (let s = 0; s < 6; s++) {
          const aa = a - s * 0.13;
          const p = proj(Math.cos(aa) * GROOVE_R, Math.sin(aa) * GROOVE_R, DECK_Y + 1.2);
          if (!p.ok) continue;
          const fade = (1 - s / 6);
          glowCircle(g, p.x, p.y, Math.max(2, 9 * p.k) * fade, '#ffffff', 0.55 * fade * fade);
          glowCircle(g, p.x, p.y, Math.max(3, 15 * p.k) * fade, DEF.flameColor, 0.5 * fade);
        }
      }

      // hub
      const c = proj(0, 0, DECK_Y + 1);
      if (c.ok) {
        const rr = Math.max(3, 13 * c.k);
        softDisc(g, c.x, c.y, rr, withAlpha('#dff7e2', 0.9), withAlpha(DEF.ambient, 0.1));
        glowCircle(g, c.x, c.y, rr * (2.2 + 5 * blazeK()), DEF.flameColor, 0.35 + 0.65 * blazeK());
        // spokes turning with the device: the resistance made visible
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = withAlpha(DEF.glowColor, 0.25 + 0.45 * turns01);
        g.lineWidth = Math.max(1, 2 * c.k);
        for (let i = 0; i < 6; i++) {
          const a = deviceAngle + (i / 6) * Math.PI * 2;
          const p0 = proj(Math.cos(a) * 8, Math.sin(a) * 8, DECK_Y + 0.8);
          const p1 = proj(Math.cos(a) * (GROOVE_R - 3), Math.sin(a) * (GROOVE_R - 3), DECK_Y + 0.8);
          if (!p0.ok) continue;
          const x0 = p0.x, y0 = p0.y;
          if (!p1.ok) continue;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(p1.x, p1.y); g.stroke();
        }
        g.restore();
      }
    }

    function blazeK() {
      if (changeT < 0) return 0;
      return clamp(1 - changeT / 2.6) * (0.65 + 0.35 * blaze);
    }

    const _q = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    function drawPanel(g, p, worldAlpha) {
      // fallen pose: lying on the plaza, its far edge already tipping toward the groove
      const fx = Math.cos(p.a0) * p.r0, fz = Math.sin(p.a0) * p.r0;
      // standing pose: in the groove, turning with the device
      const sa = p.slot + deviceAngle + (p.i === 0 ? demoSpin : 0);
      const sx = Math.cos(sa) * RING_R, sz = Math.sin(sa) * RING_R;
      const e = easeInOutCubic(p.snap);
      const cx = lerp(fx, sx, e), cz = lerp(fz, sz, e);

      // the panel's own axes in the plane
      const fallA = p.a0 + Math.PI / 2 + p.tilt * 0.5;
      const standA = sa + Math.PI / 2;
      const ax = lerp(Math.cos(fallA), Math.cos(standA), e);
      const az = lerp(Math.sin(fallA), Math.sin(standA), e);
      const an = Math.hypot(ax, az) || 1;
      const rx = ax / an, rz = az / an;      // panel "right" in the plane
      const px = -rz, pz = rx;               // panel "forward" in the plane

      const st = easeOutCubic(p.stand);
      const hw = PANEL_W * 0.5;
      const hh = PANEL_H;
      // corner = centre ± right*hw, then out along forward (lying) or up (standing)
      const upY = hh * st;
      const outF = hh * (1 - st);
      const baseY = DECK_Y * e + 1.2;

      for (let i = 0; i < 4; i++) {
        const sgnR = (i === 0 || i === 3) ? -1 : 1;
        const far = (i >= 2 && i <= 3) ? 1 : 0;      // 0,1 = near edge / 2,3 = far edge
        const wx = cx + rx * sgnR * hw + px * outF * far;
        const wz = cz + rz * sgnR * hw + pz * outF * far;
        const wy = baseY + upY * far;
        const q = proj(wx, wz, wy);
        _q[i].x = q.ok ? q.x : L.cx;
        _q[i].y = q.ok ? q.y : L.horizonY;
        if (!q.ok) return;
      }

      // fly-in from the flame (the かけら arriving)
      let ox = 0, oy = 0, scl = 1;
      if (p.arrive < 0.995 && originD) {
        const a = 1 - easeOutCubic(p.arrive);
        const mid = proj(cx, cz, baseY);
        const mx = mid.ok ? mid.x : L.cx, my = mid.ok ? mid.y : L.horizonY;
        ox = (originD.x - mx) * a;
        oy = (originD.y - my) * a;
        scl = 1;
      }

      const lit = 0.45 + 0.55 * st + blazeK() * 0.6;
      g.save();
      g.globalAlpha = worldAlpha;
      if (ox || oy) g.translate(ox, oy);
      g.beginPath();
      g.moveTo(_q[0].x, _q[0].y);
      g.lineTo(_q[1].x, _q[1].y);
      g.lineTo(_q[2].x, _q[2].y);
      g.lineTo(_q[3].x, _q[3].y);
      g.closePath();
      g.fillStyle = withAlpha(lerpColor(shade(DEF.ambient, 0.55), DEF.flameColor, clamp(lit)), 0.92);
      g.fill();
      g.strokeStyle = withAlpha(DEF.glowColor, 0.5 + 0.5 * st);
      g.lineWidth = 1.4;
      g.stroke();
      const mx = (_q[0].x + _q[1].x + _q[2].x + _q[3].x) / 4;
      const my = (_q[0].y + _q[1].y + _q[2].y + _q[3].y) / 4;
      const rr = Math.hypot(_q[0].x - _q[2].x, _q[0].y - _q[2].y) * 0.5;
      glowCircle(g, mx, my, Math.max(3, rr * (1.2 + blazeK())), DEF.glowColor, (0.30 + 0.5 * st + blazeK() * 0.6) * scl);
      g.restore();
    }

    function drawHinoko(g, worldAlpha) {
      const p = proj(0, 0, DECK_Y + 2);
      if (!p.ok) return;
      const r = Math.max(5, 20 * p.k);
      const spin = hinokoSpin;
      const face = Math.cos(spin);
      const bw = r * (0.62 + 0.38 * Math.abs(face));
      const hop = hinokoCheer > 0 ? Math.abs(Math.sin(t * 9)) * r * 0.5 : 0;
      const y = p.y - r * 1.05 - hop;
      g.save();
      g.globalAlpha = worldAlpha;
      glowCircle(g, p.x, y, r * 2.4, '#ffd27a', 0.5);
      // body
      g.fillStyle = withAlpha('#ffb54a', 0.95);
      g.beginPath(); g.ellipse(p.x, y + r * 0.1, bw * 0.9, r * 0.92, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = withAlpha('#fff0c8', 0.96);
      g.beginPath(); g.ellipse(p.x, y, bw * 0.72, r * 0.74, 0, 0, Math.PI * 2); g.fill();
      // a bright tuft that travels around him: you can see that he is turning
      glowCircle(g, p.x + Math.sin(spin) * bw * 0.8, y - r * 0.55, r * 0.42, '#ffe6a8', 0.75);
      // eyes only when he is facing us (no mouth, ever)
      if (face > -0.35) {
        const ea = clamp((face + 0.35) * 2.2);
        for (const s of [-1, 1]) {
          g.globalAlpha = worldAlpha * ea;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.ellipse(p.x + s * bw * 0.34, y - r * 0.08, r * 0.20, r * 0.23, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#2a1410';
          g.beginPath(); g.ellipse(p.x + s * bw * 0.34, y - r * 0.08, r * 0.10, r * 0.13, 0, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = worldAlpha;
      }
      // hands: two little embers, up when cheering
      const hy = hinokoCheer > 0 ? y - r * 1.0 : y + r * 0.35;
      for (const s of [-1, 1]) {
        const hx = p.x + s * (bw * 0.95 + r * 0.2) * (hinokoCheer > 0 ? 0.8 : 1);
        glowCircle(g, hx, hy, r * 0.5, '#ffd27a', 0.55);
        g.fillStyle = withAlpha('#ffd98a', 0.95);
        g.beginPath(); g.arc(hx, hy, r * 0.2, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    /** §review E-b: while the finger is down, an arm of light ties it to the device. */
    function drawArm(g, worldAlpha) {
      if (!finger || changeT >= 0) return;
      const c = proj(0, 0, DECK_Y + 2);
      if (!c.ok) return;
      const f = engine.camera.screenToWorld(finger.x, finger.y);
      const dx = f.x - c.x, dy = f.y - c.y;
      const len = Math.hypot(dx, dy);
      if (len < 4) return;
      const pts = [];
      const bend = 0.10 * (armed ? 1 : 0.4);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const px = c.x + dx * u - dy * bend * Math.sin(u * Math.PI);
        const py = c.y + dy * u + dx * bend * Math.sin(u * Math.PI);
        pts.push({ x: px, y: py });
      }
      g.save();
      g.globalAlpha = worldAlpha;
      glowLine(g, pts, Math.max(1.2, L.vhV * 0.0055), DEF.glowColor, 0.55 + 0.35 * turns01);
      glowCircle(g, f.x, f.y, Math.max(6, L.vhV * 0.028), DEF.flameColor, 0.75);
      glowCircle(g, f.x, f.y, Math.max(3, L.vhV * 0.012), '#f2fff0', 0.9);
      g.restore();
    }

    /** §2.5 the finale: a WIDE HORIZONTAL CURTAIN, not a sphere. */
    function drawCurtain(g, worldAlpha) {
      if (curtain <= 0) return;
      const k = easeOutCubic(curtain);
      const skyH = Math.min(Math.max(40, L.horizonY - L.top), L.vhV * 0.34);
      const halfW = L.vwV * 0.60 * k;
      const yMid = L.horizonY - skyH * 0.62;                 // a band across the upper sky
      const yTop = yMid - skyH * 0.70;
      // it must still be blazing while the child looks at the wide view
      const fade = Math.max(0.55, clamp(1 - (changeT - 5.2) / 2.6));
      const alpha = worldAlpha * fade;
      g.save();
      g.globalCompositeOperation = 'lighter';

      // a soft, very wide wash of green light along the horizon-parallel band
      const blobs = 16;
      for (let i = 0; i <= blobs; i++) {
        const u = i / blobs;
        const x = L.cx - halfW + 2 * halfW * u;
        const edge = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u - 0.5) * 2, 3)), 0.8);
        glowCircle(g, x, yMid, skyH * (0.50 + 0.40 * edge), DEF.flameColor, 0.52 * edge * alpha);
        glowCircle(g, x, yMid, skyH * 0.26, DEF.glowColor, 0.34 * edge * alpha);
        glowCircle(g, x, yMid, skyH * 0.09, '#d8ffdd', 0.12 * edge * alpha);
      }

      g.globalAlpha = alpha;
      // the bright horizontal core of the curtain
      g.lineCap = 'round';
      g.strokeStyle = withAlpha('#eaffe9', 0.95);
      g.lineWidth = Math.max(1.6, skyH * 0.014);
      g.beginPath();
      for (let i = 0; i <= 44; i++) {
        const u = i / 44;
        const x = L.cx - halfW + 2 * halfW * u;
        const yy = yMid + Math.sin(u * 7 + t * 1.2) * skyH * 0.02;
        if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();

      // drooping strands hanging from the core: the curtain's fabric
      const n = 46;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = L.cx - halfW + 2 * halfW * u;
        const edge = Math.max(0, 1 - Math.pow(Math.abs(u - 0.5) * 2, 2.4));
        const wobble = 0.55 + 0.45 * Math.sin(u * 23 + 1.3);
        const len = skyH * (0.30 + 0.62 * edge) * wobble * k;
        const sway = Math.sin(u * 9 + t * 1.6) * skyH * 0.05;
        g.globalAlpha = alpha * (0.3 + 0.6 * edge);
        g.strokeStyle = i % 3 === 0 ? withAlpha(DEF.glowColor, 0.85) : withAlpha(DEF.flameColor, 0.9);
        g.lineWidth = Math.max(1.4, skyH * 0.013);
        g.beginPath();
        g.moveTo(x, yMid);
        g.quadraticCurveTo(x + sway, yMid + len * 0.55, x + sway * 2, yMid + len);
        g.stroke();
        // a shorter spray upward, so the curtain reads as one wide burst
        g.globalAlpha = alpha * 0.45 * edge;
        g.beginPath();
        g.moveTo(x, yMid);
        g.quadraticCurveTo(x - sway * 0.6, yMid - len * 0.35, x - sway, Math.max(yTop, yMid - len * 0.62));
        g.stroke();
        // glowing bead at the tip of each hanging strand
        if (i % 2 === 0) {
          glowCircle(g, x + sway * 2, yMid + len, Math.max(3, skyH * 0.045),
            DEF.glowColor, 0.85 * edge * alpha);
        }
      }
      g.restore();
    }
    // ------------------------------------------------------------ draw

    function draw(g) {
      if (!L) layout(engine.width, engine.height);
      const w = engine.width, h = engine.height;
      // fade in from the flood of flame colour — never a black frame
      const inA = clamp(Math.max(t / 0.7, handoff ? handoff.progress : 0));
      const outA = returnH ? 1 - clamp(returnH.progress * 1.12) : 1;
      const worldAlpha = clamp(inA * outA);
      if (worldAlpha <= 0.001) return;

      // ambient light: starts at the flame colour, settles into the world's own light
      const amb = lerpColor(handoff ? handoff.flameColor : DEF.flameColor, DEF.ambient, clamp(t / 1.5));

      g.save();
      g.globalAlpha = worldAlpha;
      g.fillStyle = lerpColor('#05070c', amb, 0.05);
      g.fillRect(0, 0, w, h);

      engine.camera.apply(g);
      syncView();
      drawSky(g);
      drawHills(g);
      drawGround(g);
      drawLakes(g);
      drawTufts(g);
      drawTown(g);
      drawTrees(g);

      // painter's order: deck, the groove ring of panels (far -> near), then ヒノコ on top —
      // the ring stands AROUND him and never hides his eyes (§review Y).
      const order = panels.slice().sort((a, b) => panelDepth(b) - panelDepth(a));
      drawDevice(g);
      for (const p of order) drawPanel(g, p, 1);
      drawHinoko(g, 1);
      drawArm(g, 1);
      drawCurtain(g, 1);

      // the device blazes green through everything, and stays a beacon afterwards
      if (changeT >= 0) {
        const c = proj(0, 0, DECK_Y);
        if (c.ok) {
          radialFlood(g, c.x, c.y, Math.max(L.vwV, L.vhV) * (0.15 + 0.5 * clamp(changeT / 1.2)),
            DEF.flameColor, 0.5 * clamp(1 - changeT / 2.0));
          const beat = 0.7 + 0.3 * Math.sin(t * 4);
          glowCircle(g, c.x, c.y, Math.max(6, L.vhV * 0.05 * beat), '#f2fff0', 0.8);
          glowCircle(g, c.x, c.y, Math.max(12, L.vhV * 0.13 * beat), DEF.flameColor, 0.7);
        }
      }
      engine.camera.restore(g);

      // the flame colour still washing in from the hearth
      if (inA < 1) {
        radialFlood(g, handoff && handoff.origin ? handoff.origin.x : w / 2,
          handoff && handoff.origin ? handoff.origin.y : h * 0.42,
          Math.hypot(w, h) * 0.6, DEF.flameColor, 0.5 * (1 - inA));
      }
      vignette(g, w, h, 0.42 - 0.16 * clamp(changeT / 2));
      g.restore();
    }

    function panelDepth(p) {
      const e = easeInOutCubic(p.snap);
      const fx = Math.cos(p.a0) * p.r0, fz = Math.sin(p.a0) * p.r0;
      const sa = p.slot + deviceAngle + (p.i === 0 ? demoSpin : 0);
      const cx = lerp(fx, Math.cos(sa) * RING_R, e), cz = lerp(fz, Math.sin(sa) * RING_R, e);
      return camD + (cx * orbSin + cz * orbCos);
    }

    // ------------------------------------------------------------ scene

    const scene = {
      id: DEF.id,
      layout,
      enter,
      exit,
      update,
      draw,

      debugState() {
        return {
          phase,
          turns: Math.round(turns01 * TURNS_REQUIRED * 1000) / 1000,
          turns01: Math.round(turns01 * 1000) / 1000,
          elementId: DEF.id,
          panelsIn: panels.reduce((a, p) => a + (p.locked ? 1 : 0), 0),
          orbit: Math.round(orbit * 100) / 100,
          ripple: Math.round(ripple),
          spoken
        };
      },

      hitPoints() {
        if (sent) return [];
        const S = engine.S;
        return [{ id: 'circle:center', x: centerScreen.x, y: centerScreen.y, r: S * 0.22 }];
      },

      /** __game.complete(): skip straight to the climax. */
      complete() {
        turns01 = 1;
        for (const p of panels) { p.locked = true; p.snap = 1; p.stand = 1; p.arrive = 1; }
        beginChange();
      },

      // A tap never reaches the circle recognizer, however long or wobbly it is: the
      // angle only starts counting once the finger has actually TRAVELLED (§review 新-2).
      onPointerDown(p) {
        fingerDown = true;
        finger = { x: p.x, y: p.y };
        downPt = { x: p.x, y: p.y };
        armed = false;
      },
      onPointerMove(p) {
        finger = { x: p.x, y: p.y };
        if (!armed) {
          if (!downPt) return;
          const moved = Math.hypot(p.x - downPt.x, p.y - downPt.y);
          if (moved < ARM_RATIO * engine.S) return;   // still a tap's wobble: no angle
          armed = true;
          rec.down(p);                 // start counting the angle from here
          return;
        }
        rec.move(p);
      },
      onPointerUp(p) {
        fingerDown = false;
        finger = null;
        downPt = null;
        lastUpT = t;
        if (armed) rec.up(p);
        armed = false;
      }
    };

    return scene;
  }
};
