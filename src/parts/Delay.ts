import * as THREE from 'three';
import { Part } from './Part';

export const DELAY_RANGE = { min: 100, max: 3000, step: 100, default: 500 };

function labelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f2329';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e8eaee';
  g.textAlign = 'center';
  g.font = 'bold 34px system-ui, sans-serif';
  g.fillText('DELAY', 128, 52);
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillStyle = '#f2b705';
  g.fillText('IN  ➜  OUT', 128, 98);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Delay line: whatever happens at IN happens at OUT `delayMs` later. When IN
 * gets power, OUT starts driving after the delay; when IN loses it, OUT
 * stops after the delay. Pulses of any length pass through intact, and OUT
 * is driven by the module itself, so a chain of delays carries a pulse all
 * the way along. Origin is the bottom of the board.
 */
export class Delay extends Part {
  delayMs = DELAY_RANGE.default;
  /** IN currently has power. */
  energized = false;
  /** OUT is currently being driven (the delay has fired). */
  conducting = false;

  private readonly status: THREE.MeshStandardMaterial;

  constructor(id: string) {
    super(id, 'delay');

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.01, 0.07).translate(0, 0.005, 0),
      new THREE.MeshStandardMaterial({ color: 0x1d6b48, roughness: 0.7 }),
    );
    const top = new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.5 });
    const side = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.5 });
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z. Label goes on top.
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.04).translate(0, 0.018, -0.006), [
      side, side, top, side, side, side,
    ]);
    this.status = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.3 });
    const statusLed = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12).translate(0, 0.012, 0.024), this.status);
    this.root.add(board, chip, statusLed);

    const legMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
    for (const x of [-0.05, 0.05]) {
      this.root.add(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.006).translate(x, -0.015, 0), legMat));
    }
    this.addPin('in', 'IN', new THREE.Vector3(-0.05, -0.032, 0), 0x8a9099);
    this.addPin('out', 'OUT', new THREE.Vector3(0.05, -0.032, 0), 0xd64545);

    this.tagMeshes();
    this.setState(false, false);
  }

  /** Status light: green while OUT is driven, amber while a signal is on its way, off when idle. */
  setState(energized: boolean, conducting: boolean) {
    this.energized = energized;
    this.conducting = conducting;
    const color = conducting ? 0x34c759 : energized ? 0xf5a524 : 0x3a3f4a;
    this.status.color.set(color);
    this.status.emissive.set(color);
    this.status.emissiveIntensity = conducting || energized ? 1.6 : 0;
  }
}
