import { clamp, TAU } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * Airborne particle layer: the bits that are not ON the floor any more.
 *
 * Flour thrown up out of a spill, dry leaf fragments, fibres stripped off the
 * boss bunny — all of them are the same thing: a speck with a HEIGHT (`z`),
 * dragged by the airflow, pulled down by gravity, and drawn with a shadow that
 * separates from it as it rises. That height is the whole point: the suction
 * reaches highest near the mouth, so a speck that gets lifted rides the flow
 * in, and one that is thrown too high sails over the head and settles again.
 *
 *   const air = new Airborne(400, { rng: this.rng });
 *   air.spawn(x, y, 12, vx, vy, 40, 'flour');
 *   air.update(dt, vac);          // field pulls them in, captures near the mouth
 *   air.draw(ctx, cam);           // inside cam.apply(), world coordinates
 *
 * Pooled: `spawn` never allocates after construction, and `update`/`draw` walk
 * a flat array of plain objects.
 *
 * A kind is `{color, drag, gravity, r, life, lift}` plus four optional fields
 * that keep the LOOK, the PHYSICS and the CUP separate:
 *
 *   shape    'dot' | 'flake' | 'fibre'  — how it is drawn. A dot is a round
 *            speck, a flake an ellipse that tumbles with `rot` (a leaf, a chip
 *            of paint), a fibre a short hair that lies along its own rotation.
 *            Default: 'flake' for a kind called `leaf`, 'dot' otherwise.
 *   cupKind  the transit kind handed to `vac.transit` when it goes in
 *            ('wisp' | 'crumb' | 'fluff'). Default 'crumb' for `leaf`, else 'wisp'.
 *   cupSize  what the CUP charges for one speck, independent of how big it is
 *            drawn. Without it a speck is worth `r * 2.2`, which ties the cup's
 *            appetite to the artwork — so a scene that wants big, readable
 *            flour drawn at r=4 but priced at 2 sets `r: 4, cupSize: 2`.
 *   onSettle(it)  per-LAYER hook (an option, not a kind), called once the first
 *            time a speck touches the floor again. That is how a room puts the
 *            powder back where it fell instead of letting the cloud evaporate.
 *
 * `rng` (also a layer option) makes the jitter deterministic: pass the scene's
 * seeded RNG and the same seed gives the same cloud every run. Left out, it
 * falls back to `Math.random()` exactly as before.
 */
