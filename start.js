/* Start scene: a sponge and an empty glass wait on the table. Touch one to begin. */
'use strict';
stages.start = {
  enter() {
    G.startT = 0; G.startPick = null;
    addHit({ r: 150, big: 1.2, pos: () => [-190, -60], down: () => pick('cake', -190, -60) });
    addHit({ r: 150, big: 1.2, pos: () => [190, -150], down: () => pick('parfait', 190, -150) });
    function pick(game, x, y) {
      if (G.startPick) return; G.startPick = game; audio.pop(); sparkle(x, y, 14); G.shake = 4;
      G.fade = 0; tween(G, { fade: 1 }, .45, easeInOut, () => { setGame(game); tween(G, { fade: 0 }, .5, easeInOut); });
    }
  },
  downAny(wp) { sparkle(wp[0], wp[1], 3); audio.click(); },
  update(dt) { G.startT += dt; },
  focus() { return { cx: 0, top: -420, bottom: 60, w: 620 }; },
  draw() {},
};
function drawStartScene() {
  drawBackground();
  setCam(); const t = G.t;
  // a sponge with holes, rocking a little (its own invitation)
  ctx.save(); ctx.translate(-190, 0); ctx.rotate(Math.sin(t * 2.2) * 0.04); ctx.scale(0.8, 0.8);
  const F = FLAVORS[G.round % FLAVORS.length]; ctx.lineWidth = 3; ctx.fillStyle = F.sponge; ctx.strokeStyle = F.edge;
  rr(-145, -96, 290, 96, 16); ctx.fill(); ctx.stroke(); ctx.fillStyle = F.layer; ctx.fillRect(-145, -36, 290, 8); ctx.fillRect(-145, -68, 290, 8);
  ctx.fillStyle = '#5a3b21'; for (const hx of [-92, 0, 92]) { ctx.beginPath(); ctx.ellipse(hx, -96, 13, 6, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  // an empty parfait glass, catching the light
  ctx.save(); ctx.translate(190, 0); ctx.scale(0.5, 0.5); drawGlassBack(); drawGlassFront(); ctx.restore();
  const p = .5 + .5 * Math.sin(t * 3); ctx.fillStyle = `rgba(255,255,255,${.4 + .5 * p})`; ctx.beginPath(); ctx.arc(150, -240, 5 + p * 3, 0, TAU); ctx.fill();
  drawParticles();
}
GAMES.start = { start() { clearWorld(); setStage('start'); }, render: drawStartScene, debugState() { return {}; } };

resize(); setGame('start'); requestAnimationFrame(frame);
