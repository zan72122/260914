/** 汽車が走る経路。XZ 平面上、t∈[0,1) で位置・接線・外向き法線を返す。 */
import { Vector3 } from 'three';

export interface PathPoint { pos: Vector3; tan: Vector3; normal: Vector3 }

export interface Path {
  readonly length: number;
  pointAt(t: number): PathPoint;
  pointAtLength(s: number): PathPoint;
}

interface Seg { len: number; at: (d: number) => PathPoint }

/** 角丸長方形のループ。時計回り(上から見て)。start='far' で t=0 を奥辺の中央に置く。 */
export class RoundedLoop implements Path {
  readonly length: number;
  private readonly segs: Seg[];
  private readonly startS: number;

  constructor(readonly cx: number, readonly cz: number, readonly hw: number, readonly hd: number, readonly r: number, readonly y = 0) {
    const line = (x0: number, z0: number, x1: number, z1: number): Seg => {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const tx = dx / len, tz = dz / len;
      return { len, at: (d) => ({ pos: new Vector3(x0 + tx * d, y, z0 + tz * d), tan: new Vector3(tx, 0, tz), normal: new Vector3(-tz, 0, tx) }) };
    };
    const arc = (ax: number, az: number, a0: number): Seg => {
      const len = (Math.PI / 2) * r;
      return {
        len,
        at: (d) => {
          const a = a0 + (d / len) * (Math.PI / 2);
          const nx = Math.cos(a), nz = Math.sin(a);
          return { pos: new Vector3(ax + nx * r, y, az + nz * r), tan: new Vector3(-nz, 0, nx), normal: new Vector3(nx, 0, nz) };
        },
      };
    };
    // 画面座標(x 右, z 手前)で時計回り: 奥辺を +x へ → 右辺を +z へ → 手前辺を -x へ → 左辺を -z へ
    this.segs = [
      line(cx - hw + r, cz - hd, cx + hw - r, cz - hd),
      arc(cx + hw - r, cz - hd + r, -Math.PI / 2),
      line(cx + hw, cz - hd + r, cx + hw, cz + hd - r),
      arc(cx + hw - r, cz + hd - r, 0),
      line(cx + hw - r, cz + hd, cx - hw + r, cz + hd),
      arc(cx - hw + r, cz + hd - r, Math.PI / 2),
      line(cx - hw, cz + hd - r, cx - hw, cz - hd + r),
      arc(cx - hw + r, cz - hd + r, Math.PI),
    ];
    this.length = this.segs.reduce((a, s) => a + s.len, 0);
    this.startS = hw - r; // 奥辺の中央
  }

  pointAtLength(s: number): PathPoint {
    let d = ((s + this.startS) % this.length + this.length) % this.length;
    for (const seg of this.segs) {
      if (d <= seg.len) return seg.at(d);
      d -= seg.len;
    }
    return this.segs[0].at(0);
  }

  pointAt(t: number): PathPoint { return this.pointAtLength(t * this.length); }

  /** ループの内側か(XZ) */
  contains(x: number, z: number): boolean {
    const dx = Math.max(Math.abs(x - this.cx) - (this.hw - this.r), 0);
    const dz = Math.max(Math.abs(z - this.cz) - (this.hd - this.r), 0);
    return Math.hypot(dx, dz) < this.r;
  }
}

/** 直線の側線(x0 → x1)。t は 0..1 で線形。 */
export class LinePath implements Path {
  readonly length: number;
  constructor(readonly x0: number, readonly x1: number, readonly z: number, readonly y = 0) {
    this.length = Math.abs(x1 - x0);
  }
  pointAtLength(s: number): PathPoint {
    const dir = Math.sign(this.x1 - this.x0) || 1;
    return {
      pos: new Vector3(this.x0 + dir * s, this.y, this.z),
      tan: new Vector3(dir, 0, 0),
      normal: new Vector3(0, 0, dir),
    };
  }
  pointAt(t: number): PathPoint { return this.pointAtLength(t * this.length); }
}