export class Airborne {
  constructor(max = 300, opts = {}) {
    this.max = max;
    this.rng = opts.rng || null;
    this.p = [];
    for (let i = 0; i < max; i++) {
      this.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, r: 2, kind: 'flour', seed: 0, rot: 0, spin: 0, settled: false });
    }
    this.n = 0;                 // live count, for the dev overlay
    this._next = 0;
    /** Per-kind look and physics. Scenes may add their own. */
    this.kinds = Object.assign({
      flour: { color: '#fdfaf3', drag: 3.2, gravity: 90, r: 2.6, life: 3.4, lift: 1.25 },
      leaf:  { color: '#c8853c', drag: 2.2, gravity: 210, r: 5.5, life: 3.0, lift: 0.75 },
      fibre: { color: '#ded7c9', drag: 2.8, gravity: 70, r: 3.2, life: 3.6, lift: 1.1 },
      grit:  { color: '#b39a6e', drag: 1.6, gravity: 330, r: 2.0, life: 2.2, lift: 0.5 },
    }, opts.kinds || {});
    this.captured = 0;          // how many have been swallowed since the reset
    this.onCapture = opts.onCapture || null;
    /** Called once when a speck touches the floor again. `it` is the particle. */
    this.onSettle = opts.onSettle || null;
    this.settled = 0;           // how many have come back down since the reset
  }

  /** Seeded when the layer was given an rng, `Math.random` otherwise. */
  _rand() { return this.rng ? this.rng.next() : Math.random(); }

  /**
   * Fill in a kind's optional fields once, in place. Kinds may be added after
   * construction (`air.kinds.ash = {...}`), so this cannot happen in the
   * constructor — but it only ever runs once per kind.
   */
  _norm(name, K) {
    if (K.shape === undefined) K.shape = name === 'leaf' ? 'flake' : 'dot';
    if (K.cupKind === undefined) K.cupKind = name === 'leaf' ? 'crumb' : 'wisp';
    return K;
  }

  reset() {
    for (let i = 0; i < this.p.length; i++) { this.p[i].life = 0; this.p[i].settled = false; }
    this.n = 0; this.captured = 0; this.settled = 0;
  }

  /**
   * Put one speck in the air. `z` is height above the floor in design px;
   * positive `vz` is upward. Oldest particle is recycled when the pool is full.
   */
  spawn(x, y, z, vx, vy, vz, kind) {
    const K = this.kinds[kind] || this.kinds.flour;
    let it = null;
    for (let i = 0; i < this.max; i++) {
      const c = this.p[(this._next + i) % this.max];
      if (c.life <= 0) { it = c; this._next = (this._next + i + 1) % this.max; break; }
    }
    if (!it) { it = this.p[this._next]; this._next = (this._next + 1) % this.max; }
    it.x = x; it.y = y; it.z = z || 0;
    it.vx = vx || 0; it.vy = vy || 0; it.vz = vz || 0;
    it.kind = kind in this.kinds ? kind : 'flour';
    it.r = K.r * (0.7 + this._rand() * 0.6);
    it.life = K.life * (0.75 + this._rand() * 0.5);
    it.maxLife = it.life;
    it.seed = this._rand() * 100;
    it.rot = this._rand() * TAU;
    it.spin = (this._rand() * 2 - 1) * 6;
    it.settled = false;
    return it;
  }

  /**
   * Drag toward the mouth, gravity down, settle on the floor.
   *
   * The airflow is scaled by height: low specks are deep in the flow and go
   * straight in, high ones only drift. That is what makes a cloud read as being
   * *pulled down and in* rather than merely translated.
   */
  update(dt, vac) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const it = this.p[i];
      if (it.life <= 0) continue;
      const K = this._norm(it.kind, this.kinds[it.kind]);
      const f = vac ? vac.field(it.x, it.y, TMPF) : null;
      if (f) {
        // the cone is a floor-level thing: a speck 60px up sees a third of it
        const hz = 1 / (1 + (it.z / 46) * (it.z / 46));
        const s = 1400 * hz;
        it.vx += f.fx * s * dt;
        it.vy += f.fy * s * dt;
        // and the flow lifts as well as pulls: that is why a cloud climbs the
        // last few centimetres into the mouth instead of skidding under it
        it.vz += f.strength * K.lift * 160 * hz * dt;
      }
      const d = Math.exp(-K.drag * dt);
      it.vx *= d; it.vy *= d; it.vz *= d;
      it.vz -= K.gravity * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      it.rot += it.spin * dt;
      if (it.z <= 0) {
        it.z = 0; it.vz = 0; it.vx *= 0.5; it.vy *= 0.5; it.life -= dt * 2.4;
        // it has come back down: the room may want to put it back on the floor
        // rather than let the cloud quietly evaporate
        if (!it.settled) {
          it.settled = true;
          this.settled++;
          if (this.onSettle) this.onSettle(it);
        }
      }
      it.life -= dt;
      if (f && f.inCapture && it.z < 34) {
        it.life = 0;
        this.captured++;
        // what the CUP charges is the kind's business, not the artwork's
        vac.transit({ kind: K.cupKind, color: K.color, size: K.cupSize === undefined ? it.r * 2.2 : K.cupSize });
        if (this.onCapture) this.onCapture(it);
        continue;
      }
      if (it.life > 0) n++;
    }
    this.n = n;
  }

  /** World coordinates; call inside `cam.apply(ctx)`. */
  draw(ctx, cam) {
    // shadow pass first, so nothing casts onto another speck
    ctx.fillStyle = 'rgba(40,30,16,0.16)';
    for (let i = 0; i < this.max; i++) {
      const it = this.p[i];
      if (it.life <= 0 || it.z < 2) continue;
      const a = clamp(1 - it.z / 150, 0.12, 1) * clamp(it.life, 0, 1);
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath();
      ctx.ellipse(it.x + it.z * 0.12, it.y + it.z * 0.22, it.r * 0.9, it.r * 0.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.max; i++) {
      const it = this.p[i];
      if (it.life <= 0) continue;
      const K = this._norm(it.kind, this.kinds[it.kind]);
      // height reads as size: closer to the eye, bigger and paler
      const sc = 1 + it.z / 190;
      ctx.globalAlpha = clamp(it.life / Math.max(0.3, it.maxLife * 0.45), 0, 1);
      ctx.fillStyle = K.color;
      const sh = K.shape;
      if (sh === 'dot') {
        // the cheap case, and the common one: one arc, no transform
        ctx.beginPath();
        ctx.arc(it.x, it.y - it.z * 0.55, it.r * sc, 0, TAU);
        ctx.fill();
      } else if (sh === 'fibre') {
        // a hair: it lies along its own rotation and turns edge-on as it spins
        const c = Math.cos(it.rot), s2 = Math.sin(it.rot);
        const L = it.r * 2.6 * sc, y = it.y - it.z * 0.55;
        ctx.strokeStyle = K.color;
        ctx.lineWidth = Math.max(0.8, it.r * 0.55);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(it.x - c * L, y - s2 * L * 0.8);
        ctx.lineTo(it.x + c * L, y + s2 * L * 0.8);
        ctx.stroke();
      } else {
        // a flake: an ellipse that tumbles
        ctx.save();
        ctx.translate(it.x, it.y - it.z * 0.55);
        ctx.rotate(it.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, it.r * 1.7 * sc, it.r * 0.7 * sc, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  snapshot() { return { live: this.n, captured: this.captured, settled: this.settled }; }
}
