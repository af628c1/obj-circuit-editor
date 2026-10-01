import { PARTS } from '../parts/registry';
import type { PartType } from '../sim/circuit';

export const PART_MIME = 'application/x-obj-circuit-part';

/** Render the component palette. Click a card to start placing it, or drag it onto the model. */
export function mountSidebar(container: HTMLElement, onAdd: (type: PartType) => void) {
  for (const info of PARTS) {
    const card = document.createElement('button');
    card.className = 'part-card';
    card.draggable = true;
    card.dataset.type = info.type;
    card.title = info.description;
    card.innerHTML = `
      <span class="part-icon">${info.icon}</span>
      <span><div class="part-name">${info.name}</div><div class="part-desc">${info.description}</div></span>`;
    card.addEventListener('click', () => onAdd(info.type));
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData(PART_MIME, info.type);
      e.dataTransfer!.effectAllowed = 'copy';
    });
    container.appendChild(card);
  }

  const cards = () => container.querySelectorAll<HTMLButtonElement>('.part-card');
  return {
    setEnabled(enabled: boolean) {
      cards().forEach((c) => (c.disabled = !enabled));
    },
    /** Highlight the card whose part is being placed. */
    setActive(type: PartType | null) {
      cards().forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === type)));
    },
  };
}
