import * as THREE from 'three';
import type { Part } from '../parts/Part';

export const WIRE_COLORS = [0xe5484d, 0x1f2329, 0x3e8ef7, 0x30a46c, 0xf5a524, 0x8e4ec6];

export interface WireEnd {
  part: Part;
  pin: string;
}

const RADIUS = 0.008;

/**
 * Build the curve a wire follows: leave each pin along its lead direction,
 * then hang between the two with a little sag.
 */
export function wireCurve(
  a: THREE.Vector3,
  aDir: THREE.Vector3,
  b: THREE.Vector3,
  bDir: THREE.Vector3,
): THREE.CatmullRomCurve3 {
  const dist = a.distanceTo(b);
  const lead = THREE.MathUtils.clamp(dist * 0.25, 0.03, 0.15);
  const a1 = a.clone().addScaledVector(aDir, lead);
  const b1 = b.clone().addScaledVector(bDir, lead);
  const mid = a1.clone().add(b1).multiplyScalar(0.5);
  mid.y -= dist * 0.12;
  return new THREE.CatmullRomCurve3([a, a1, mid, b1, b], false, 'centripetal');
}

export class Wire {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly lastA = new THREE.Vector3(NaN);
  private readonly lastB = new THREE.Vector3(NaN);
  private readonly lastDirA = new THREE.Vector3();
  private readonly lastDirB = new THREE.Vector3();

  constructor(
    readonly id: string,
    readonly from: WireEnd,
    readonly to: WireEnd,
    readonly color: number,
  ) {
    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.userData.wireId = id;
    this.update();
  }

  connects(part: Part) {
    return this.from.part === part || this.to.part === part;
  }

  /** Rebuild the tube if either end has moved. Cheap to call every frame. */
  update() {
    const a = this.from.part.pinWorldPosition(this.from.pin);
    const b = this.to.part.pinWorldPosition(this.to.pin);
    const aDir = this.from.part.pinWorldDirection(this.from.pin);
    const bDir = this.to.part.pinWorldDirection(this.to.pin);
    if (
      a.equals(this.lastA) &&
      b.equals(this.lastB) &&
      aDir.equals(this.lastDirA) &&
      bDir.equals(this.lastDirB)
    ) {
      return;
    }
    this.lastA.copy(a);
    this.lastB.copy(b);
    this.lastDirA.copy(aDir);
    this.lastDirB.copy(bDir);

    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(wireCurve(a, aDir, b, bDir), 48, RADIUS, 8, false);
  }

  setSelected(on: boolean) {
    this.material.emissive.set(on ? 0x3b82f6 : 0x000000);
    this.material.emissiveIntensity = on ? 0.9 : 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
