import { SIZE_RANGE, type Editor } from '../editor/Editor';
import type { Interaction, MoveMode } from '../editor/interaction';
import { DELAY_RANGE, Delay } from '../parts/Delay';
import { LED_COLORS, Led } from '../parts/Led';
import type { Part } from '../parts/Part';
import { partInfo } from '../parts/registry';
import { Switch } from '../parts/Switch';

// The size slider is logarithmic so 20%–500% feels even, with 100% in the middle.
const LOG_RANGE = Math.log(SIZE_RANGE.max / SIZE_RANGE.min);
const sliderToSize = (v: number) => SIZE_RANGE.min * Math.exp((v / 1000) * LOG_RANGE);
const sizeToSlider = (size: number) => Math.round((Math.log(size / SIZE_RANGE.min) / LOG_RANGE) * 1000);
const percent = (size: number) => `${Math.round(size * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
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
      const switchRow =
        part instanceof Switch
          ? `<div class="row"><span class="label">State</span><div class="segmented">
              <button data-switch="off" aria-selected="${!part.closed}">Off</button>
              <button data-switch="on" aria-selected="${part.closed}">On</button>
            </div></div>`
          : '';
      const delayRow =
        part instanceof Delay
          ? `<div class="row"><span class="label">Delay <span class="value" data-delay-value>${seconds(part.delayMs)}</span></span>
              <input type="range" data-delay min="${DELAY_RANGE.min}" max="${DELAY_RANGE.max}" step="${DELAY_RANGE.step}" value="${part.delayMs}" aria-label="Delay time" /></div>`
          : '';
      const mode = interaction.moveMode;
      el.innerHTML = `
        <div class="inspector-head"><h2>${partInfo(part.type).name}</h2><span class="id">${part.id}</span></div>
        <div class="row">
          <span class="label">Move by</span>
          <div class="segmented">
            <button data-move="slide" aria-selected="${mode === 'slide'}" title="Drag the part over the model's surface (Q)">Sliding</button>
            <button data-move="translate" aria-selected="${mode === 'translate'}" title="Arrows for moving freely in 3D (W)">Arrows</button>
            <button data-move="rotate" aria-selected="${mode === 'rotate'}" title="Rings for rotating (E)">Rotate</button>
          </div>
        </div>
        <div class="row">
          <span class="label">Size <span class="value" data-size-value>${percent(part.size)}</span></span>
          <input type="range" data-size min="0" max="1000" step="1" value="${sizeToSlider(part.size)}" aria-label="Part size" />
          <button class="link-btn" data-action="size-all" title="Give every part this size">Same size for all parts</button>
        </div>
        ${colorRow}${switchRow}${delayRow}
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
    if (t.dataset.action === 'size-all' && sel?.kind === 'part') {
      editor.setAllPartSizes(sel.part.size);
      editor.toast(`All parts set to ${percent(sel.part.size)}`);
    }
    if (t.dataset.move) interaction.setMoveMode(t.dataset.move as MoveMode);
    if (t.dataset.switch && sel?.kind === 'part' && sel.part instanceof Switch) {
      sel.part.closed = t.dataset.switch === 'on';
      render();
    }
    if (t.dataset.color && sel?.kind === 'part' && sel.part instanceof Led) {
      sel.part.color = t.dataset.color;
      render();
    }
  });

  // Update the slider's label live without re-rendering (which would end the drag).
  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const sel = editor.selection;
    if (input.matches('[data-size]') && sel?.kind === 'part') {
      editor.setPartSize(sel.part, sliderToSize(Number(input.value)), false);
      el.querySelector('[data-size-value]')!.textContent = percent(sel.part.size);
      return;
    }
    if (!input.matches('[data-delay]') || sel?.kind !== 'part' || !(sel.part instanceof Delay)) return;
    sel.part.delayMs = Number(input.value);
    el.querySelector('[data-delay-value]')!.textContent = seconds(sel.part.delayMs);
  });

  // Re-render once the size slider is released (e.g. to refresh anything else shown).
  el.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('[data-size]')) render();
  });

  editor.addEventListener('change', render);
  interaction.addEventListener('change', render);
  render();
}
