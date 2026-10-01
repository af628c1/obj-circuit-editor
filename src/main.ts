import './style.css';
import { Editor } from './editor/Editor';
import { Interaction } from './editor/interaction';
import { fetchModel, readModelFiles, setModelXray, type LoadedModel } from './scene/modelLoader';
import { Viewport } from './scene/Viewport';
import type { PartType } from './sim/circuit';
import { partInfo } from './parts/registry';
import { mountInspector } from './ui/Inspector';
import { mountSidebar, PART_MIME } from './ui/Sidebar';
import { mountModeToggle, mountToasts } from './ui/Toolbar';
import { watchForUpdates } from './ui/updateCheck';

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

const xray = $('xray');
let xrayOn = false;

async function loadModel(load: Promise<LoadedModel>) {
  try {
    const { model, warnings } = await load;
    setModelXray(model, xrayOn);
    editor.setModel(model);
    for (const w of warnings) editor.toast(w, 'warn');
  } catch (err) {
    editor.toast(err instanceof Error ? err.message : 'Could not load that file.', 'warn');
  }
}

$('open-obj').addEventListener('click', () => fileInput.click());
$('empty-open').addEventListener('click', () => fileInput.click());
$('load-sample').addEventListener('click', () => loadModel(fetchModel(`${import.meta.env.BASE_URL}samples/enclosure.obj`)));
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length) loadModel(readModelFiles(files));
  fileInput.value = '';
});

xray.addEventListener('click', () => {
  xrayOn = !xrayOn;
  xray.setAttribute('aria-pressed', String(xrayOn));
  if (editor.model) setModelXray(editor.model, xrayOn);
});

// ---- adding parts ---------------------------------------------------------

// Clicking a card arms it; the next tap on the model places it (see Interaction).
const sidebar = mountSidebar($('palette'), (type) => interaction.startPlacing(type));

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
    interaction.cancelPlacing();
    const { position, normal } = interaction.surfaceAt(viewport.ndc(e));
    editor.addPart(type, position, normal);
    return;
  }
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length) loadModel(readModelFiles(files));
});

// ---- chrome ---------------------------------------------------------------

mountModeToggle($('mode-toggle'), editor);
mountInspector($('inspector'), editor, interaction);
mountToasts($('toasts'), editor);

const emptyState = $('empty-state');
const hint = $('hint');

hint.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-action="cancel-place"]')) interaction.cancelPlacing();
});

function renderChrome() {
  emptyState.hidden = editor.model !== null || editor.parts.size > 0;
  sidebar.setEnabled(editor.mode === 'edit');
  sidebar.setActive(interaction.placing);

  if (!emptyState.hidden && editor.mode === 'edit') hint.innerHTML = '';
  else if (editor.mode === 'simulate') hint.innerHTML = '<strong>Hold</strong> a push button to press it · <strong>tap</strong> a switch to flip it';
  else if (interaction.placing)
    hint.innerHTML = `Tap your model to place the <strong>${partInfo(interaction.placing).name}</strong> <button data-action="cancel-place">Cancel</button>`;
  else if (interaction.pending) hint.innerHTML = 'Click another pin to connect · <strong>Esc</strong> to cancel';
  else if (editor.parts.size === 0) hint.innerHTML = 'Tap a component in the sidebar, then tap your model to place it';
  else if (editor.selection?.kind === 'wire') hint.innerHTML = 'Drag either end off its pin to remove the wire';
  else if (editor.selection?.kind === 'part') hint.innerHTML = '<strong>Drag</strong> the part to slide it over your model';
  else hint.innerHTML = '<strong>Drag from a pin</strong> to another pin to wire them · tap a part or wire to select it';
}

editor.addEventListener('change', renderChrome);
interaction.addEventListener('change', renderChrome);
renderChrome();

watchForUpdates(stage);

// Handle for automated tests and console tinkering.
Object.assign(window, { app: { editor, interaction, viewport } });
