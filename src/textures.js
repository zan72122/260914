import * as THREE from 'three';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = opts.wrapS || THREE.RepeatWrapping;
  t.wrapT = opts.wrapT || THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (opts.colorSpace !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function noise(g, w, h, amount, color = '0,0,0') {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

export function asphaltTexture() {
  return tex('asphalt', 256, 256, (g, w, h) => {
    g.fillStyle = '#2e2f3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const r = Math.random() * 2.2 + 0.3;
      g.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${105 + Math.random() * 60 | 0},${Math.random() * 0.22})`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill();
    }
    noise(g, w, h, 22);
  });
}

export function sidewalkTexture() {
  return tex('sidewalk', 256, 256, (g, w, h) => {
    g.fillStyle = '#56545f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    noise(g, w, h, 16);
  });
}

export function grassTexture() {
  return tex('grass', 256, 256, (g, w, h) => {
    g.fillStyle = '#1e3024'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.strokeStyle = `rgba(${30 + Math.random() * 45 | 0},${70 + Math.random() * 70 | 0},${45 + Math.random() * 40 | 0},${0.25 + Math.random() * 0.5})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 4); g.stroke();
    }
    noise(g, w, h, 12);
  });
}

export function sidingTexture(colorA, colorB) {
  return tex('siding-' + colorA + colorB, 128, 128, (g, w, h) => {
    g.fillStyle = colorA; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = colorB; g.fillRect(0, y, w, 8);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y + 14, w, 2);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 8, 1);
    }
  });
}

export function shingleTexture(color) {
  return tex('shingle-' + color, 128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const rows = 8, cols = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (w / cols) + (r % 2 ? w / cols / 2 : 0);
        const y = r * (h / rows);
        g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.22})`;
        g.beginPath();
        g.roundRect(x + 1, y + 1, w / cols - 2, h / rows - 2, 4);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.stroke();
      }
    }
  });
}

export function brickTexture(color) {
  return tex('brick-' + color, 128, 128, (g, w, h) => {
    g.fillStyle = '#2c2a2e'; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 32;
    for (let r = 0; r * bh < h; r++) {
      for (let c = -1; c * bw < w + bw; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        g.fillStyle = color;
        g.globalAlpha = 0.75 + Math.random() * 0.25;
        g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        g.globalAlpha = 1;
      }
    }
  });
}

export function woodTexture(color) {
  return tex('wood-' + color, 128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.12})`;
      g.lineWidth = 0.5 + Math.random() * 2;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.6, y + (Math.random() - 0.5) * 8, w, y + (Math.random() - 0.5) * 6);
      g.stroke();
    }
  });
}

