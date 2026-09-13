import * as THREE from 'three';

// 空のグラデーション(CSS)とライトの色を面ごとに補間する
export function createSky(scene, hemi, sun) {
  const cur = { sky: ['#f9e4cf', '#f3c9c0', '#c9b8d8'], light: { sky: 0xfff4e0, ground: 0xc9b0d8, sun: 0xfff2dc } };
  const from = { sky: cur.sky.map((c) => new THREE.Color(c)), hemiSky: new THREE.Color(cur.light.sky), hemiGround: new THREE.Color(cur.light.ground), sun: new THREE.Color(cur.light.sun) };
  const to = { sky: from.sky.map((c) => c.clone()), hemiSky: from.hemiSky.clone(), hemiGround: from.hemiGround.clone(), sun: from.sun.clone() };
  let t = 1;
  let dur = 1;

  // 星
  const starGeo = new THREE.BufferGeometry();
  const N = 160;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = 8 + Math.random() * 25;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  let starsTarget = 0;

  function apply(k) {
    const c = (a, b) => a.clone().lerp(b, k);
    const s = from.sky.map((a, i) => '#' + c(a, to.sky[i]).getHexString());
    document.body.style.background = `linear-gradient(180deg, ${s[0]} 0%, ${s[1]} 55%, ${s[2]} 100%)`;
    hemi.color.copy(c(from.hemiSky, to.hemiSky));
    hemi.groundColor.copy(c(from.hemiGround, to.hemiGround));
    sun.color.copy(c(from.sun, to.sun));
  }

  return {
    set(level, duration = 0) {
      from.sky = to.sky.map((c) => c.clone());
      from.hemiSky = to.hemiSky.clone();
      from.hemiGround = to.hemiGround.clone();
      from.sun = to.sun.clone();
      to.sky = level.sky.map((c) => new THREE.Color(c));
      to.hemiSky = new THREE.Color(level.light.sky);
      to.hemiGround = new THREE.Color(level.light.ground);
      to.sun = new THREE.Color(level.light.sun);
      starsTarget = level.stars ? 0.9 : 0;
      dur = Math.max(0.001, duration);
      t = duration > 0 ? 0 : 1;
      if (duration === 0) apply(1);
    },
    update(dt, time) {
      if (t < 1) {
        t = Math.min(1, t + dt / dur);
        const e = t * t * (3 - 2 * t);
        apply(e);
      }
      starMat.opacity += (starsTarget - starMat.opacity) * Math.min(1, dt * 1.5);
      starMat.size = 0.08 + Math.sin(time * 1.3) * 0.02;
      stars.visible = starMat.opacity > 0.01;
    },
  };
}
