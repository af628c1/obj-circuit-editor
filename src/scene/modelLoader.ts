import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

/** Target size (bounding-box diagonal) the model is scaled to, in scene units. */
const TARGET_SIZE = 2.5;
/** Give up waiting for textures after this long and show the model anyway. */
const TEXTURE_TIMEOUT_MS = 15000;
/** Stand-in for textures the user didn't provide, so nothing hits the network. */
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

/** Used when a model comes without an .mtl. */
export const modelMaterial = new THREE.MeshStandardMaterial({
  color: 0xd9dce3,
  roughness: 0.65,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

export interface LoadedModel {
  model: THREE.Group;
  /** Non-fatal problems worth telling the user about (missing .mtl, textures). */
  warnings: string[];
}

/** Resolves a file name referenced by the OBJ/MTL to a loadable URL, if we have it. */
type Resolver = (name: string) => string | undefined;

const baseName = (path: string) => path.split(/[\\/]/).pop()!.toLowerCase();
const isObj = (f: File) => /\.obj$/i.test(f.name);
const isMtl = (f: File) => /\.mtl$/i.test(f.name);

/** Names of the material libraries an OBJ refers to via `mtllib`. */
export function mtlLibs(objText: string): string[] {
  return [...objText.matchAll(/^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]);
}

/**
 * Parse MTL text into materials, loading any textures through `resolve`.
 * Resolves once the textures have finished (or failed) loading.
 */
async function loadMaterials(mtlText: string, resolve: Resolver, warnings: string[]) {
  const missing = new Set<string>();
  let started = false;
  let finish!: () => void;
  const finished = new Promise<void>((r) => (finish = r));

  const manager = new THREE.LoadingManager(() => finish());
  manager.onStart = () => (started = true);
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const resolved = resolve(url);
    if (!resolved) missing.add(url.split(/[\\/]/).pop()!);
    return resolved ?? BLANK_PNG;
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  const loader = new MTLLoader(manager);
  loader.setMaterialOptions({ side: THREE.DoubleSide });
  const materials = loader.parse(mtlText, '');
  materials.preload();

  if (started) {
    await Promise.race([finished, new Promise((r) => setTimeout(r, TEXTURE_TIMEOUT_MS))]);
  }
  if (missing.size) {
    const many = missing.size > 1;
    warnings.push(
      `Missing texture${many ? 's' : ''}: ${[...missing].join(', ')}. Open ${many ? 'them' : 'it'} together with the .obj.`,
    );
  }
  return materials;
}

/**
 * Build a model from OBJ text: apply its materials if the .mtl is available,
 * then center it on the origin, rest it on the ground and scale it to fit.
 */
async function buildModel(objText: string, mtlNames: string[], resolve: Resolver): Promise<LoadedModel> {
  const warnings: string[] = [];

  const mtlTexts: string[] = [];
  for (const name of mtlNames) {
    const url = resolve(name);
    const res = url ? await fetch(url).catch(() => null) : null;
    if (res?.ok) mtlTexts.push(await res.text());
    else warnings.push(`This model uses "${name}". Open it together with the .obj to see its colors.`);
  }

  const loader = new OBJLoader();
  const hasMaterials = mtlTexts.length > 0;
  if (hasMaterials) loader.setMaterials(await loadMaterials(mtlTexts.join('\n'), resolve, warnings));
  const obj = loader.parse(objText);

  let meshes = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes++;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      if (!hasMaterials) child.material = modelMaterial;
    }
  });
  if (meshes === 0) throw new Error('No geometry found in this OBJ file.');

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  if (!isFinite(size) || size === 0) throw new Error('This OBJ file has no usable geometry.');

  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box.min.y, -center.z);

  const model = new THREE.Group();
  model.name = 'model';
  model.scale.setScalar(TARGET_SIZE / size);
  model.add(obj);
  return { model, warnings };
}

/**
 * Load a model from files the user picked or dropped: one .obj plus,
 * optionally, its .mtl and texture images.
 */
export async function readModelFiles(files: File[]): Promise<LoadedModel> {
  const obj = files.find(isObj);
  if (!obj) {
    throw new Error(
      files.length === 1 ? `"${files[0].name}" is not an .obj file.` : 'Include an .obj file with your selection.',
    );
  }

  const urls = new Map(files.map((f) => [baseName(f.name), URL.createObjectURL(f)]));
  const resolve: Resolver = (name) => urls.get(baseName(name));
  try {
    const text = await obj.text();
    // Use the libraries the OBJ names. If none of those were provided but some
    // other .mtl was (e.g. it was renamed), use that instead.
    const refs = mtlLibs(text);
    const provided = files.filter(isMtl).map((f) => f.name);
    const mtlNames = refs.some((r) => resolve(r)) || provided.length === 0 ? refs : provided;
    return await buildModel(text, mtlNames, resolve);
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

/** Load a model from a URL; its .mtl and textures are looked up next to it. */
export async function fetchModel(url: string): Promise<LoadedModel> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  const text = await res.text();
  const base = new URL(url, location.href);
  return buildModel(text, mtlLibs(text), (name) => new URL(name.replace(/\\/g, '/'), base).href);
}

const materialsOf = (root: THREE.Object3D) => {
  const out = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => out.add(m));
  });
  return out;
};

/** See-through mode so wiring behind or inside the model stays visible. */
export function setModelXray(root: THREE.Object3D, on: boolean) {
  for (const m of materialsOf(root)) {
    // Remember the material's own settings so turning X-ray off restores them.
    m.userData.xrayOriginal ??= { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    const orig = m.userData.xrayOriginal;
    m.transparent = on || orig.transparent;
    m.opacity = on ? Math.min(orig.opacity, 0.3) : orig.opacity;
    m.depthWrite = on ? false : orig.depthWrite;
    m.needsUpdate = true;
  }
}

/** Free GPU resources held by a model. */
export function disposeModel(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  for (const m of materialsOf(root)) {
    if (m === modelMaterial) continue;
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
    m.dispose();
  }
}
