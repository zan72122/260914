/**
 * Dev Mode. Developer-facing only: text is fine here, it never appears in play.
 * Opens with ?dev=1 or five quick taps in the top-left corner.
 */
export interface GameApi {
  episodes(): Array<{ id: string; title: string }>;
  phases(): string[];
  actions(id?: string): string[];
  gotoEpisode(id: string | null): void;
  gotoPhase(name: string): void;
  runAction(name: string): void;
  getState(): Record<string, unknown>;
  setOrientation(o: string | null): void;
  setSeed(s: number): void;
  restart(): void;
  setTimeScale(s: number): void;
  setPaused(p: boolean): void;
  step(n?: number): void;
  setMuted(m: boolean): void;
  settle(seconds: number): void;
}

const CSS = `
.dvp{position:fixed;left:0;top:0;z-index:99;font:11px/1.35 ui-monospace,Menlo,monospace;
  color:#dfe6f0;background:rgba(14,17,24,.88);backdrop-filter:blur(6px);
  border-bottom-right-radius:10px;padding:6px 8px 8px;max-width:min(282px,54vw);
  max-height:100vh;overflow:auto;box-shadow:0 4px 18px rgba(0,0,0,.4)}
.dvp.hidden{display:none}
.dvp h4{margin:6px 0 3px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#7f8ea6;font-weight:600}
.dvp button{font:10px ui-monospace,monospace;background:#26304055;color:#cfd8e6;border:1px solid #3c4658;
  border-radius:5px;padding:3px 6px;margin:0 3px 3px 0;cursor:pointer}
.dvp button:hover{background:#38455c}
.dvp button.on{background:#4a7ec8;border-color:#6fa0e6;color:#fff}
.dvp input{font:10px ui-monospace,monospace;width:86px;background:#1a2130;color:#cfd8e6;
  border:1px solid #3c4658;border-radius:5px;padding:2px 4px}
.dvp pre{margin:2px 0 0;font-size:10px;line-height:1.3;color:#9fd6b4;white-space:pre-wrap;word-break:break-word}
.dvp .row{display:flex;flex-wrap:wrap;align-items:center;gap:3px}
.dvp .tgl{position:fixed;left:0;top:0;width:34px;height:26px;background:rgba(14,17,24,.6);
  border-bottom-right-radius:8px;color:#8fa;font:10px monospace;text-align:center;line-height:26px;cursor:pointer;z-index:100}
`;

export class DevPanel {
  private root: HTMLDivElement;
  private toggle: HTMLDivElement;
  private stateEl: HTMLPreElement;
  private actionsEl: HTMLDivElement;
  private lastActions = '';
  private taps: number[] = [];
  private visible = false;

  constructor(
    private api: GameApi,
    startVisible: boolean,
    canvas: HTMLCanvasElement,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'dvp hidden';
    document.body.appendChild(this.root);

    this.toggle = document.createElement('div');
    this.toggle.className = 'tgl';
    this.toggle.textContent = 'dev';
    this.toggle.style.display = 'none';
    this.toggle.addEventListener('click', () => this.setVisible(!this.visible));
    document.body.appendChild(this.toggle);

    this.actionsEl = document.createElement('div');
    this.stateEl = document.createElement('pre');
    this.build();

    // five quick taps in the top-left corner
    window.addEventListener(
      'pointerdown',
      (e) => {
        const r = canvas.getBoundingClientRect();
        if (e.clientX - r.left > 90 || e.clientY - r.top > 90) return;
        const now = performance.now();
        this.taps = this.taps.filter((t) => now - t < 1600);
        this.taps.push(now);
        if (this.taps.length >= 5) {
          this.taps = [];
          this.setVisible(true);
        }
      },
      true,
    );

    if (startVisible) this.setVisible(true);
    setInterval(() => this.refresh(), 250);
  }

  private setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    this.toggle.style.display = v ? 'none' : 'block';
  }

  private section(title: string): HTMLDivElement {
    const h = document.createElement('h4');
    h.textContent = title;
    this.root.appendChild(h);
    const row = document.createElement('div');
    row.className = 'row';
    this.root.appendChild(row);
    return row;
  }

  private btn(parent: HTMLElement, label: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
    });
    parent.appendChild(b);
    return b;
  }

  private build(): void {
    const top = this.section('episode');
    this.btn(top, 'hub', () => this.api.gotoEpisode(null));
    for (const e of this.api.episodes()) this.btn(top, e.id, () => this.api.gotoEpisode(e.id));
    this.btn(top, 'x', () => this.setVisible(false));

    const ph = this.section('phase');
    for (const p of this.api.phases()) this.btn(ph, p, () => this.api.gotoPhase(p));

    const act = this.section('actions');
    act.appendChild(this.actionsEl);

    const time = this.section('time');
    const tsBtns: HTMLButtonElement[] = [];
    for (const s of [0.25, 1, 3]) {
      const b = this.btn(time, `${s}x`, () => {
        this.api.setTimeScale(s);
        for (const x of tsBtns) x.classList.remove('on');
        b.classList.add('on');
      });
      if (s === 1) b.classList.add('on');
      tsBtns.push(b);
    }
    let paused = false;
    const pb = this.btn(time, 'pause', () => {
      paused = !paused;
      this.api.setPaused(paused);
      pb.classList.toggle('on', paused);
      pb.textContent = paused ? 'resume' : 'pause';
    });
    this.btn(time, 'step', () => this.api.step(1));

    const view = this.section('viewport / seed');
    const oBtns: HTMLButtonElement[] = [];
    for (const [label, val] of [
      ['auto', null],
      ['portrait', 'portrait'],
      ['landscape', 'landscape'],
    ] as Array<[string, string | null]>) {
      const b = this.btn(view, label, () => {
        this.api.setOrientation(val);
        for (const x of oBtns) x.classList.remove('on');
        b.classList.add('on');
      });
      if (val === null) b.classList.add('on');
      oBtns.push(b);
    }
    const seedIn = document.createElement('input');
    seedIn.value = String(this.api.getState().seed ?? 1);
    view.appendChild(seedIn);
    this.btn(view, 'seed+restart', () => this.api.setSeed(Number(seedIn.value) || 1));
    this.btn(view, 'restart', () => this.api.restart());
    let muted = false;
    const mb = this.btn(view, 'mute', () => {
      muted = !muted;
      this.api.setMuted(muted);
      mb.classList.toggle('on', muted);
    });

    this.section('state').appendChild(this.stateEl);
  }

  private refresh(): void {
    if (!this.visible) return;
    const names = this.api.actions();
    const key = names.join(',');
    if (key !== this.lastActions) {
      this.lastActions = key;
      this.actionsEl.innerHTML = '';
      for (const n of names) this.btn(this.actionsEl, n, () => this.api.runAction(n));
    }
    try {
      this.stateEl.textContent = JSON.stringify(this.api.getState(), null, 1);
    } catch {
      this.stateEl.textContent = '(state error)';
    }
  }
}
