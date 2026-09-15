import * as THREE from 'three';
import { connectionsOf } from '../core/board';
import { EAST, NORTH, SOUTH, WEST, type Direction, type TileKind } from '../core/types';

const SIZE = 128;

/**
 * キャンバスの向きと世界の向きの対応:
 * BoxGeometry の上面 UV は u が +x、v が -z に増える。CanvasTexture は flipY なので
 * キャンバスの上端が北(z 小)、左端が西(x 小)になる。つまり普通の地図と同じ。
 */
function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** 方角 → キャンバス上の外向き単位ベクトル */
const DIR_VEC: Record<Direction, [number, number]> = {
  [NORTH]: [0, -1],
  [EAST]: [1, 0],
  [SOUTH]: [0, 1],
  [WEST]: [-1, 0],
};

const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas();
  draw(ctx);
  const tex = toTexture(canvas);
  cache.set(key, tex);
  return tex;
}

/**
 * 道路タイルの上面テクスチャ。灰色の路面 + 白い縁取り(7.1 / 2.3)。
 * 回転 0 の基準形で描く。実際の向きはメッシュの回転で表現する。
 */
export function roadTexture(kind: TileKind, roadColor: string, groundColor: string): THREE.CanvasTexture {
  const dirs = connectionsOf({ kind, rot: 0, height: 0, layer: 'road' });
  return cached(`road:${kind}:${roadColor}:${groundColor}`, (ctx) => {
    const c = SIZE / 2;
    const half = SIZE * 0.24; // 路面の半幅
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 路面: 中央の正方形 + 各接続方向への腕
    const paint = (color: string, w: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(c - w, c - w, w * 2, w * 2);
      for (const d of dirs) {
        const v = DIR_VEC[d];
        const x0 = v[0] === 0 ? c - w : v[0] > 0 ? c : 0;
        const y0 = v[1] === 0 ? c - w : v[1] > 0 ? c : 0;
        const ww = v[0] === 0 ? w * 2 : c;
        const hh = v[1] === 0 ? w * 2 : c;
        ctx.fillRect(x0, y0, ww, hh);
      }
    };
    paint('#FFFFFF', half); // 白縁
    paint(roadColor, half * 0.82);
  });
}

/** ゴールタイルの上面: 白い円 + 4 つの目盛(本家 2.1) */
export function goalTexture(roadColor: string, groundColor: string): THREE.CanvasTexture {
  return cached(`goal:${roadColor}:${groundColor}`, (ctx) => {
    const c = SIZE / 2;
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // 北へ伸びる道の腕(goal の接続は基準形で北)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(c - SIZE * 0.24, 0, SIZE * 0.48, c);
    ctx.fillStyle = roadColor;
    ctx.fillRect(c - SIZE * 0.2, 0, SIZE * 0.4, c);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = SIZE * 0.06;
    ctx.beginPath();
    ctx.arc(c, c, SIZE * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    // 4 つの目盛
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      const r0 = SIZE * 0.32;
      const r1 = SIZE * 0.42;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.stroke();
    }
  });
}

/**
 * ツールアイコン(7.2)。絵文字フォントは使わず、必ず図形として描く。
 * 白い図形 + 透明背景。
 */
export function iconTexture(kind: 'rotate' | 'raise' | 'destroy'): THREE.CanvasTexture {
  return cached(`icon:${kind}`, (ctx) => {
    const c = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = SIZE * 0.1;

    if (kind === 'rotate') {
      // 円弧 + 三角の矢尻(⟳)
      const r = SIZE * 0.3;
      ctx.beginPath();
      ctx.arc(c, c, r, Math.PI * 0.72, Math.PI * 0.35, false);
      ctx.stroke();
      const a = Math.PI * 0.35;
      const tipX = c + Math.cos(a) * r;
      const tipY = c + Math.sin(a) * r;
      const s = SIZE * 0.13;
      ctx.beginPath();
      ctx.moveTo(tipX + s, tipY - s * 0.2);
      ctx.lineTo(tipX - s * 0.5, tipY + s * 0.7);
      ctx.lineTo(tipX - s * 0.2, tipY - s * 0.9);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'raise') {
      // 台形のトレイ + 上向き太矢印(⬆)
      ctx.beginPath();
      ctx.moveTo(c - SIZE * 0.3, c + SIZE * 0.24);
      ctx.lineTo(c + SIZE * 0.3, c + SIZE * 0.24);
      ctx.lineTo(c + SIZE * 0.22, c + SIZE * 0.36);
      ctx.lineTo(c - SIZE * 0.22, c + SIZE * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c, c - SIZE * 0.34);
      ctx.lineTo(c + SIZE * 0.24, c - SIZE * 0.04);
      ctx.lineTo(c + SIZE * 0.1, c - SIZE * 0.04);
      ctx.lineTo(c + SIZE * 0.1, c + SIZE * 0.16);
      ctx.lineTo(c - SIZE * 0.1, c + SIZE * 0.16);
      ctx.lineTo(c - SIZE * 0.1, c - SIZE * 0.04);
      ctx.lineTo(c - SIZE * 0.24, c - SIZE * 0.04);
      ctx.closePath();
      ctx.fill();
    } else {
      // 丸い爆弾 + 導火線 + 火花(💣)
      ctx.beginPath();
      ctx.arc(c, c + SIZE * 0.07, SIZE * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = SIZE * 0.07;
      ctx.beginPath();
      ctx.moveTo(c + SIZE * 0.13, c - SIZE * 0.14);
      ctx.quadraticCurveTo(c + SIZE * 0.3, c - SIZE * 0.3, c + SIZE * 0.24, c - SIZE * 0.36);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        ctx.beginPath();
        ctx.arc(c + SIZE * 0.24 + Math.cos(a) * SIZE * 0.1, c - SIZE * 0.36 + Math.sin(a) * SIZE * 0.1, SIZE * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}
