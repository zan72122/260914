/** 紙吹雪・蒸気などの一時的なもの。 */
import { Group, Mesh, BoxGeometry, SphereGeometry, Vector3, MeshBasicMaterial } from 'three';
import { mat } from './materials';

interface Confetti { mesh: Mesh; vel: Vector3; spin: Vector3; born: number; life: number }
interface Puff { mesh: Mesh; born: number; drift: number }

const confettiGeo = new BoxGeometry(0.18, 0.02, 0.12);
const puffGeo = new SphereGeometry(0.5, 8, 6);

export class Effects {
  readonly group = new Group();
  private confetti: Confetti[] = [];
  private puffs: Puff[] = [];

  spawnConfetti(at: Vector3, color: string, count: number, now: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new Mesh(confettiGeo, mat(color));
      mesh.position.copy(at);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      const a = Math.random() * Math.PI * 2;
      const vel = new Vector3(Math.cos(a) * (0.6 + Math.random() * 1.2), 2.5 + Math.random() * 2, Math.sin(a) * (0.6 + Math.random() * 1.2));
      this.group.add(mesh);
      this.confetti.push({ mesh, vel, spin: new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), born: now, life: 1.0 + Math.random() * 0.5 });
    }
    while (this.confetti.length > 120) this.group.remove(this.confetti.shift()!.mesh);
  }

  spawnPuff(at: Vector3, now: number, size = 0.35): void {
    const mesh = new Mesh(puffGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    mesh.position.copy(at);
    mesh.scale.setScalar(size);
    this.group.add(mesh);
    this.puffs.push({ mesh, born: now, drift: (Math.random() - 0.5) * 0.3 });
    while (this.puffs.length > 30) this.group.remove(this.puffs.shift()!.mesh);
  }

  update(dt: number, now: number): void {
    for (const c of this.confetti) {
      c.vel.y -= 9 * dt;
      c.vel.x *= 0.98; c.vel.z *= 0.98;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt;
    }
    this.confetti = this.confetti.filter((c) => {
      const alive = now - c.born < c.life;
      if (!alive) this.group.remove(c.mesh);
      return alive;
    });
    for (const p of this.puffs) {
      const t = (now - p.born) / 1.6;
      p.mesh.position.y += dt * 1.2;
      p.mesh.position.x += p.drift * dt;
      const s = p.mesh.scale.x + dt * 0.5;
      p.mesh.scale.setScalar(s);
      (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.7 * (1 - t));
    }
    this.puffs = this.puffs.filter((p) => {
      const alive = now - p.born < 1.6;
      if (!alive) { this.group.remove(p.mesh); (p.mesh.material as MeshBasicMaterial).dispose(); }
      return alive;
    });
  }
}
