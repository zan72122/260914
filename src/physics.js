import * as CANNON from 'cannon-es';

// cannon-es ラッパ。接触イベントはキューに溜め、step の後で処理する（step 中の world 変更を避ける）。
export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.35;
  world.defaultContactMaterial.restitution = 0.15;

  const mat = {
    def: world.defaultMaterial,
    ball: new CANNON.Material('ball'),
    iron: new CANNON.Material('iron'),
    cloud: new CANNON.Material('cloud'),
  };
  world.addContactMaterial(new CANNON.ContactMaterial(mat.ball, mat.iron, { friction: 0.1, restitution: 0.85 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mat.ball, mat.def, { friction: 0.3, restitution: 0.3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(mat.ball, mat.cloud, { friction: 0.0, restitution: 0.0 }));

  const contacts = [];
  world.addEventListener('beginContact', (e) => { contacts.push([e.bodyA, e.bodyB]); });

  let acc = 0;
  const FIXED = 1 / 60;
  return {
    world, mat, CANNON,
    step(dt) {
      acc += Math.min(dt, 0.1);
      let n = 0;
      while (acc >= FIXED && n < 4) { world.step(FIXED); acc -= FIXED; n++; }
      if (acc >= FIXED) acc = 0;
      const out = contacts.slice();
      contacts.length = 0;
      return out;
    },
    makeDynamic(body, mass) {
      body.type = CANNON.Body.DYNAMIC;
      body.mass = mass;
      body.updateMassProperties();
      body.allowSleep = false;
      body.wakeUp();
    },
  };
}
