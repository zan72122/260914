import * as THREE from 'three';
import { connectionsOf } from '../core/board';
import { EAST, NORTH, SOUTH, WEST, type Direction, type Layer, type TileKind } from '../core/types';

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

/**
 * 線路タイルの上面テクスチャ(4.1)。枕木 + 2 本のレール。
 * 道路と見た目がはっきり違うので、レイヤーの違いが形で読める(7.6)。
 */
export function railTexture(kind: TileKind, railColor: string, groundColor: string): THREE.CanvasTexture {
  const dirs = connectionsOf({ kind, rot: 0, height: 0, layer: 'rail' });
  return cached(`rail:${kind}:${railColor}:${groundColor}`, (ctx) => {
    const c = SIZE / 2;
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const bed = SIZE * 0.2; // 道床の半幅
    const gauge = SIZE * 0.1; // レール間隔の半分
    const sleeper = SIZE * 0.05;

    // 道床(砂利)
    ctx.fillStyle = railColor;
    ctx.fillRect(c - bed, c - bed, bed * 2, bed * 2);
    for (const d of dirs) {
      const v = DIR_VEC[d];
      const x0 = v[0] === 0 ? c - bed : v[0] > 0 ? c : 0;
      const y0 = v[1] === 0 ? c - bed : v[1] > 0 ? c : 0;
      ctx.fillRect(x0, y0, v[0] === 0 ? bed * 2 : c, v[1] === 0 ? bed * 2 : c);
    }

    // 枕木と 2 本のレールを、各接続方向の腕へ描く
    const dark = '#3B2E26';
    const steel = '#CFD4D8';
    for (const d of dirs) {
      const v = DIR_VEC[d];
      const horizontal = v[0] !== 0;
      for (let s = 0.12; s < 0.5; s += 0.125) {
        const px = c + v[0] * SIZE * s;
        const py = c + v[1] * SIZE * s;
        ctx.fillStyle = dark;
        if (horizontal) ctx.fillRect(px - sleeper / 2, py - bed * 0.85, sleeper, bed * 1.7);
        else ctx.fillRect(px - bed * 0.85, py - sleeper / 2, bed * 1.7, sleeper);
      }
      ctx.fillStyle = steel;
      const railW = SIZE * 0.028;
      for (const side of [-1, 1] as const) {
        if (horizontal) {
          const x0 = v[0] > 0 ? c : 0;
          ctx.fillRect(x0, c + side * gauge - railW / 2, c, railW);
        } else {
          const y0 = v[1] > 0 ? c : 0;
          ctx.fillRect(c + side * gauge - railW / 2, y0, railW, c);
        }
      }
    }
  });
}

/** 瓦礫タイル(block)の上面。土と小石(4.1 の「岩・廃屋」) */
export function rubbleTexture(groundColor: string): THREE.CanvasTexture {
  return cached(`rubble:${groundColor}`, (ctx) => {
    const base = new THREE.Color(groundColor).multiplyScalar(0.72);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const dot = new THREE.Color(groundColor).multiplyScalar(0.55);
    ctx.fillStyle = `#${dot.getHexString()}`;
    // 位置は固定(乱数を使わず、毎回同じ見た目にする)
    const pts: [number, number, number][] = [
      [0.22, 0.3, 0.06],
      [0.7, 0.24, 0.05],
      [0.36, 0.72, 0.07],
      [0.78, 0.66, 0.045],
      [0.52, 0.46, 0.05],
      [0.14, 0.6, 0.04],
    ];
    for (const [px, py, r] of pts) {
      ctx.beginPath();
      ctx.arc(px * SIZE, py * SIZE, r * SIZE, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** ゴールタイルの上面: 白い円 + 4 つの目盛(本家 2.1) */
export function goalTexture(roadColor: string, groundColor: string, layer: Layer = 'road'): THREE.CanvasTexture {
  return cached(`goal:${roadColor}:${groundColor}:${layer}`, (ctx) => {
    const c = SIZE / 2;
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // 北へ伸びる腕(goal の接続は基準形で北)
    if (layer === 'rail') {
      ctx.fillStyle = roadColor;
      ctx.fillRect(c - SIZE * 0.2, 0, SIZE * 0.4, c);
      ctx.fillStyle = '#3B2E26';
      for (let s = 0.12; s < 0.5; s += 0.125) {
        ctx.fillRect(c - SIZE * 0.17, c - SIZE * s - SIZE * 0.025, SIZE * 0.34, SIZE * 0.05);
      }
      ctx.fillStyle = '#CFD4D8';
      for (const side of [-1, 1] as const) {
        ctx.fillRect(c + side * SIZE * 0.1 - SIZE * 0.014, 0, SIZE * 0.028, c);
      }
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(c - SIZE * 0.24, 0, SIZE * 0.48, c);
      ctx.fillStyle = roadColor;
      ctx.fillRect(c - SIZE * 0.2, 0, SIZE * 0.4, c);
    }

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
