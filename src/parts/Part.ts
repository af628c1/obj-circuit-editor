import * as THREE from 'three';
import type { PartType } from '../sim/circuit';

export interface Pin {
  name: string;
  label: string;
  mesh: THREE.Mesh;
}

const PIN_RADIUS = 0.016;
const pinGeometry = new THREE.SphereGeometry(PIN_RADIUS, 16, 12);
const HIGHLIGHT = new THREE.Color(0x3b82f6);

/** Base for every placeable component: a root group plus named connection pins. */
export abstract class Part {
  readonly root = new THREE.Group();
  readonly pins: Pin[] = [];

  constructor(
    readonly id: string,
    readonly type: PartType,
  ) {
    this.root.name = id;
    this.root.userData.partId = id;
  }

  /** Call once the subclass has built its meshes so raycasts resolve back to this part. */
  protected tagMeshes() {
    this.root.traverse((o) => {
      o.userData.partId = this.id;
    });
  }

  protected addPin(name: string, label: string, position: THREE.Vector3, color: number) {
    const mesh = new THREE.Mesh(
      pinGeometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 }),
    );
    mesh.position.copy(position);
    mesh.userData.pin = name;
    mesh.userData.baseColor = color;
    this.root.add(mesh);
    this.pins.push({ name, label, mesh });
  }

  pin(name: string): Pin {
    const p = this.pins.find((p) => p.name === name);
    if (!p) throw new Error(`${this.id} has no pin "${name}"`);
    return p;
  }

  pinWorldPosition(name: string, target = new THREE.Vector3()): THREE.Vector3 {
    return this.pin(name).mesh.getWorldPosition(target);
  }

  /** Direction a wire should leave the pin in, in world space. */
  pinWorldDirection(_name: string, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(0, -1, 0).transformDirection(this.root.matrixWorld);
  }

  highlightPin(name: string | null) {
    for (const p of this.pins) {
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      const on = p.name === name;
      mat.color.set(on ? HIGHLIGHT : p.mesh.userData.baseColor);
      p.mesh.scale.setScalar(on ? 1.5 : 1);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.geometry !== pinGeometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
}
