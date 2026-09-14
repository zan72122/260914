// One-finger autoplay driven purely by each step's wordless hint gesture.
// usage: node test/autoplay.js <w> <h> <outdir> [maxSteps]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [w, h, outdir] = [parseInt(process.argv[2]), parseInt(process.argv[3]), process.argv[4]];
  const maxSteps = parseInt(process.argv[5] || '999');
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(800);
  const state = () => page.evaluate(() => { const s = G.step; const h = s && s.hint(); return { si: G.si, name: s ? s.constructor.name : null, hint: h, delay: G.nextDelay, revealed: G.revealed }; });
  const drag = async (pts, ms = 500) => {
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
    const n = Math.max(8, Math.floor(ms / 16));
    const segs = pts.length - 1;
    for (let i = 1; i <= n; i++) { const u = i / n, s = Math.min(segs - 1, Math.floor(u * segs)), f = u * segs - s; await page.mouse.move(pts[s].x + (pts[s + 1].x - pts[s].x) * f, pts[s].y + (pts[s + 1].y - pts[s].y) * f); await page.waitForTimeout(16); }
    await page.mouse.up();
  };
  let lastSi = -1, stuck = 0, t0 = Date.now(), lastName = '';
  while (true) {
    const st = await state();
    if (st.si !== lastSi) {
      if (lastSi >= 0) await page.screenshot({ path: `${outdir}/${String(lastSi).padStart(2, '0')}_${lastName}_done.png` });
      lastSi = st.si; lastName = st.name; stuck = 0; t0 = Date.now();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${outdir}/${String(st.si).padStart(2, '0')}_${st.name}.png` });
      console.log('step', st.si, st.name);
      if (st.si >= maxSteps) break;
      if (st.name === 'RevealStep') { await page.waitForTimeout(5500); await page.screenshot({ path: `${outdir}/${String(st.si).padStart(2, '0')}_reveal_full.png` }); break; }
    }
    if (st.delay > 0) { await page.waitForTimeout(200); continue; }
    if (!st.hint) { await page.waitForTimeout(300); stuck++; if (stuck > 30) { console.log('STUCK (no hint)', st.name); break; } continue; }
    const hnt = st.hint;
    if (hnt.kind === 'tap') { await page.mouse.click(hnt.pts[0].x, hnt.pts[0].y); await page.waitForTimeout(150); }
    else if (hnt.kind === 'hold') { await page.mouse.move(hnt.pts[0].x, hnt.pts[0].y); await page.mouse.down(); await page.waitForTimeout(1200); await page.screenshot({ path: `${outdir}/${String(st.si).padStart(2, '0')}_${st.name}_holding.png` }); await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(150); }
    else if (hnt.kind === 'drag') { await drag(hnt.pts, hnt.repeat ? 350 : 600); await page.waitForTimeout(120); }
    if (Date.now() - t0 > 40000) { console.log('TIMEOUT on', st.name); await page.screenshot({ path: `${outdir}/TIMEOUT_${st.name}.png` }); break; }
  }
  console.log('errors:', errors);
  await browser.close();
})();
