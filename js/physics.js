// Verlet particle physics with springs and a height-map terrain.
window.G = window.G || {};
(function (G) {
  G.R = 20;            // goo radius (world units)
  G.GRAVITY = 1400;    // world units / s^2
  G.MIN_D = 62;        // min strand length
  G.MAX_D = 165;       // max strand length
  G.MAX_DEG = 5;       // max strands per node

  G.Node = function (x, y, r) {
    this.x = x; this.y = y; this.px = x; this.py = y; this.r = r || G.R;
    this.grounded = false;
  };

  G.Spring = function (a, b, rest) {
    this.a = a; this.b = b; this.rest = rest; this.strain = 0;
    this.len = rest;
  };

  G.Terrain = function (pts, rocks) {
    this.pts = pts; this.rocks = rocks || [];
  };
  G.Terrain.prototype.groundY = function (x) {
    var p = this.pts;
    if (x <= p[0][0]) return p[0][1];
    for (var i = 1; i < p.length; i++) {
      if (x <= p[i][0]) {
        var a = p[i - 1], b = p[i];
        var t = (x - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return p[p.length - 1][1];
  };
  // Nearest point on the surface polyline, with outward normal and inside flag.
  G.Terrain.prototype.nearest = function (x, y) {
    var p = this.pts, best = null, bd = 1e18;
    for (var i = 1; i < p.length; i++) {
      var ax = p[i - 1][0], ay = p[i - 1][1], bx = p[i][0], by = p[i][1];
      var vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      var t = ((x - ax) * vx + (y - ay) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var qx = ax + vx * t, qy = ay + vy * t, dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; var nl = Math.sqrt(l2); best = { x: qx, y: qy, nx: vy / nl, ny: -vx / nl }; }
    }
    best.d = Math.sqrt(bd); best.inside = y > this.groundY(x);
    return best;
  };
  // Pushes node out of ground and rocks. Returns true if touching anything.
  G.Terrain.prototype.collide = function (n, friction) {
    var hit = false;
    var q = this.nearest(n.x, n.y);
    if (q.inside || q.d < n.r) {
      var nx = q.nx, ny = q.ny;
      if (!q.inside && q.d > 0.001) { nx = (n.x - q.x) / q.d; ny = (n.y - q.y) / q.d; }
      n.x = q.x + nx * n.r; n.y = q.y + ny * n.r;
      if (friction) { n.px += (n.x - n.px) * friction; n.py += (n.y - n.py) * friction; }
      hit = true;
    }
    for (var i = 0; i < this.rocks.length; i++) {
      var rk = this.rocks[i];
      var dx = n.x - rk.x, dy = n.y - rk.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      var min = rk.r + n.r;
      if (d < min) {
        n.x = rk.x + dx / d * min; n.y = rk.y + dy / d * min;
        if (friction) { n.px += (n.x - n.px) * friction; n.py += (n.y - n.py) * friction; }
        hit = true;
      }
    }
    return hit;
  };
  // Signed distance to the nearest surface (negative when inside).
  G.Terrain.prototype.distToGround = function (x, y) {
    var q = this.nearest(x, y), d = q.inside ? -q.d : q.d;
    for (var i = 0; i < this.rocks.length; i++) {
      var rk = this.rocks[i];
      var dd = Math.hypot(x - rk.x, y - rk.y) - rk.r;
      if (dd < d) d = dd;
    }
    return d;
  };

  G.integrate = function (n, dt, damp, maxV) {
    var vx = (n.x - n.px) * damp, vy = (n.y - n.py) * damp;
    if (maxV) { var v = Math.sqrt(vx * vx + vy * vy); if (v > maxV) { vx *= maxV / v; vy *= maxV / v; } }
    n.px = n.x; n.py = n.y;
    n.x += vx; n.y += vy + G.GRAVITY * dt * dt;
  };

  G.solveSpring = function (s, k) {
    var a = s.a, b = s.b;
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    s.len = d;
    s.strain = (d - s.rest) / s.rest;
    var diff = (d - s.rest) / d * k * 0.5;
    a.x += dx * diff; a.y += dy * diff;
    b.x -= dx * diff; b.y -= dy * diff;
  };

  G.clampBounds = function (n, b) {
    if (n.x < b.x + n.r) { n.x = b.x + n.r; n.px = n.x; }
    if (n.x > b.x + b.w - n.r) { n.x = b.x + b.w - n.r; n.px = n.x; }
    if (n.y < b.y - 400) { n.y = b.y - 400; n.py = n.y; }
  };
})(window.G);
