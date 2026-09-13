// The goo structure: fixed nodes joined by springs, plus graph helpers.
window.G = window.G || {};
(function (G) {
  G.Structure = function () {
    this.nodes = []; this.springs = []; this.adj = new Map();
  };
  G.Structure.prototype.addNode = function (n) {
    this.nodes.push(n); this.adj.set(n, []);
  };
  G.Structure.prototype.link = function (a, b) {
    var rest = Math.hypot(a.x - b.x, a.y - b.y);
    rest = Math.max(G.MIN_D, Math.min(G.MAX_D, rest));
    var s = new G.Spring(a, b, rest);
    this.springs.push(s);
    this.adj.get(a).push(s); this.adj.get(b).push(s);
    return s;
  };
  G.Structure.prototype.degree = function (n) { return this.adj.get(n).length; };
  G.Structure.prototype.other = function (s, n) { return s.a === n ? s.b : s.a; };
  // Nodes a new goo at (x,y) would attach to.
  G.Structure.prototype.candidates = function (x, y) {
    var out = [], tooClose = false;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      var d = Math.hypot(n.x - x, n.y - y);
      if (d < G.MIN_D * 0.8) tooClose = true;
      if (d >= G.MIN_D && d <= G.MAX_D && this.degree(n) < G.MAX_DEG) out.push({ n: n, d: d });
    }
    out.sort(function (a, b) { return a.d - b.d; });
    out = out.slice(0, 3);
    return { list: out, ok: !tooClose && out.length >= 2 };
  };
  // BFS hop distance from `target` along springs.
  G.Structure.prototype.distances = function (target) {
    var dist = new Map(); if (!target) return dist;
    dist.set(target, 0); var q = [target];
    while (q.length) {
      var n = q.shift(), d = dist.get(n), ss = this.adj.get(n);
      for (var i = 0; i < ss.length; i++) {
        var o = this.other(ss[i], n);
        if (!dist.has(o)) { dist.set(o, d + 1); q.push(o); }
      }
    }
    return dist;
  };
  G.Structure.prototype.entryNodes = function (terrain) {
    var out = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      if (terrain.distToGround(n.x, n.y) < G.R * 2.6 && this.degree(n) > 0) out.push(n);
    }
    return out;
  };
  G.Structure.prototype.maxStrain = function () {
    var m = 0;
    for (var i = 0; i < this.springs.length; i++) m = Math.max(m, Math.abs(this.springs[i].strain));
    return m;
  };
})(window.G);
