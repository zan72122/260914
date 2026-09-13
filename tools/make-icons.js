// Renders the app icon (locomotive on grass) to PNG with headless Chromium.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const html = `<canvas id=c width=512 height=512></canvas><script type="module">
import { drawLoco } from '/src/render/train.js';
const ctx = document.getElementById('c').getContext('2d');
const g = ctx.createLinearGradient(0,0,0,512); g.addColorStop(0,'#bfe9ff'); g.addColorStop(1,'#e8f7ff');
ctx.fillStyle = g; ctx.fillRect(0,0,512,512);
ctx.fillStyle = '#7fc96b'; ctx.beginPath(); ctx.arc(256, 560, 360, 0, Math.PI*2); ctx.fill();
ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 16; for (let x=60;x<512;x+=48){ctx.beginPath();ctx.moveTo(x,300);ctx.lineTo(x,372);ctx.stroke();}
ctx.strokeStyle = '#6d6d75'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(0,318); ctx.lineTo(512,318); ctx.moveTo(0,356); ctx.lineTo(512,356); ctx.stroke();
drawLoco(ctx, 256, 300, 0, 380, { time: 0 });
ctx.fillStyle='#fff'; for (const [x,y,r] of [[130,120,34],[168,104,44],[208,122,36],[170,136,40]]) { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
window.done = true;
</script>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.route('**/icon.html', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
await page.goto('http://127.0.0.1:8080/icon.html');
await page.waitForFunction(() => window.done);
for (const size of [180, 192, 512]) {
  const buf = await page.evaluate((s) => {
    const src = document.getElementById('c');
    const c = document.createElement('canvas'); c.width = s; c.height = s;
    c.getContext('2d').drawImage(src, 0, 0, s, s);
    return c.toDataURL('image/png');
  }, size);
  writeFileSync(`icons/icon-${size}.png`, Buffer.from(buf.split(',')[1], 'base64'));
  console.log('wrote icons/icon-' + size + '.png');
}
await browser.close();
