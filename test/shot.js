// usage: node test/shot.js <w> <h> <out.png> [steps to auto-play]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [w, h, out] = [parseInt(process.argv[2]), parseInt(process.argv[3]), process.argv[4]];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  console.log('errors:', errors);
  await browser.close();
})();
