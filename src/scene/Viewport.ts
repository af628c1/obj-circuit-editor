import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Renderer, camera, lights, ground grid and the render loop. */
export class Viewport {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly grid: THREE.GridHelper;
  /** Invisible plane used as a drop target when the model is missed. */
  readonly ground: THREE.Mesh;
  private readonly beforeRender: Array<() => void> = [];

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    this.camera.position.set(3.2, 2.4, 3.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0.6, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 6, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(10, 40, 0x9aa3b2, 0xc9ced8);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.5;
    this.scene.add(this.grid);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.scene.add(this.ground);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Re-tint the grid to match the current color scheme. */
  setDark(dark: boolean) {
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    const fresh = dark
      ? new THREE.GridHelper(10, 40, 0x4a5262, 0x2c323d)
      : new THREE.GridHelper(10, 40, 0x9aa3b2, 0xc9ced8);
    this.grid.geometry = fresh.geometry;
    this.grid.material = fresh.material;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.5;
    this.scene.add(this.grid);
  }

  onBeforeRender(fn: () => void) {
    this.beforeRender.push(fn);
  }

  /** Normalized device coords for a pointer event over the canvas. */
  ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Point the camera at a bounding box so it fills the view. */
  frameBox(box: THREE.Box3) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, size * 1.25);
    this.controls.update();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    this.controls.update();
    for (const fn of this.beforeRender) fn();
    this.renderer.render(this.scene, this.camera);
  }
}
