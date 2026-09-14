/** 木・家・雪だるまなどの飾り。原点は足元。 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry } from 'three';
import { mat } from '../materials';
import type { Theme } from '../themes';

function m(geo: BoxGeometry | CylinderGeometry | SphereGeometry | ConeGeometry, color: string, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function buildTree(theme: Theme, scale = 1): Group {
  const g = new Group();
  g.add(m(new CylinderGeometry(0.1, 0.13, 0.6, 8), theme.trunk, 0, 0.3));
  if (theme.palm) {
    for (let i = 0; i < 4; i++) {
      const leaf = m(new BoxGeometry(0.7, 0.08, 0.28), theme.tree, 0, 0.7, 0);
      leaf.rotation.y = (i / 4) * Math.PI * 2;
      leaf.rotation.z = 0.3;
      leaf.position.x = Math.cos((i / 4) * Math.PI * 2) * 0.3;
      leaf.position.z = -Math.sin((i / 4) * Math.PI * 2) * 0.3;
      g.add(leaf);
    }
  } else if (theme.snow) {
    g.add(m(new ConeGeometry(0.45, 0.9, 8), theme.tree, 0, 0.95));
    g.add(m(new ConeGeometry(0.3, 0.5, 8), '#ffffff', 0, 1.3));
  } else {
    g.add(m(new SphereGeometry(0.45, 10, 8), theme.tree, 0, 0.95));
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildHouse(theme: Theme): Group {
  const g = new Group();
  g.add(m(new BoxGeometry(0.8, 0.6, 0.7), theme.house, 0, 0.3));
  const roof = m(new ConeGeometry(0.62, 0.45, 4), theme.roof, 0, 0.82);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(m(new BoxGeometry(0.2, 0.3, 0.05), theme.roof, 0.15, 0.15, 0.36));
  g.add(m(new BoxGeometry(0.16, 0.16, 0.05), '#f9e8a8', -0.2, 0.36, 0.36));
  return g;
}

export function buildSnowman(): Group {
  const g = new Group();
  g.add(m(new SphereGeometry(0.32, 10, 8), '#ffffff', 0, 0.3));
  g.add(m(new SphereGeometry(0.22, 10, 8), '#ffffff', 0, 0.72));
  const nose = m(new ConeGeometry(0.05, 0.2, 6), '#f2a33a', 0.25, 0.72);
  nose.rotation.z = -Math.PI / 2;
  g.add(nose);
  return g;
}
