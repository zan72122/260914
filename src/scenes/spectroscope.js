// STUB — spectroscope scene. Engineer A placeholder; the owner of src/scenes/spectroscope.js
// (Engineer G) replaces this file wholesale. It implements the minimum valid Scene contract
// (DESIGN §5.5.1) so the hearth -> spectroscope -> hearth loop is testable today.
//
// Contract reminders for the real implementation:
//   - factory signature: (engine, handoff, finish) => Scene
//   - handoff carries { elementId, flameColor, glowColor, origin, particles, progress }
//   - expand a circular tube mask out of handoff.origin (no cut), then draw the emission
//     lines from ELEMENT_BY_ID[handoff.elementId].spectrum using nmToColor().
//   - debugState() must expose { spectrumId, lineCount, hasBlueLine }.
//   - call finish({ returnToHearth: true }) to come back. NEVER draw text.

import { ELEMENT_BY_ID, nmToColor, nmToX01 } from '../core/palette.js';
import { clamp } from '../core/tween.js';
import { glowCircle, withAlpha } from '../core/draw.js';

export function createSpectroscope(engine, handoff, finish) {
  const rec = engine.gestures();
  const elementId = (handoff && handoff.elementId) || 'lithium';
  const def = ELEMENT_BY_ID[elementId] || ELEMENT_BY_ID.lithium;
  let t = 0;
  let target = { x: 0, y: 0, r: 0 };
  let leaving = false;

  const scene = {
    id: 'spectroscope',

    layout(w, h) {
      const S = Math.min(w, h);
      const zone = engine.thumbZone();
      const p = engine.clampSafe(w * 0.5, zone.y + zone.h * 0.6, S * 0.18);
      target = { x: p.x, y: p.y, r: S * 0.15 };
    },

    enter() {
      if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
      engine.camera.resetToScreen();
      rec.onTap((p) => Math.hypot(p.x - target.x, p.y - target.y) < target.r * 1.8, () => scene.leave());
    },

    leave() {
      if (leaving) return;
      leaving = true;
      engine.audio.play('snap');
      finish({ worldId: 'spectroscope', completed: false, elementId, returnToHearth: true });
    },

    update(dt) { t += dt; },

    draw(g) {
      const w = engine.width, h = engine.height;
      const S = Math.min(w, h);
      const p = handoff ? clamp(handoff.progress) : 1;
      g.save();
      g.globalAlpha = p;
      g.fillStyle = '#05050a';
      g.fillRect(0, 0, w, h);

      // spectrum lines on black — the whole point of the scene
      const x0 = w * 0.16, x1 = w * 0.84;
      const cy = h * 0.42, half = S * 0.17;
      g.globalCompositeOperation = 'lighter';
      for (const line of def.spectrum) {
        const x = x0 + (x1 - x0) * nmToX01(line.nm);
        const col = nmToColor(line.nm);
        const wdt = S * (0.006 + 0.022 * line.i) * (elementId === 'sodium' ? 2.2 : 1);
        g.fillStyle = withAlpha(col, 0.25);
        g.fillRect(x - wdt * 1.8, cy - half, wdt * 3.6, half * 2);
        g.fillStyle = col;
        g.fillRect(x - wdt / 2, cy - half, wdt, half * 2);
      }
      g.globalCompositeOperation = 'source-over';
      g.restore();

      // the "look again / go back" target
      const pulse = 1 + Math.sin(t * 3) * 0.05;
      glowCircle(g, target.x, target.y, target.r * 2 * pulse, def.glowColor, 0.5 * p);
      g.save();
      g.globalAlpha = p;
      g.fillStyle = withAlpha(def.flameColor, 0.9);
      g.beginPath();
      g.arc(target.x, target.y, target.r * 0.62 * pulse, 0, Math.PI * 2);
      g.fill();
      g.restore();
    },

    exit() { rec.destroy(); },

    debugState() {
      return {
        phase: leaving ? 'complete' : 'idle',
        stub: true,
        spectrumId: elementId,
        lineCount: def.spectrum.length,
        hasBlueLine: def.spectrum.some((l) => l.nm < 500)
      };
    },

    hitPoints() { return [{ id: 'stub', x: target.x, y: target.y, r: target.r }]; },

    onPointerDown(p) { rec.down(p); },
    onPointerMove(p) { rec.move(p); },
    onPointerUp(p) { rec.up(p); }
  };

  return scene;
}

export default { id: 'spectroscope', createSpectroscope };
