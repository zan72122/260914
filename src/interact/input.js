import * as THREE from 'three';

// Pointer Events を統合し、タップ / 物のドラッグ / 箱の回転 を判定する。
export function createInput({ canvas, camera, scene, onRotate, onRotateEnd, onTapNothing, onActivity }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false, ndc: new THREE.Vector2(), active: false, lastMove: 0 };
  let dragInter = null;
  let dragMode = null; // 'screen' | 'floor' | 'rotate' | null
  let activeId = null;
  const plane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();

  function toNdc(e) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    pointer.ndc.copy(ndc);
  }

  function pick() {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.interactable) return { inter: o.userData.interactable, point: h.point, object: o };
        o = o.parent;
      }
    }
    return null;
  }

  function down(e) {
    if (activeId !== null) return; // 1本指のみ
    activeId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    onActivity?.();
    toNdc(e);
    pointer.down = true;
    pointer.active = true;
    pointer.moved = false;
    pointer.sx = pointer.x = e.clientX;
    pointer.sy = pointer.y = e.clientY;
    dragInter = null;
    dragMode = null;
    const hit = pick();
    if (hit) {
      dragInter = hit.inter;
      if (hit.inter.drag === 'floor') {
        dragMode = 'floor';
        plane.set(new THREE.Vector3(0, 1, 0), -hit.inter.dragHeight);
        hit.inter.onDragStart?.();
      } else if (hit.inter.onDrag) {
        dragMode = 'screen';
        hit.inter.onDragStart?.();
      }
    }
  }

  function move(e) {
    toNdc(e);
    pointer.active = true;
    pointer.lastMove = performance.now();
    if (!pointer.down || e.pointerId !== activeId) return;
    onActivity?.();
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    const tdx = e.clientX - pointer.sx, tdy = e.clientY - pointer.sy;
    if (!pointer.moved && Math.hypot(tdx, tdy) > 10) {
      pointer.moved = true;
      if (!dragMode) dragMode = 'rotate';
    }
    if (dragMode === 'screen') {
      dragInter.onDrag({ dx: tdx, dy: tdy, ddx: dx, ddy: dy });
    } else if (dragMode === 'floor') {
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hitPoint)) dragInter.onDragMove?.(hitPoint);
    } else if (dragMode === 'rotate') {
      onRotate?.(dx);
    }
  }

  function up(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    toNdc(e);
    pointer.down = false;
    if (dragMode === 'screen' || dragMode === 'floor') {
      if (!pointer.moved) dragInter.onTap?.();
      dragInter.onDragEnd?.();
    } else if (dragMode === 'rotate') {
      onRotateEnd?.();
    } else if (!pointer.moved) {
      if (dragInter) dragInter.onTap?.();
      else {
        raycaster.setFromCamera(ndc, camera);
        onTapNothing?.(raycaster.ray.at(3, new THREE.Vector3()));
      }
    }
    dragInter = null;
    dragMode = null;
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('gesturestart', (e) => e.preventDefault());

  return { pointer };
}
