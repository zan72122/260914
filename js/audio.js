// All sound is synthesized with Web Audio; no audio files.
window.G = window.G || {};
(function (G) {
  var A = G.audio = { ctx: null, master: null, bgmGain: null, bgm: null, key: -1, lastCreak: 0 };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume(); return; }
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    A.ctx = new C();
    A.master = A.ctx.createGain(); A.master.gain.value = 0.6; A.master.connect(A.ctx.destination);
    A.bgmGain = A.ctx.createGain(); A.bgmGain.gain.value = 0.22; A.bgmGain.connect(A.master);
    if (A.ctx.state !== 'running') A.ctx.resume();
    if (A.pendingKey >= 0) A.startBgm(A.pendingKey);
  };

  function tone(freq, dur, type, vol, slide, when) {
    if (!A.ctx) return;
    var c = A.ctx, t = when || c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    if (!A.ctx) return;
    var c = A.ctx, n = c.sampleRate * dur, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource(); s.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 1500; f.Q.value = 0.7;
    var g = c.createGain(); g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(A.master); s.start();
  }

  A.se = function (name) {
    if (!A.ctx) return;
    var t = A.ctx.currentTime;
    switch (name) {
      case 'pick': tone(520, 0.12, 'sine', 0.25, 1.6); break;              // きゅっ
      case 'place': tone(300, 0.18, 'sine', 0.3, 0.6); tone(600, 0.08, 'triangle', 0.15, 0.8, t + 0.06); break; // ぷにゅ
      case 'link': tone(880, 0.1, 'triangle', 0.18, 1.2); break;            // ぽん
      case 'drop': tone(200, 0.2, 'sine', 0.25, 0.5); break;                // ぽて
      case 'bounce': tone(260, 0.08, 'sine', 0.12, 1.3); break;
      case 'creak':
        if (t - A.lastCreak < 0.6) return; A.lastCreak = t;
        tone(140, 0.35, 'sawtooth', 0.06, 0.7); noise(0.3, 0.05, 400); break;
      case 'suck': tone(400, 0.25, 'sine', 0.25, 3.0); noise(0.2, 0.08, 2500); break; // ちゅるっ
      case 'gulp': tone(180, 0.3, 'sine', 0.3, 0.4); break;
      case 'win':
        [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.5, 'triangle', 0.22, 1, t + i * 0.12); });
        tone(1319, 0.9, 'sine', 0.2, 1, t + 0.5); noise(0.6, 0.12, 3000); break;
      case 'pop': tone(700, 0.06, 'square', 0.08, 1.5); break;
      case 'hop': tone(440, 0.07, 'sine', 0.1, 1.5); break;
    }
  };

  // Music-box loops, one per level (pentatonic patterns).
  var SONGS = [
    { root: 261.63, bass: [0, 7, 5, 7], mel: [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4], step: 0.28 },
    { root: 220.00, bass: [0, 5, 7, 5], mel: [12, 9, 7, 4, 7, 9, 12, 14, 12, 9, 7, 4, 2, 4, 7, 9], step: 0.3 },
    { root: 196.00, bass: [0, 7, 9, 5], mel: [7, 12, 16, 19, 16, 12, 7, 9, 12, 16, 14, 12, 9, 7, 4, 7], step: 0.32 }
  ];
  function semis(root, s) { return root * Math.pow(2, s / 12); }
  A.pendingKey = -1;
  A.startBgm = function (key) {
    A.pendingKey = key;
    if (!A.ctx) return;
    if (A.key === key && A.bgm) return;
    A.stopBgm(); A.key = key;
    var song = SONGS[key % SONGS.length], c = A.ctx, i = 0, next = c.currentTime + 0.1;
    var timer = setInterval(function () {
      while (next < c.currentTime + 0.35) {
        var m = song.mel[i % song.mel.length];
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = semis(song.root * 2, m);
        g.gain.setValueAtTime(0.0001, next); g.gain.exponentialRampToValueAtTime(0.5, next + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, next + song.step * 1.6);
        o.connect(g); g.connect(A.bgmGain); o.start(next); o.stop(next + song.step * 1.7);
        if (i % 4 === 0) {
          var b = song.bass[(i / 4) % song.bass.length];
          var ob = c.createOscillator(), gb = c.createGain();
          ob.type = 'triangle'; ob.frequency.value = semis(song.root / 2, b);
          gb.gain.setValueAtTime(0.0001, next); gb.gain.exponentialRampToValueAtTime(0.35, next + 0.02);
          gb.gain.exponentialRampToValueAtTime(0.0001, next + song.step * 3.8);
          ob.connect(gb); gb.connect(A.bgmGain); ob.start(next); ob.stop(next + song.step * 4);
        }
        next += song.step; i++;
      }
    }, 100);
    A.bgm = { timer: timer };
  };
  A.stopBgm = function () {
    if (A.bgm) { clearInterval(A.bgm.timer); A.bgm = null; A.key = -1; }
  };
})(window.G);
