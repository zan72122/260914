/** 8 楽器の 3D 玩具。原点は足元(y=0)、高さ約 0.9。 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry } from 'three';
import type { InstrumentId } from '../../app/state';
import { mat, PALETTE } from '../materials';

function m(geo: BoxGeometry | CylinderGeometry | SphereGeometry | ConeGeometry | TorusGeometry, color: string, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

export function buildInstrument(id: InstrumentId): Group {
  const g = new Group();
  g.name = `inst:${id}`;
  switch (id) {
    case 'drum': {
      g.add(m(new CylinderGeometry(0.42, 0.42, 0.55, 16), PALETTE.red, 0, 0.275));
      g.add(m(new CylinderGeometry(0.44, 0.44, 0.06, 16), PALETTE.cream, 0, 0.56));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(m(new BoxGeometry(0.05, 0.5, 0.05), PALETTE.cream, Math.cos(a) * 0.43, 0.28, Math.sin(a) * 0.43));
      }
      break;
    }
    case 'clap': {
      const a = m(new SphereGeometry(0.36, 14, 10), '#a2643a', 0, 0.2); a.scale.set(1, 0.5, 0.8); g.add(a);
      const b = m(new SphereGeometry(0.36, 14, 10), '#c98a4b', 0.05, 0.5, 0); b.scale.set(1, 0.5, 0.8); b.rotation.z = -0.25; g.add(b);
      g.add(m(new BoxGeometry(0.06, 0.3, 0.06), PALETTE.dark, -0.34, 0.45, 0));
      break;
    }
    case 'shaker': {
      const egg = m(new SphereGeometry(0.34, 14, 12), PALETTE.yellow, 0, 0.62); egg.scale.set(1, 1.25, 1); g.add(egg);
      g.add(m(new CylinderGeometry(0.09, 0.11, 0.35, 10), PALETTE.woodDark, 0, 0.17));
      for (const [x, y, z] of [[0.2, 0.75, 0.25], [-0.25, 0.55, 0.2], [0.1, 0.9, -0.3]]) g.add(m(new SphereGeometry(0.05, 8, 6), PALETTE.red, x, y, z));
      break;
    }
    case 'bell': {
      g.add(m(new CylinderGeometry(0.16, 0.42, 0.62, 16), '#e0a92c', 0, 0.36));
      g.add(m(new CylinderGeometry(0.44, 0.44, 0.08, 16), '#b8801a', 0, 0.06));
      g.add(m(new SphereGeometry(0.09, 10, 8), '#7a4f10', 0, 0.72));
      g.add(m(new SphereGeometry(0.09, 10, 8), '#7a4f10', 0, 0.06));
      break;
    }
    case 'bird': {
      const body = m(new SphereGeometry(0.36, 14, 12), PALETTE.blue, 0, 0.4); body.scale.set(1.15, 0.9, 0.9); g.add(body);
      const beak = m(new ConeGeometry(0.1, 0.25, 8), PALETTE.orange, 0.45, 0.42); beak.rotation.z = -Math.PI / 2; g.add(beak);
      g.add(m(new SphereGeometry(0.06, 8, 6), '#ffffff', 0.25, 0.55, 0.2));
      g.add(m(new SphereGeometry(0.06, 8, 6), '#ffffff', 0.25, 0.55, -0.2));
      g.add(m(new SphereGeometry(0.03, 6, 5), PALETTE.black, 0.3, 0.55, 0.22));
      g.add(m(new SphereGeometry(0.03, 6, 5), PALETTE.black, 0.3, 0.55, -0.22));
      const wing = m(new SphereGeometry(0.2, 10, 8), '#3a6fb0', -0.1, 0.42, 0); wing.scale.set(1.2, 0.5, 1.6); g.add(wing);
      g.add(m(new BoxGeometry(0.05, 0.12, 0.05), PALETTE.orange, 0.08, 0.05, 0.1));
      g.add(m(new BoxGeometry(0.05, 0.12, 0.05), PALETTE.orange, 0.08, 0.05, -0.1));
      break;
    }
    case 'marimba': {
      g.add(m(new BoxGeometry(0.9, 0.16, 0.34), PALETTE.wood, 0, 0.16));
      g.add(m(new BoxGeometry(0.1, 0.1, 0.4), PALETTE.woodDark, -0.3, 0.05));
      g.add(m(new BoxGeometry(0.1, 0.1, 0.4), PALETTE.woodDark, 0.3, 0.05));
      const stick = m(new CylinderGeometry(0.03, 0.03, 0.6, 6), PALETTE.woodDark, 0.2, 0.5, 0.05); stick.rotation.z = -0.5; g.add(stick);
      g.add(m(new SphereGeometry(0.1, 10, 8), PALETTE.red, 0.34, 0.76, 0.05));
      break;
    }
    case 'flute': {
      const tube = m(new CylinderGeometry(0.1, 0.1, 1.0, 10), PALETTE.woodDark, 0, 0.25); tube.rotation.z = Math.PI / 2 - 0.35; g.add(tube);
      for (let i = 0; i < 4; i++) {
        const t = -0.3 + i * 0.2;
        g.add(m(new SphereGeometry(0.035, 6, 5), PALETTE.black, Math.cos(0.35) * t, 0.25 + Math.sin(0.35) * t + 0.1, 0));
      }
      g.add(m(new CylinderGeometry(0.12, 0.12, 0.05, 6), PALETTE.woodLight, 0, 0.03));
      break;
    }
    case 'frog': {
      const body = m(new SphereGeometry(0.4, 14, 12), PALETTE.green, 0, 0.32); body.scale.set(1.1, 0.75, 1); g.add(body);
      g.add(m(new SphereGeometry(0.13, 10, 8), PALETTE.green, 0.18, 0.62, 0.2));
      g.add(m(new SphereGeometry(0.13, 10, 8), PALETTE.green, 0.18, 0.62, -0.2));
      g.add(m(new SphereGeometry(0.07, 8, 6), '#ffffff', 0.28, 0.65, 0.2));
      g.add(m(new SphereGeometry(0.07, 8, 6), '#ffffff', 0.28, 0.65, -0.2));
      g.add(m(new SphereGeometry(0.035, 6, 5), PALETTE.black, 0.34, 0.66, 0.2));
      g.add(m(new SphereGeometry(0.035, 6, 5), PALETTE.black, 0.34, 0.66, -0.2));
      g.add(m(new TorusGeometry(0.18, 0.03, 6, 12, Math.PI), '#2f7a2f', 0.25, 0.3, 0)).rotation.set(Math.PI / 2, 0, Math.PI);
      break;
    }
  }
  return g;
}

/** 鳴った直後の跳ね・揺れを適用する(hit: 0 で今鳴った, 1 で落ち着いた) */
export function applyBounce(g: Group, hit: number, base = 1): void {
  const w = Math.sin(hit * Math.PI * 3) * (1 - hit);
  g.scale.set(base * (1 + Math.abs(w) * 0.15), base * (1 - Math.abs(w) * 0.12), base * (1 + Math.abs(w) * 0.15));
  g.rotation.z = w * 0.15;
}
