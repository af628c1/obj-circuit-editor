import * as THREE from 'three';
import { Part } from './Part';

const CAP_UP = 0.045;
const CAP_DOWN = 0.034;

/** 12 mm momentary tactile push button. Origin is the bottom of the body. */
export class Button extends Part {
  private readonly cap: THREE.Mesh;
  private _pressed = false;

  constructor(id: string) {
    super(id, 'button');

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.09).translate(0, 0.015, 0), bodyMat);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.094, 0.004, 0.094).translate(0, 0.032, 0),
      new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: 0.8, roughness: 0.35 }),
    );
    this.cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.028, 0.03, 32),
      new THREE.MeshStandardMaterial({ color: 0x4c8dff, roughness: 0.45 }),
    );
    this.root.add(body, plate, this.cap);

    const legMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
    for (const x of [-0.04, 0.04]) {
      this.root.add(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.04, 0.012).translate(x, -0.012, 0), legMat));
    }

    this.addPin('a', 'Pin 1', new THREE.Vector3(-0.04, -0.032, 0), 0x8a9099);
    this.addPin('b', 'Pin 2', new THREE.Vector3(0.04, -0.032, 0), 0x8a9099);

    this.tagMeshes();
    this.update();
  }

  get pressed() {
    return this._pressed;
  }

  set pressed(on: boolean) {
    this._pressed = on;
    this.update();
  }

  private update() {
    this.cap.position.y = this._pressed ? CAP_DOWN : CAP_UP;
  }
}
