import { chromium } from 'playwright';
const S = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem('mokomoko.level', '2'));
await p.goto('http://localhost:8123/'); await p.waitForTimeout(1200);
const info = () => p.evaluate(() => { const s = window.__mk.state, bl = window.__mk.blob; const c = s.cam;
  const ts = (x,y)=>({x:(x-c.x)*c.scale+innerWidth/2, y:(y-c.y)*c.scale+innerHeight/2});
  return { mode: s.mode, level: s.levelIndex, cx: bl.cx, scale: c.scale, r: bl.radiusEstimate(), scr: ts(bl.cx, bl.cy), gg: s.gardenGoals.map(g=>ts(g[0], g[1]-30)), saved: localStorage.getItem('mokomoko.level') }; });
async function stroke(x0,y0,x1,y1){ await p.mouse.move(x0,y0); await p.mouse.down(); await p.mouse.move(x1,y1,{steps:6}); await p.mouse.up(); }
let winShot = false;
for (let i = 0; i < 300; i++) {
  const s = await info();
  if (s.mode === 'win' && !winShot) { await p.waitForTimeout(900); await p.screenshot({ path: `${S}/end-win.png` }); winShot = true; }
  if (s.mode === 'garden') break;
  if (s.mode !== 'play') { await p.waitForTimeout(150); continue; }
  const R = s.r * s.scale;
  if (s.cx > 560 && s.cx < 1100) { await stroke(s.scr.x - R, s.scr.y - R*0.7, s.scr.x + R, s.scr.y - R*0.7); await stroke(s.scr.x - R*0.9, s.scr.y - R*0.3, s.scr.x - R*0.9, s.scr.y + R*0.5); }
  else await stroke(s.scr.x - R*0.8, s.scr.y - R*0.8, s.scr.x - R*0.8, s.scr.y + R*0.8);
  if (i % 20 === 0) { await p.screenshot({ path: `${S}/end-play-${i}.png` }); console.log('i', i, 'cx', s.cx.toFixed(0)); }
  await p.waitForTimeout(120);
}
await p.waitForTimeout(1500);
let s = await info(); console.log('garden?', s.mode, 'saved', s.saved, 'goals', JSON.stringify(s.gg.map(g=>[g.x|0,g.y|0])));
await p.screenshot({ path: `${S}/end-garden.png` });
// move blob right a bit then touch a flower
const g = s.gg[1]; await p.mouse.move(g.x, g.y); await p.mouse.down(); await p.mouse.move(g.x+5, g.y+5, {steps:3}); await p.mouse.up();
await p.waitForTimeout(2500);
s = await info(); console.log('after touch', s.mode, 'level', s.level, 'saved', s.saved);
await p.screenshot({ path: `${S}/end-restart.png` });
console.log('errors', errs);
await b.close();
