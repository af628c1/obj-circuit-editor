import type { Editor } from '../editor/Editor';
import type { Interaction } from '../editor/interaction';
import { LED_COLORS, Led } from '../parts/Led';
import type { Part } from '../parts/Part';
import { partInfo } from '../parts/registry';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Floating card describing the current selection. */
export function mountInspector(el: HTMLElement, editor: Editor, interaction: Interaction) {
  const pinLabel = (part: Part, pin: string) => `${part.id} · ${part.pin(pin).label}`;

  const render = () => {
    const sel = editor.selection;
    el.hidden = !sel || editor.mode !== 'edit';
    if (el.hidden || !sel) return;

    if (sel.kind === 'wire') {
      const { from, to } = sel.wire;
      el.innerHTML = `
        <div class="inspector-head"><h2>Wire</h2><span class="id">${sel.wire.id}</span></div>
        <div class="row">
          <span class="label">Connects</span>
          <ul class="pins">
            <li>${pinLabel(from.part, from.pin)}</li>
            <li>${pinLabel(to.part, to.pin)}</li>
          </ul>
        </div>
        <div class="actions"><button class="btn btn-sm btn-danger" data-action="delete">Delete wire</button></div>`;
    } else {
      const part = sel.part;
      const connections = (pin: string) =>
        editor.wires.filter(
          (w) => (w.from.part === part && w.from.pin === pin) || (w.to.part === part && w.to.pin === pin),
        ).length;
      const colorRow =
        part instanceof Led
          ? `<div class="row"><span class="label">Color</span><div class="swatches">${Object.entries(LED_COLORS)
              .map(
                ([name, c]) =>
                  `<button class="swatch" title="${name}" data-color="${name}" aria-pressed="${part.color === name}" style="background:${hex(c)}"></button>`,
              )
              .join('')}</div></div>`
          : '';
      const mode = interaction.gizmoMode;
      el.innerHTML = `
        <div class="inspector-head"><h2>${partInfo(part.type).name}</h2><span class="id">${part.id}</span></div>
        <div class="row">
          <span class="label">Transform</span>
          <div class="segmented">
            <button data-gizmo="translate" aria-selected="${mode === 'translate'}">Move <kbd>W</kbd></button>
            <button data-gizmo="rotate" aria-selected="${mode === 'rotate'}">Rotate <kbd>E</kbd></button>
          </div>
        </div>
        ${colorRow}
        <div class="row">
          <span class="label">Pins</span>
          <ul class="pins">${part.pins
            .map((p) => {
              const n = connections(p.name);
              return `<li><span>${p.label}</span><span class="conn">${n ? `${n} wire${n > 1 ? 's' : ''}` : 'open'}</span></li>`;
            })
            .join('')}</ul>
        </div>
        <div class="actions"><button class="btn btn-sm btn-danger" data-action="delete">Delete</button></div>`;
    }
  };

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    const sel = editor.selection;
    if (t.dataset.action === 'delete') editor.deleteSelection();
    if (t.dataset.gizmo) interaction.setGizmoMode(t.dataset.gizmo as 'translate' | 'rotate');
    if (t.dataset.color && sel?.kind === 'part' && sel.part instanceof Led) {
      sel.part.color = t.dataset.color;
      render();
    }
  });

  editor.addEventListener('change', render);
  interaction.addEventListener('change', render);
  render();
}
