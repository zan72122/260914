// STUB — lithium world. Engineer A placeholder; owner of src/worlds/lithium.js replaces this file
// wholesale. It implements the minimum valid World module contract (DESIGN §5.5.5) so the full
// loop hearth -> world -> hearth is testable end to end.
//
// Contract reminders for the real implementation:
//   - default-export an object with id/labelJa/flameColor/glowColor/sampleShape/spectrum/coreFrame
//     and createWorld(engine, handoff, finish) => Scene.
//   - inject handoff.particles, start from handoff.origin, start the ambient at handoff.flameColor.
//   - call engine.audio.speakElement('lithium') exactly once, at the climax.
//   - call finish({worldId:'lithium', completed:true, returnHandoff, shelfAnchorHint}) when done.
//   - NEVER draw text.

import { ELEMENT_BY_ID } from '../core/palette.js';
import { makeHandoff } from '../core/scene.js';
import { clamp, lerp } from '../core/tween.js';
import { glowCircle, radialFlood, withAlpha, lerpColor, star } from '../core/draw.js';

const DEF = ELEMENT_BY_ID['lithium'];

export default {
  id: DEF.id,
  labelJa: DEF.labelJa,
  flameColor: DEF.flameColor,
  glowColor: DEF.glowColor,
  ambient: DEF.ambient,
  sampleShape: DEF.sampleShape,
  spectrum: DEF.spectrum,
  coreFrame: { w: 600, h: 600 },

  createWorld(engine, handoff, finish) {
    const rec = engine.gestures();
    let t = 0;
    let target = { x: 0, y: 0, r: 0 };
    let done = false;
    let spoken = false;
    let bloom = 0;
    let doneAt = 0;

    const scene = {
      id: DEF.id,

      layout(w, h) {
        const S = Math.min(w, h);
        const zone = engine.thumbZone();
        const p = engine.clampSafe(w * 0.5, zone.y + zone.h * 0.55, S * 0.16);
        target = { x: p.x, y: p.y, r: S * 0.14 };
      },

      enter(ctx) {
        if (handoff && handoff.particles) engine.particles.inject(handoff.particles);
        engine.camera.resetToScreen();
        rec.onTap((p) => Math.hypot(p.x - target.x, p.y - target.y) < target.r * 1.8, () => scene.hit());
      },

      hit() {
        if (done) return;
        done = true;
        doneAt = t;
        bloom = 1;
        if (!spoken) { spoken = true; engine.audio.speakElement(DEF.id); }
        engine.audio.play('burst');
        engine.particles.burst(target.x, target.y, 46, {
          speed: [80, 320], life: [0.5, 1.2], r: [2, 5], color: [DEF.flameColor, DEF.glowColor], drag: 0.9
        });
      },

      update(dt) {
        t += dt;
        if (done === true && t - doneAt > 0.9) {
          done = 'sent';
          finish({
            worldId: DEF.id,
            completed: true,
            shelfAnchorHint: { x: engine.width * 0.5, y: engine.height * 0.5 },
            returnHandoff: makeHandoff({
              elementId: DEF.id,
              flameColor: DEF.flameColor,
              glowColor: DEF.glowColor,
              ambient: DEF.ambient,
              origin: { x: target.x, y: target.y },
              particles: engine.particles.snapshot(),
              cameraZoom: engine.camera.zoom
            })
          });
        }
      },

      draw(g) {
        const w = engine.width, h = engine.height;
        const p = handoff ? clamp(handoff.progress) : 1;
        const S = Math.min(w, h);

        // ambient settles from the flame colour to the world's own light
        const amb = lerpColor(handoff ? handoff.flameColor : DEF.flameColor, DEF.ambient, clamp(t / 1.5));
        g.save();
        g.globalAlpha = p;
        g.fillStyle = lerpColor('#0b0710', amb, 0.22);
        g.fillRect(0, 0, w, h);
        radialFlood(g, w * 0.5, h * 0.42, S * (0.9 + 0.1 * Math.sin(t)), amb, 0.22 * p);
        g.restore();

        // the single stub target: a soft pulsing shape that clearly wants a finger
        const pulse = 1 + Math.sin(t * 3) * 0.06;
        const r = target.r * pulse * (done ? 1 + bloom * 0.6 : 1);
        glowCircle(g, target.x, target.y, r * 2.2, DEF.glowColor, 0.55 * p);
        g.save();
        g.globalAlpha = p;
        g.fillStyle = withAlpha(DEF.flameColor, 0.95);
        star(g, target.x, target.y, r, r * 0.55, 6, t * 0.4);
        g.fill();
        g.fillStyle = withAlpha('#ffffff', 0.85);
        g.beginPath();
        g.arc(target.x - r * 0.22, target.y - r * 0.26, r * 0.16, 0, Math.PI * 2);
        g.fill();
        g.restore();
        if (done) { bloom = lerp(bloom, 0, 0.06); }
      },

      exit() { rec.destroy(); },

      debugState() {
        return { phase: done ? 'complete' : 'idle', stub: true, elementId: DEF.id, t };
      },

      hitPoints() {
        return [{ id: 'stub', x: target.x, y: target.y, r: target.r }];
      },

      complete() { scene.hit(); },

      onPointerDown(p) { rec.down(p); },
      onPointerMove(p) { rec.move(p); },
      onPointerUp(p) { rec.up(p); }
    };

    return scene;
  }
};