// Radial soft glow sprite (white, alpha falloff)
export function glowTexture() {
  return tex('glow', 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function starTexture() {
  return tex('star', 64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(230,240,255,0.5)');
    grd.addColorStop(1, 'rgba(180,200,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.moveTo(6, h / 2); g.lineTo(w - 6, h / 2); g.stroke();
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function leafTexture() {
  return tex('leaf', 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d2782c';
    g.beginPath();
    g.moveTo(32, 4);
    g.bezierCurveTo(58, 18, 58, 44, 32, 60);
    g.bezierCurveTo(6, 44, 6, 18, 32, 4);
    g.fill();
    g.strokeStyle = 'rgba(90,40,10,0.65)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(32, 8); g.lineTo(32, 58); g.stroke();
    g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const y = 16 + i * 9;
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 - 14 + i, y + 7); g.stroke();
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 + 14 - i, y + 7); g.stroke();
    }
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function batTexture() {
  return tex('bat', 128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#0d0b14';
    g.beginPath();
    g.moveTo(64, 20);
    g.bezierCurveTo(48, 6, 26, 10, 10, 22);
    g.lineTo(20, 26); g.lineTo(8, 34); g.lineTo(26, 34); g.lineTo(22, 42);
    g.bezierCurveTo(38, 40, 54, 36, 64, 44);
    g.bezierCurveTo(74, 36, 90, 40, 106, 42);
    g.lineTo(102, 34); g.lineTo(120, 34); g.lineTo(108, 26); g.lineTo(118, 22);
    g.bezierCurveTo(102, 10, 80, 6, 64, 20);
    g.fill();
    g.beginPath(); g.ellipse(64, 28, 7, 11, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(58, 18); g.lineTo(60, 8); g.lineTo(65, 17); g.fill();
    g.beginPath(); g.moveTo(70, 18); g.lineTo(68, 8); g.lineTo(63, 17); g.fill();
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function webTexture() {
  return tex('web', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,230,245,0.75)';
    g.lineWidth = 1.4;
    const cx = 4, cy = 4;
    const spokes = 9;
    for (let i = 0; i < spokes; i++) {
      const a = (i / (spokes - 1)) * (Math.PI / 2);
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300);
      g.stroke();
    }
    for (let r = 26; r < 300; r += 26) {
      g.beginPath();
      for (let i = 0; i < spokes; i++) {
        const a = (i / (spokes - 1)) * (Math.PI / 2);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else {
          const pa = ((i - 1) / (spokes - 1)) * (Math.PI / 2);
          const ma = (a + pa) / 2;
          g.quadraticCurveTo(cx + Math.cos(ma) * r * 0.88, cy + Math.sin(ma) * r * 0.88, x, y);
        }
      }
      g.stroke();
    }
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function moonTexture() {
  return tex('moon', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.arc(128, 128, 124, 0, 7); g.clip();
    const grd = g.createRadialGradient(96, 96, 20, 128, 128, 150);
    grd.addColorStop(0, '#fffdf2');
    grd.addColorStop(0.6, '#f3ecd4');
    grd.addColorStop(1, '#ded3b4');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const craters = [[80, 90, 20], [150, 70, 13], [170, 140, 24], [105, 165, 16], [60, 145, 10], [190, 95, 9], [128, 118, 11], [140, 190, 12]];
    for (const [x, y, r] of craters) {
      const cg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      cg.addColorStop(0, 'rgba(190,182,160,0.55)');
      cg.addColorStop(0.75, 'rgba(205,197,174,0.35)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.restore();
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function skyTexture() {
  return tex('sky', 8, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.0, '#05060f');
    grd.addColorStop(0.28, '#0b1030');
    grd.addColorStop(0.55, '#16234f');
    grd.addColorStop(0.78, '#2a3a63');
    grd.addColorStop(0.92, '#4a4468');
    grd.addColorStop(1.0, '#6b5570');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function pumpkinFaceTexture(variant = 0, fill = '#000') {
  return tex('face' + variant + fill, 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = fill;
    const eye = (cx, cy, s, style) => {
      g.beginPath();
      if (style === 0) { g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s * 0.4); g.lineTo(cx - s, cy + s * 0.8); }
      else if (style === 1) { g.arc(cx, cy, s * 0.8, 0, 7); }
      else { g.moveTo(cx, cy - s); g.lineTo(cx + s, cy + s * 0.7); g.lineTo(cx - s, cy + s * 0.7); }
      g.closePath(); g.fill();
    };
    const styles = [0, 1, 2, 0];
    const st = styles[variant % styles.length];
    eye(92, 100, 24, st);
    g.save(); g.translate(256, 0); g.scale(-1, 1);
    eye(92, 100, 24, st);
    g.restore();
    // nose
    g.beginPath(); g.moveTo(128, 128); g.lineTo(142, 152); g.lineTo(114, 152); g.closePath(); g.fill();
    // mouth
    g.beginPath();
    if (variant % 3 === 0) {
      g.moveTo(58, 168);
      g.quadraticCurveTo(128, 232, 198, 168);
      g.lineTo(178, 168); g.lineTo(168, 186); g.lineTo(150, 170);
      g.lineTo(128, 190); g.lineTo(106, 170); g.lineTo(88, 186); g.lineTo(78, 168);
    } else if (variant % 3 === 1) {
      g.moveTo(64, 176); g.quadraticCurveTo(128, 240, 192, 176);
      g.quadraticCurveTo(128, 204, 64, 176);
    } else {
      g.moveTo(66, 170);
      for (let i = 0; i < 7; i++) {
        const x = 66 + i * 21;
        g.lineTo(x + 10, 170 + (i % 2 ? 26 : 0));
      }
      g.lineTo(190, 170);
      g.quadraticCurveTo(128, 226, 66, 170);
    }
    g.closePath(); g.fill();
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function fogTexture() {
  return tex('fog', 256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = h * 0.45 + (Math.random() - 0.5) * h * 0.7;
      const r = 20 + Math.random() * 55;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(190,205,225,${0.05 + Math.random() * 0.06})`);
      grd.addColorStop(1, 'rgba(190,205,225,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // fade edges vertically
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.5, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
  }, { wrapT: THREE.ClampToEdgeWrapping });
}

export function windowLitTexture() {
  return tex('winlit', 64, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffd98a');
    grd.addColorStop(1, '#ff9d3c');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(30, 0, 4, h); g.fillRect(0, 30, w, 4);
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function faceTexture(kind) {
  return tex('rface-' + kind, 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    const dark = '#1a1018';
    if (kind === 'ghost') {
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(88, 110, 16, 22, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(168, 110, 16, 22, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(128, 172, 22, 26, 0, 0, 7); g.fill();
    } else if (kind === 'cat') {
      g.fillStyle = '#ffd24d';
      g.beginPath(); g.ellipse(86, 112, 20, 24, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(170, 112, 20, 24, 0, 0, 7); g.fill();
      g.fillStyle = dark;
      g.beginPath(); g.ellipse(86, 112, 5, 20, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(170, 112, 5, 20, 0, 0, 7); g.fill();
      g.fillStyle = '#ff9bb0';
      g.beginPath(); g.moveTo(128, 150); g.lineTo(140, 140); g.lineTo(116, 140); g.fill();
      g.strokeStyle = dark; g.lineWidth = 4;
      g.beginPath(); g.moveTo(128, 152); g.quadraticCurveTo(112, 172, 100, 158); g.stroke();
      g.beginPath(); g.moveTo(128, 152); g.quadraticCurveTo(144, 172, 156, 158); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.8)';
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.moveTo(104, 152 + i * 10); g.lineTo(40, 140 + i * 18); g.stroke();
        g.beginPath(); g.moveTo(152, 152 + i * 10); g.lineTo(216, 140 + i * 18); g.stroke();
      }
    } else if (kind === 'granny') {
      g.strokeStyle = dark; g.lineWidth = 7;
      g.beginPath(); g.arc(90, 118, 18, Math.PI, 0); g.stroke();
      g.beginPath(); g.arc(166, 118, 18, Math.PI, 0); g.stroke();
      g.lineWidth = 5;
      g.beginPath(); g.arc(128, 160, 30, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = 'rgba(255,150,150,0.45)';
      g.beginPath(); g.arc(58, 150, 20, 0, 7); g.fill();
      g.beginPath(); g.arc(198, 150, 20, 0, 7); g.fill();
      // glasses
      g.strokeStyle = 'rgba(230,235,255,0.75)'; g.lineWidth = 4;
      g.beginPath(); g.arc(90, 118, 30, 0, 7); g.stroke();
      g.beginPath(); g.arc(166, 118, 30, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(120, 118); g.lineTo(136, 118); g.stroke();
    } else if (kind === 'witch') {
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(66, 100); g.lineTo(110, 118); g.lineTo(66, 126); g.fill();
      g.beginPath(); g.moveTo(190, 100); g.lineTo(146, 118); g.lineTo(190, 126); g.fill();
      g.strokeStyle = dark; g.lineWidth = 6;
      g.beginPath(); g.moveTo(90, 176); g.quadraticCurveTo(128, 206, 166, 172); g.stroke();
      g.fillStyle = '#6b8f4e';
      g.beginPath(); g.arc(150, 190, 7, 0, 7); g.fill();
    } else { // pumpkinhead / skeleton fallback
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(70, 96); g.lineTo(112, 126); g.lineTo(70, 134); g.fill();
      g.beginPath(); g.moveTo(186, 96); g.lineTo(144, 126); g.lineTo(186, 134); g.fill();
      g.beginPath(); g.moveTo(60, 168); g.quadraticCurveTo(128, 230, 196, 168);
      g.lineTo(172, 168); g.lineTo(160, 188); g.lineTo(142, 170);
      g.lineTo(128, 192); g.lineTo(112, 170); g.lineTo(96, 188); g.lineTo(84, 168);
      g.closePath(); g.fill();
    }
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function girlFaceTexture() {
  return tex('girlface', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2a1a22';
    g.beginPath(); g.ellipse(92, 120, 13, 17, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(164, 120, 13, 17, 0, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(96, 114, 5, 0, 7); g.fill();
    g.beginPath(); g.arc(168, 114, 5, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,140,150,0.4)';
    g.beginPath(); g.arc(62, 152, 19, 0, 7); g.fill();
    g.beginPath(); g.arc(194, 152, 19, 0, 7); g.fill();
    g.strokeStyle = '#7a3040'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(128, 158, 22, 0.35, Math.PI - 0.35); g.stroke();
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}

export function skullSignTexture() {
  return tex('skullsign', 128, 128, (g, w, h) => {
    g.fillStyle = '#6a5a44'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 12, 1);
    g.fillStyle = '#e8e4d4';
    g.beginPath(); g.ellipse(64, 56, 30, 34, 0, 0, 7); g.fill();
    g.fillRect(48, 82, 32, 18);
    g.fillStyle = '#2a2228';
    g.beginPath(); g.ellipse(52, 54, 10, 12, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(76, 54, 10, 12, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(64, 68); g.lineTo(70, 78); g.lineTo(58, 78); g.fill();
    for (let i = 0; i < 4; i++) g.fillRect(50 + i * 8, 84, 3, 14);
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
}
