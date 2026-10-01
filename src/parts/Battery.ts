import * as THREE from 'three';
import { Part } from './Part';

function labelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f2329';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#f2b705';
  g.fillRect(0, 150, 128, 106);
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('9V', 64, 100);
  g.fillStyle = '#1f2329';
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('+  −', 64, 215);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 9 V battery standing upright, terminals on top. Origin is the bottom center. */
export class Battery extends Part {
  constructor(id: string) {
    super(id, 'battery');

    const w = 0.1;
    const h = 0.17;
    const d = 0.055;
    const side = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.5 });
    const front = new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.5 });
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), [
      side, side, side, side, front, front,
    ]);
    this.root.add(body);

    const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.9, roughness: 0.25 });
    const pos = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 20).translate(-0.025, h + 0.008, 0), metal);
    const neg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.014, 6).translate(0.025, h + 0.007, 0), metal);
    this.root.add(pos, neg);

    this.addPin('pos', 'Positive (+)', new THREE.Vector3(-0.025, h + 0.026, 0), 0xd64545);
    this.addPin('neg', 'Negative (−)', new THREE.Vector3(0.025, h + 0.024, 0), 0x3a3f4a);

    this.tagMeshes();
  }

  override pinWorldDirection(_name: string, target = new THREE.Vector3()) {
    return target.set(0, 1, 0).transformDirection(this.root.matrixWorld);
  }
}
