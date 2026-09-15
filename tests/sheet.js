// Build a contact sheet PNG from frames using Playwright's Chromium (no PIL needed)
const { chromium } = require('@playwright/test');
const fs = require('fs'); const path = require('path');
(async () => {
  const [prefix, out, cropSpec] = process.argv.slice(2);
  const dir = 'screenshots/frames';
  const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix)).sort();
  const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'));
  const [cx, cy, cw, ch] = cropSpec.split(',').map(Number);
  const cols = 5, scale = 0.6;
  const html = `<body style="margin:0;background:#222"><div style="display:grid;grid-template-columns:repeat(${cols},${cw*scale}px);gap:4px">
  ${imgs.map((s,i)=>`<div style="position:relative;width:${cw*scale}px;height:${ch*scale}px;overflow:hidden"><img src="${s}" style="position:absolute;left:${-cx*scale}px;top:${-cy*scale}px;transform-origin:0 0;transform:scale(${scale})"><span style="position:absolute;left:2px;top:2px;color:#fff;font:12px sans-serif">${i+1}</span></div>`).join('')}</div></body>`;
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(html); await p.setViewportSize({width: cols*(cw*scale+4), height: Math.ceil(imgs.length/cols)*(ch*scale+4)});
  await p.screenshot({path: out, fullPage: true}); await b.close();
})();
