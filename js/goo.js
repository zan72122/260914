// A goo ball: a physics node plus a tiny state machine and a face.
window.G = window.G || {};
(function (G) {
  var id = 0;
  G.Goo = function (x, y) {
    this.id = id++;
    this.node = new G.Node(x, y, G.R);
    this.state = 'free';   // free | strand | held | fixed | sucked | gone
    this.walk = Math.random() < 0.5 ? 1 : -1;
    this.wait = Math.random() * 2;
    this.phase = Math.random() * Math.PI * 2;
    this.blink = 1 + Math.random() * 4;
    this.blinkT = 0;
    this.look = { x: 0, y: 0 };
    this.squash = 0;       // transient squash on landing / pick
    // strand walking
    this.spring = null; this.from = null; this.to = null; this.t = 0;
    this.atNode = null; this.idle = 0;
    // suction animation
    this.suck = null;
  };
  G.Goo.prototype.pos = function () {
    if (this.state === 'strand' && this.spring) {
      var a = this.from, b = this.to;
      return { x: a.x + (b.x - a.x) * this.t, y: a.y + (b.y - a.y) * this.t - G.R * 0.9 };
    }
    if (this.state === 'sucked' && this.suck) {
      var s = this.suck, k = Math.min(1, s.t / s.dur);
      var e = k * k * (3 - 2 * k);
      return { x: s.x0 + (s.x1 - s.x0) * e, y: s.y0 + (s.y1 - s.y0) * e - Math.sin(k * Math.PI) * 30 };
    }
    return { x: this.node.x, y: this.node.y };
  };
  G.Goo.prototype.pickable = function () {
    return this.state === 'free' || this.state === 'strand';
  };
})(window.G);
