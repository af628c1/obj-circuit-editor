import * as THREE from 'three';
import { Part } from './Part';

export const LED_COLORS: Record<string, number> = {
  red: 0xff3b30,
  green: 0x34c759,
  blue: 0x2f7bff,
  yellow: 0xffcc00,
  white: 0xf5f5f5,
};

/** 5 mm through-hole LED. Origin sits where the legs leave the body. */
export class Led extends Part {
  private readonly lens: THREE.MeshPhysicalMaterial;
  private readonly glow: THREE.PointLight;
  private _color = 'red';
  private _lit = false;

  constructor(id: string) {
    super(id, 'led');

    this.lens = new THREE.MeshPhysicalMaterial({
      roughness: 0.15,
      transmission: 0.35,
      thickness: 0.02,
      transparent: true,
      opacity: 0.88,
    });

    const r = 0.03;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.045, 32).translate(0, 0.0225 + 0.008, 0), this.lens);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.053, 0),
      this.lens,
    );
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.008, 32).translate(0, 0.004, 0), this.lens);
    this.root.add(body, dome, rim);

    const leadMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
    const lead = (x: number, len: number) =>
      new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, len, 8).translate(x, -len / 2, 0), leadMat);
    // Anode is the long leg, as on a real LED.
    this.root.add(lead(0.0125, 0.08), lead(-0.0125, 0.065));

    this.addPin('anode', 'Anode (+)', new THREE.Vector3(0.0125, -0.08, 0), 0xd64545);
    this.addPin('cathode', 'Cathode (−)', new THREE.Vector3(-0.0125, -0.065, 0), 0x3a3f4a);

    this.glow = new THREE.PointLight(0xffffff, 0, 0.9, 2);
    // Above the dome rather than inside it, so the lens itself isn't blown out to white.
    this.glow.position.set(0, 0.12, 0);
    this.root.add(this.glow);

    this.tagMeshes();
    this.update();
  }

  get color() {
    return this._color;
  }

  set color(name: string) {
    if (!(name in LED_COLORS)) return;
    this._color = name;
    this.update();
  }

  get lit() {
    return this._lit;
  }

  set lit(on: boolean) {
    if (on === this._lit) return;
    this._lit = on;
    this.update();
  }

  private update() {
    const c = LED_COLORS[this._color];
    // Unlit LEDs are a deeper, dimmer shade so lit ones clearly stand out.
    this.lens.color.set(c).multiplyScalar(this._lit ? 1 : 0.55);
    this.lens.emissive.set(c);
    this.lens.emissiveIntensity = this._lit ? 1 : 0;
    this.glow.color.set(c);
    this.glow.intensity = this._lit ? 0.8 : 0;
  }
}
