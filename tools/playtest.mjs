import { chromium } from 'playwright';
const S = process.argv[2]; const startLevel = parseInt(process.argv[3] || '0'); const W = parseInt(process.argv[4]||'844'), H = parseInt(process.argv[5]||'390');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript((lv) => localStorage.setItem('mokomoko.level', String(lv)), startLevel);
await p.goto('http://localhost:8123/');
await p.waitForTimeout(1200);
const info = () => p.evaluate(() => { const s = window.__mk.state, bl = window.__mk.blob; const c = s.cam; const W = innerWidth, Hh = innerHeight;
  const ts = (x,y)=>({x:(x-c.x)*c.scale+W/2, y:(y-c.y)*c.scale+Hh/2});
  return { mode: s.mode, level: s.levelIndex, cx: bl.cx, cy: bl.cy, scale: c.scale, r: bl.radiusEstimate(), scr: ts(bl.cx, bl.cy), n: bl.cells.length, goal: s.level.goal }; });
async function stroke(x0,y0,x1,y1){ await p.mouse.move(x0,y0); await p.mouse.down(); await p.mouse.move(x1,y1,{steps:6}); await p.mouse.up(); }
let lastLevel = startLevel, t0 = Date.now(), shots = 0;
for (let i = 0; i < 400; i++) {
  const s = await info();
  if (s.level !== lastLevel) { console.log('LEVEL', lastLevel, '->', s.level, 'after', ((Date.now()-t0)/1000).toFixed(1), 's'); lastLevel = s.level; t0 = Date.now(); await p.screenshot({ path: `${S}/play-L${s.level}.png` }); }
  if (s.level >= 3) break;
  if (s.mode !== 'play') { await p.waitForTimeout(200); continue; }
  const R = s.r * s.scale;
  if (s.level === 2 && s.cx > 560 && s.cx < 1100) {
    // flatten: brush across the top
    await stroke(s.scr.x - R, s.scr.y - R*0.7, s.scr.x + R, s.scr.y - R*0.7);
    await stroke(s.scr.x - R*0.9, s.scr.y - R*0.3, s.scr.x - R*0.9, s.scr.y + R*0.5);
  } else if (s.level === 1) {
    // erase lower-left so cells bud upper-right
    await stroke(s.scr.x - R*0.9, s.scr.y, s.scr.x - R*0.3, s.scr.y + R*0.8);
  } else {
    await stroke(s.scr.x - R*0.8, s.scr.y - R*0.8, s.scr.x - R*0.8, s.scr.y + R*0.8);
  }
  if (i % 10 === 0) console.log('i', i, 'lvl', s.level, 'cx', s.cx.toFixed(0), 'cy', s.cy.toFixed(0), 'n', s.n, 'mode', s.mode);
  if (i % 25 === 0) await p.screenshot({ path: `${S}/play-${startLevel}-${i}.png` });
  await p.waitForTimeout(120);
}
console.log('errors', errs);
await b.close();
