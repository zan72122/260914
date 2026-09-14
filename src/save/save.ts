import type { SerializedProp } from '../props/props';
import type { SerializedGraph } from '../track/graph';

export interface SaveData {
  v: 1;
  graph: SerializedGraph;
  props: SerializedProp[];
  train: { seg: string; s: number; sign: 1 | -1 } | null;
}

const KEY = 'toy-train-set:v1';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== 1 || !data.graph || !Array.isArray(data.props)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage may be unavailable (private mode) — the game still runs */
  }
}

/** Debounced saver: call `dirty()` whenever state changes. */
export class AutoSave {
  private timer = 0;
  private pending = false;
  constructor(private collect: () => SaveData) {}
  dirty(): void {
    this.pending = true;
    this.timer = 1.0;
  }
  update(dt: number): void {
    if (!this.pending) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.pending = false;
      writeSave(this.collect());
    }
  }
  flush(): void {
    if (this.pending) {
      this.pending = false;
      writeSave(this.collect());
    }
  }
}
