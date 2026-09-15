import { chromium } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const OUT='/tmp/claude-0/-home-user-260914/fa042630-0978-56be-9ddd-9330ae7d5132/scratchpad/shots';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await p.goto('http://127.0.0.1:4173/');
await p.waitForFunction(() => window.__kids?.ready === true);
await p.waitForTimeout(1200);
for (let i=0;i<4;i++){ await p.screenshot({ path: `${OUT}/waver-${i}.png`, clip: { x: 160, y: 370, width: 70, height: 70 } }); await p.waitForTimeout(140); }
await b.close();
