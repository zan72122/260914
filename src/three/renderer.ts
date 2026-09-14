/** WebGLRenderer・カメラ・光。DPR 上限 2、影あり。 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, Color, PCFSoftShadowMap,
  Vector3, Box3, Object3D, Group,
} from 'three';

export const CAM_FOV = 32;
const ELEV = 35 * Math.PI / 180;   // 見下ろし角
const AZIM = 38 * Math.PI / 180;   // 方位(右前から)

export class View {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  /** 台全体を包む枠。レベルごとに更新する。 */
  private bounds = new Box3(new Vector3(-5, 0, -4), new Vector3(5, 3, 4));
  private target = new Vector3();
  private dist = 30;
  /** 揺れなしのカメラ位置(揺れは毎フレーム足す) */
  private base = new Vector3();
  /** 演出用の寄り(0 = 通常, 1 = 寄る) */
  zoom = 0;
  /** 画面下のトレイが占める割合(0 で無し) */
  trayFraction = 0.18;
  width = 1; height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.camera = new PerspectiveCamera(CAM_FOV, 1, 0.5, 200);
    this.scene.add(this.camera);

    const hemi = new HemisphereLight(0xffffff, 0x8a6a4a, 0.9);
    this.scene.add(hemi);
    this.sun = new DirectionalLight(0xfff4e0, 1.6);
    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    const s = 12;
    this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s; this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 60;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setBackground(color: string): void {
    this.scene.background = new Color(color);
  }

  resize(w: number, h: number): void {
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  /** 台の枠を設定してカメラ距離を決め直す */
  frame(obj: Object3D | Box3): void {
    if (obj instanceof Box3) this.bounds.copy(obj);
    else this.bounds.setFromObject(obj);
    this.fit();
  }

  /** 枠の 8 隅が縦横どちらにも収まる最短距離を求める(トレイの分は画面下を空ける) */
  private fit(): void {
    const b = this.bounds;
    const center = b.getCenter(new Vector3());
    const vfov = (CAM_FOV * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dir = this.viewDir();
    const up = new Vector3(0, 1, 0);
    const right = new Vector3().crossVectors(up, dir).normalize();
    const camUp = new Vector3().crossVectors(dir, right).normalize();
    // 画面下 trayFraction を空ける: 上端は tan(v/2), 下端は tan(v/2)·(1 − 2·trayFraction)
    const tanH = Math.tan(hfov / 2);
    const tanTop = Math.tan(vfov / 2);
    const tanBottom = Math.tan(vfov / 2) * (1 - 2 * this.trayFraction);
    // 注視点を下端寄りにずらすので、使える縦の半角は上下の平均になる
    const tanV = (tanTop + tanBottom) / 2;
    let need = 1;
    for (let i = 0; i < 8; i++) {
      const c = new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(center);
      const depth = c.dot(dir);           // カメラ側が正
      const x = c.dot(right), y = c.dot(camUp);
      need = Math.max(need, Math.abs(x) / tanH + depth);
      need = Math.max(need, Math.abs(y) / tanV + depth);
    }
    // 縦画面では横幅で決まるので、少しはみ出させて大きく見せる
    this.dist = need * (this.camera.aspect < 1 ? 0.9 : 1.02);
    // 上端・下端の余白が等しくなるよう、注視点を画面上で下端寄りに置く
    const shift = (tanTop - tanBottom) / 2 * this.dist;
    this.target.copy(center).sub(camUp.multiplyScalar(shift));
    this.sun.target.position.copy(center);
  }

  private viewDir(): Vector3 {
    return new Vector3(Math.sin(AZIM) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(AZIM) * Math.cos(ELEV)).normalize();
  }

  /** 毎フレーム: ゆっくり揺れる + 演出の寄り */
  updateCamera(time: number): void {
    const sway = Math.sin(time * (2 * Math.PI / 9)) * 1.5 * Math.PI / 180;
    const az = AZIM + sway;
    const el = ELEV + Math.sin(time * (2 * Math.PI / 13)) * 0.6 * Math.PI / 180;
    const d = this.dist * (1 - this.zoom * 0.12);
    this.base.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(this.target);
    this.camera.position.copy(this.base);
    this.camera.lookAt(this.target);
  }

  /** ワールド座標 → 画面座標(px) */
  project(p: Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** カメラに固定したグループ(トレイなど)。画面下端に置く。 */
  attachToCamera(g: Group, depth: number, bottomFraction: number): void {
    const vfov = (CAM_FOV * Math.PI) / 180;
    const halfH = Math.tan(vfov / 2) * depth;
    g.position.set(0, -halfH * (1 - bottomFraction), -depth);
    this.camera.add(g);
  }
}
