import * as THREE from 'three';
import { Part } from './Part';

const LEVER_TILT = 0.45;

/** Toggle switch (SPST). Stays on or off until flipped. Origin is the bottom of the body. */
export class Switch extends Part {
  private readonly lever: THREE.Group;
  private readonly tip: THREE.MeshStandardMaterial;
  private _closed = false;

  constructor(id: string) {
    super(id, 'switch');

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.035, 0.05).translate(0, 0.0175, 0),
      new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }),
    );
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.012, 24).translate(0, 0.041, 0),
      new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: 0.8, roughness: 0.35 }),
    );
    this.root.add(body, collar);

    // The lever pivots about the collar and leans toward the "on" side when closed.
    this.lever = new THREE.Group();
    this.lever.position.y = 0.045;
    this.tip = new THREE.MeshStandardMaterial({ color: 0x9aa1ad, roughness: 0.4 });
    this.lever.add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.007, 0.05, 16).translate(0, 0.025, 0),
        new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.9, roughness: 0.25 }),
      ),
      new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12).translate(0, 0.052, 0), this.tip),
    );
    this.root.add(this.lever);

    const legMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
    for (const x of [-0.035, 0.035]) {
      this.root.add(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.04, 0.012).translate(x, -0.012, 0), legMat));
    }
    this.addPin('a', 'Pin 1', new THREE.Vector3(-0.035, -0.032, 0), 0x8a9099);
    this.addPin('b', 'Pin 2', new THREE.Vector3(0.035, -0.032, 0), 0x8a9099);

    this.tagMeshes();
    this.update();
  }

  get closed() {
    return this._closed;
  }

  set closed(on: boolean) {
    this._closed = on;
    this.update();
  }

  private update() {
    this.lever.rotation.z = this._closed ? -LEVER_TILT : LEVER_TILT;
    this.tip.color.set(this._closed ? 0x34c759 : 0x9aa1ad);
  }
}
