import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/** Target size (bounding-box diagonal) the model is scaled to, in scene units. */
const TARGET_SIZE = 2.5;

export const modelMaterial = new THREE.MeshStandardMaterial({
  color: 0xd9dce3,
  roughness: 0.65,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

/**
 * Parse OBJ text into a group that is centered on the origin, resting on the
 * ground plane, scaled to a comfortable size and given a neutral material.
 */
export function parseObj(text: string): THREE.Group {
  const obj = new OBJLoader().parse(text);
  let meshes = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes++;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      child.material = modelMaterial;
    }
  });
  if (meshes === 0) throw new Error('No geometry found in this OBJ file.');

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  if (!isFinite(size) || size === 0) throw new Error('This OBJ file has no usable geometry.');

  const center = box.getCenter(new THREE.Vector3());
  const scale = TARGET_SIZE / size;
  obj.position.set(-center.x, -box.min.y, -center.z);

  const root = new THREE.Group();
  root.name = 'model';
  root.scale.setScalar(scale);
  root.add(obj);
  return root;
}

/** See-through mode so wiring behind or inside the model stays visible. */
export function setModelXray(on: boolean) {
  modelMaterial.transparent = on;
  modelMaterial.opacity = on ? 0.3 : 1;
  modelMaterial.depthWrite = !on;
  modelMaterial.needsUpdate = true;
}

export async function readObjFile(file: File): Promise<THREE.Group> {
  if (!file.name.toLowerCase().endsWith('.obj')) throw new Error(`"${file.name}" is not an .obj file.`);
  return parseObj(await file.text());
}

export async function fetchObj(url: string): Promise<THREE.Group> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return parseObj(await res.text());
}
