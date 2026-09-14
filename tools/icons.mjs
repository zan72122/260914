// アイコン生成: ハナの帽子をキャンバスで描いて PNG に書き出す。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const html = `<canvas id=c width=512 height=512></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');
g.fillStyle='#f3e9d6';g.fillRect(0,0,512,512);
g.fillStyle='#b8845a';g.fillRect(0,0,512,512);
g.fillStyle='#f3e9d6';g.fillRect(48,48,416,416);
g.fillStyle='#a9cc6a';g.fillRect(48,300,416,164);
g.fillStyle='#e6cc92';g.fillRect(48,340,416,80);g.strokeStyle='#2b2420';g.lineWidth=10;g.strokeRect(48,340,416,80);
g.fillStyle='#fbe0c4';g.beginPath();g.arc(256,250,110,0,Math.PI*2);g.fill();g.stroke();
g.fillStyle='#5a3a26';g.beginPath();g.arc(256,235,112,Math.PI*0.95,Math.PI*2.05);g.lineTo(368,290);g.lineTo(290,255);g.lineTo(222,255);g.lineTo(144,290);g.closePath();g.fill();
g.fillStyle='#d9483b';g.beginPath();g.arc(256,190,120,Math.PI,Math.PI*2);g.closePath();g.fill();g.stroke();
g.beginPath();g.ellipse(262,190,160,26,0,0,Math.PI*2);g.fill();g.stroke();
g.fillStyle='#2b2420';g.beginPath();g.arc(226,262,12,0,Math.PI*2);g.arc(286,262,12,0,Math.PI*2);g.fill();
g.lineWidth=8;g.beginPath();g.arc(256,285,22,0.2,Math.PI-0.2);g.stroke();
g.fillStyle='#f0a0a0';g.beginPath();g.arc(190,285,14,0,Math.PI*2);g.arc(322,285,14,0,Math.PI*2);g.fill();
</script>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [name, size] of [['icon-512', 512], ['icon-192', 192], ['apple-touch-icon', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html.replace('width=512 height=512', `width=${size} height=${size} style="width:${size}px;height:${size}px"`).replace("g.fillStyle='#f3e9d6';g.fillRect(0,0,512,512);", `g.scale(${size / 512},${size / 512});g.fillStyle='#f3e9d6';g.fillRect(0,0,512,512);`));
  await page.screenshot({ path: `icons/${name}.png`, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
