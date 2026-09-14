/** 角丸長方形のループ線路。弧長パラメータ t∈[0,1) で位置・接線・外向き法線を返す。 */

export interface TrackPoint {
  x: number; y: number;
  tx: number; ty: number;   // 接線(進行方向、時計回り)
  nx: number; ny: number;   // 外向き法線
}

interface Seg { len: number; at: (d: number) => TrackPoint }

export class RoundedLoop {
  readonly length: number;
  private readonly segs: Seg[];
  private readonly startS: number;

  constructor(
    readonly cx: number, readonly cy: number,
    readonly hw: number, readonly hh: number,
    readonly r: number,
    /** t=0 を置く場所: 'top' = 上辺中央, 'right' = 右辺中央 */
    start: 'top' | 'right',
  ) {
    const line = (x0: number, y0: number, x1: number, y1: number): Seg => {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const tx = dx / len, ty = dy / len;
      return { len, at: (d) => ({ x: x0 + tx * d, y: y0 + ty * d, tx, ty, nx: ty, ny: -tx }) };
    };
    const arc = (ax: number, ay: number, a0: number): Seg => {
      const len = (Math.PI / 2) * r;
      return {
        len,
        at: (d) => {
          const a = a0 + (d / len) * (Math.PI / 2);
          const nx = Math.cos(a), ny = Math.sin(a);
          return { x: ax + nx * r, y: ay + ny * r, tx: -ny, ty: nx, nx, ny };
        },
      };
    };
    this.segs = [
      line(cx - hw + r, cy - hh, cx + hw - r, cy - hh),
      arc(cx + hw - r, cy - hh + r, -Math.PI / 2),
      line(cx + hw, cy - hh + r, cx + hw, cy + hh - r),
      arc(cx + hw - r, cy + hh - r, 0),
      line(cx + hw - r, cy + hh, cx - hw + r, cy + hh),
      arc(cx - hw + r, cy + hh - r, Math.PI / 2),
      line(cx - hw, cy + hh - r, cx - hw, cy - hh + r),
      arc(cx - hw + r, cy - hh + r, Math.PI),
    ];
    this.length = this.segs.reduce((a, s) => a + s.len, 0);
    this.startS = start === 'top'
      ? hw - r
      : this.segs[0].len + this.segs[1].len + (hh - r);
  }

  /** 弧長 s(px)での点 */
  pointAtLength(s: number): TrackPoint {
    let d = ((s + this.startS) % this.length + this.length) % this.length;
    for (const seg of this.segs) {
      if (d <= seg.len) return seg.at(d);
      d -= seg.len;
    }
    return this.segs[0].at(0);
  }

  /** 位相 t∈[0,1) での点 */
  pointAt(t: number): TrackPoint {
    return this.pointAtLength(t * this.length);
  }

  /** 位相 t から法線方向に offset ずらした点 */
  offsetPoint(t: number, offset: number): { x: number; y: number } {
    const p = this.pointAt(t);
    return { x: p.x + p.nx * offset, y: p.y + p.ny * offset };
  }

  /** ループの内側か */
  contains(x: number, y: number): boolean {
    const dx = Math.max(Math.abs(x - this.cx) - (this.hw - this.r), 0);
    const dy = Math.max(Math.abs(y - this.cy) - (this.hh - this.r), 0);
    return Math.hypot(dx, dy) < this.r;
  }

  /** 線路の形をパスとして追加する */
  path(ctx: CanvasRenderingContext2D, inset = 0): void {
    const { cx, cy } = this;
    const hw = this.hw - inset, hh = this.hh - inset, r = Math.max(1, this.r - inset);
    ctx.beginPath();
    ctx.moveTo(cx - hw + r, cy - hh);
    ctx.arcTo(cx + hw, cy - hh, cx + hw, cy + hh, r);
    ctx.arcTo(cx + hw, cy + hh, cx - hw, cy + hh, r);
    ctx.arcTo(cx - hw, cy + hh, cx - hw, cy - hh, r);
    ctx.arcTo(cx - hw, cy - hh, cx + hw, cy - hh, r);
    ctx.closePath();
  }
}
