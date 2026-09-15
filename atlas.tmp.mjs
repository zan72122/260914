import { chromium } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const t0 = Date.now();
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => window.__kids?.ready === true, undefined, { timeout: 30000 });
console.log('boot ms', Date.now() - t0);
const info = await page.evaluate(async () => {
  const url = window.__kids.atlas();
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = url; });
  return { w: img.width, h: img.height, bytes: url.length };
});
console.log(info);
await browser.close();
