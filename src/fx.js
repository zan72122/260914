import * as THREE from 'three';

// 粒子（きらめき・欠片の粉・爆発）。1つの Points に全粒子を載せる。
export function createFx(scene) {
  const MAX = 900;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const base = new Float32Array(MAX);
  let head = 0, alive = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize; attribute vec3 color; varying vec3 vC;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize = aSize * (300.0/ -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `
      varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=smoothstep(0.5,0.1,r); gl_FragColor=vec4(vC*a,a); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -999;

  const c = new THREE.Color();
  function burst(p, color, n = 12, speed = 4, sz = 0.35, lifeS = 0.8, spread = 1) {
    c.set(color);
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % MAX;
      pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = speed * (0.3 + Math.random() * 0.7);
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
      vel[i * 3 + 1] = Math.cos(ph) * s + speed * 0.3;
      vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      const j = 0.85 + Math.random() * 0.3;
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
      life[i] = maxLife[i] = lifeS * (0.6 + Math.random() * 0.6);
      size[i] = base[i] = sz * (0.6 + Math.random() * 0.8);
    }
    alive = MAX;
  }

  return {
    burst,
    sparkle(p, color = 0xffffff, n = 10) { burst(p, color, n, 2.5, 0.3, 0.7, 0.4); },
    dust(p, color, n = 10) { burst(p, color, n, 3.5, 0.25, 0.6, 0.6); },
    explode(p) { burst(p, 0xffb060, 60, 9, 0.6, 0.9, 0.5); burst(p, 0xff5030, 30, 6, 0.9, 0.6, 0.3); },
    celebrate(center, spread) { for (let i = 0; i < 6; i++) burst(center, [0xffe27a, 0xa0e8ff, 0xffa8d8, 0xbfffb0, 0xffffff][i % 5], 40, 6, 0.5, 1.6, spread); },
    update(dt) {
      if (!alive) return;
      let any = false;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        vel[i * 3 + 1] -= 6 * dt;
        vel[i * 3] *= 1 - dt * 1.5; vel[i * 3 + 2] *= 1 - dt * 1.5;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = life[i] / maxLife[i];
        size[i] = base[i] * (0.3 + 0.7 * k);
      }
      if (!any) alive = 0;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}
