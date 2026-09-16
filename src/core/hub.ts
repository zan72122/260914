import type { Episode, EpisodeModule } from './episode';
import type { PointerEvt } from './input';
import type { Orientation } from './layout';

/** Only episodes that exist as modules show up. No manual list to forget. */
const mods = import.meta.glob<EpisodeModule>('../episodes/*.ts', { eager: true });

/**
 * Reading order for the episodes we know about, so the hub is not alphabetical.
 * An episode that declares `order` overrides this; anything unknown sorts last,
 * then by id, so a new episode file still shows up without touching this table.
 */
const ORDER: Record<string, number> = {
  laundry: 1,
  bedcat: 2,
  leaves: 3,
  sandcastle: 4,
  hatwind: 5,
  snowman: 6,
};

const orderOf = (e: Episode): number => e.order ?? ORDER[e.id] ?? 1000;

export const episodes: Episode[] = Object.keys(mods)
  .sort()
  .map((k) => mods[k].episode)
  .filter(Boolean)
  .sort((a, b) => orderOf(a) - orderOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function findEpisode(id: string): Episode | undefined {
  return episodes.find((e) => e.id === id);
}

interface Tile {
  ep: Episode;
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  press: number;
}

/** Wordless hub: every episode is a small living diorama you can tap into. */
export class Hub {
  private tiles: Tile[] = [];
  private w = 1;
  private h = 1;
  private t = 0;
  private down: Tile | null = null;
  private enterT = 0;
  private entering: Tile | null = null;
  fade = 1;

  constructor(private onEnter: (id: string) => void) {}

  reset(): void {
    this.fade = 1;
    this.entering = null;
    this.enterT = 0;
    this.down = null;
  }

  layout(o: Orientation, w: number, h: number, safe: { top: number; bottom: number; left: number; right: number }): void {
    this.w = w;
    this.h = h;
    const cols = Math.max(1, Math.min(o === 'portrait' ? 2 : 3, episodes.length));
    const padX = Math.max(14, w * 0.045) + Math.max(safe.left, safe.right);
    const padTop = Math.max(18, h * 0.06) + safe.top;
    const padBottom = Math.max(18, h * 0.05) + safe.bottom;
    const gap = Math.max(10, Math.min(w, h) * 0.035);
    const rows = Math.max(1, Math.ceil(episodes.length / cols));
    const tw = (w - padX * 2 - gap * (cols - 1)) / cols;
    const availH = h - padTop - padBottom;
    const th = Math.min((availH - gap * (rows - 1)) / rows, tw * 1.15);
    const gridH = th * rows + gap * (rows - 1);
    const y0 = padTop + Math.max(0, (availH - gridH) / 2);
    this.tiles = episodes.map((ep, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, episodes.length - r * cols);
      const rowOff = ((cols - inRow) * (tw + gap)) / 2;
      return {
        ep,
        x: padX + rowOff + c * (tw + gap),
        y: y0 + r * (th + gap),
        w: tw,
        h: th,
        t: i * 1.7,
        press: 0,
      };
    });
  }

  update(dt: number): void {
    this.t += dt;
    for (const tile of this.tiles) {
      const want = this.down === tile ? 1 : 0;
      tile.press += (want - tile.press) * Math.min(1, dt * 14);
    }
    this.fade = Math.max(0, this.fade - dt * 2);
    if (this.entering) {
      this.enterT += dt;
      if (this.enterT > 0.28) {
        const id = this.entering.ep.id;
        this.entering = null;
        this.onEnter(id);
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { w, h } = this;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#f6efe2');
    bg.addColorStop(1, '#e6dcc9');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    for (const tile of this.tiles) {
      // idle life: each tile breathes and tilts on its own slow, prime-ish cycle
      const lift = Math.sin(this.t * 0.8 + tile.t) * 2.2 + Math.sin(this.t * 0.37 + tile.t * 1.7) * 1.1;
      const tilt = Math.sin(this.t * 0.53 + tile.t * 0.9) * 0.006;
      const breathe = 1 + Math.sin(this.t * 0.62 + tile.t * 1.3) * 0.006;
      const k =
        breathe - tile.press * 0.055 + (this.entering === tile ? this.enterT * 1.4 : 0);
      g.save();
      g.translate(tile.x + tile.w / 2, tile.y + tile.h / 2 + lift);
      g.rotate(tilt * (1 - tile.press));
      g.scale(k, k);
      g.translate(-tile.w / 2, -tile.h / 2);
      const r = Math.min(26, tile.w * 0.12);

      g.save();
      g.shadowColor = 'rgba(80,66,48,0.3)';
      g.shadowBlur = 16 - tile.press * 8;
      g.shadowOffsetY = 6 - tile.press * 4 + lift * 0.25;
      g.fillStyle = '#fff';
      roundRect(g, 0, 0, tile.w, tile.h, r);
      g.fill();
      g.restore();

      g.save();
      roundRect(g, 0, 0, tile.w, tile.h, r);
      g.clip();
      tile.ep.thumbnail(g, tile.w, tile.h, this.t + tile.t);
      // glass
      const gl = g.createLinearGradient(0, 0, tile.w * 0.6, tile.h);
      gl.addColorStop(0, 'rgba(255,255,255,0.16)');
      gl.addColorStop(0.45, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(0, 0, tile.w, tile.h);
      g.restore();

      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3;
      roundRect(g, 1.5, 1.5, tile.w - 3, tile.h - 3, r - 1);
      g.stroke();
      g.restore();
    }

    if (this.entering) {
      g.fillStyle = `rgba(10,12,18,${Math.min(1, this.enterT * 3.6)})`;
      g.fillRect(0, 0, w, h);
    } else if (this.fade > 0.001) {
      g.fillStyle = `rgba(10,12,18,${this.fade})`;
      g.fillRect(0, 0, w, h);
    }
  }

  pointer(e: PointerEvt): void {
    if (this.entering) return;
    const hit = this.tiles.find((t) => e.x > t.x && e.x < t.x + t.w && e.y > t.y && e.y < t.y + t.h) ?? null;
    if (e.type === 'down') {
      this.down = hit;
      // immediate press feedback: don't wait for the spring to catch up
      if (hit) hit.press = 0.75;
    }
    else if (e.type === 'up') {
      if (this.down && hit === this.down) {
        this.entering = this.down;
        this.enterT = 0;
      }
      this.down = null;
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
