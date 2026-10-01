import * as THREE from 'three';
import './style.css';
import { Editor } from './editor/Editor';
import { Interaction } from './editor/interaction';
import { fetchObj, readObjFile, setModelXray } from './scene/modelLoader';
import { Viewport } from './scene/Viewport';
import type { PartType } from './sim/circuit';
import { mountInspector } from './ui/Inspector';
import { mountSidebar, PART_MIME } from './ui/Sidebar';
import { mountModeToggle, mountToasts } from './ui/Toolbar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $('stage');
const viewport = new Viewport($('viewport'));
const editor = new Editor(viewport);
const interaction = new Interaction(editor, viewport);

// ---- theme ----------------------------------------------------------------

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
viewport.setDark(darkQuery.matches);
darkQuery.addEventListener('change', (e) => viewport.setDark(e.matches));

// ---- model loading --------------------------------------------------------

const fileInput = $<HTMLInputElement>('file-input');

async function loadModel(load: Promise<THREE.Group>) {
  try {
    editor.setModel(await load);
  } catch (err) {
    editor.toast(err instanceof Error ? err.message : 'Could not load that file.', 'warn');
  }
}

$('open-obj').addEventListener('click', () => fileInput.click());
$('empty-open').addEventListener('click', () => fileInput.click());
$('load-sample').addEventListener('click', () => loadModel(fetchObj(`${import.meta.env.BASE_URL}samples/enclosure.obj`)));
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadModel(readObjFile(file));
  fileInput.value = '';
});

const xray = $('xray');
xray.addEventListener('click', () => {
  const on = xray.getAttribute('aria-pressed') !== 'true';
  xray.setAttribute('aria-pressed', String(on));
  setModelXray(on);
});

// ---- adding parts ---------------------------------------------------------

const raycaster = new THREE.Raycaster();

/** Where a part dropped at `ndc` should go: on the model if hit, else the ground. */
function placementAt(ndc: THREE.Vector2): { position: THREE.Vector3; normal?: THREE.Vector3 } {
  raycaster.setFromCamera(ndc, viewport.camera);
  const hit = editor.model ? raycaster.intersectObject(editor.model, true)[0] : undefined;
  if (hit?.face) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    // Models are double sided; make sure the part faces the viewer.
    if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
    return { position: hit.point, normal };
  }
  const ground = raycaster.intersectObject(viewport.ground)[0];
  return { position: ground ? ground.point : viewport.controls.target.clone() };
}

let clickAdds = 0;
function addFromPalette(type: PartType) {
  if (editor.mode !== 'edit') return;
  // Fan click-added parts out a little so they don't stack on each other.
  const spread = ((clickAdds++ % 5) - 2) * 0.12;
  const { position, normal } = placementAt(new THREE.Vector2(spread, 0));
  editor.addPart(type, position, normal);
}

const sidebar = mountSidebar($('palette'), addFromPalette);

// ---- drag & drop ----------------------------------------------------------

const dropOverlay = $('drop-overlay');
const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');

stage.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes(PART_MIME)) {
    if (editor.mode !== 'edit') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  } else if (hasFiles(e)) {
    e.preventDefault();
    dropOverlay.hidden = false;
  }
});
stage.addEventListener('dragleave', (e) => {
  if (!stage.contains(e.relatedTarget as Node)) dropOverlay.hidden = true;
});
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.hidden = true;
  const type = e.dataTransfer?.getData(PART_MIME) as PartType | undefined;
  if (type) {
    const { position, normal } = placementAt(viewport.ndc(e));
    editor.addPart(type, position, normal);
    return;
  }
  const file = e.dataTransfer?.files[0];
  if (file) loadModel(readObjFile(file));
});

// ---- chrome ---------------------------------------------------------------

mountModeToggle($('mode-toggle'), editor);
mountInspector($('inspector'), editor, interaction);
mountToasts($('toasts'), editor);

const emptyState = $('empty-state');
const hint = $('hint');

function renderChrome() {
  emptyState.hidden = editor.model !== null || editor.parts.size > 0;
  sidebar.setEnabled(editor.mode === 'edit');

  if (!emptyState.hidden && editor.mode === 'edit') hint.innerHTML = '';
  else if (editor.mode === 'simulate') hint.innerHTML = '<strong>Click and hold</strong> a push button to press it';
  else if (interaction.pending) hint.innerHTML = 'Click another pin to connect · <strong>Esc</strong> to cancel';
  else if (editor.parts.size === 0) hint.innerHTML = 'Drag components from the sidebar onto your model';
  else hint.innerHTML = '<strong>Click a pin</strong> to start a wire · drag to orbit · scroll to zoom';
}

editor.addEventListener('change', renderChrome);
interaction.addEventListener('change', renderChrome);
renderChrome();

// Handle for automated tests and console tinkering.
Object.assign(window, { app: { editor, interaction, viewport } });
