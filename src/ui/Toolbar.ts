import type { Editor, Mode } from '../editor/Editor';

/** Edit / Simulate toggle in the top bar. */
export function mountModeToggle(el: HTMLElement, editor: Editor) {
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  const render = () => {
    for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.mode === editor.mode));
  };
  for (const b of buttons) b.addEventListener('click', () => editor.setMode(b.dataset.mode as Mode));
  editor.addEventListener('change', render);
  render();
}

/** Show a short-lived message over the viewport. */
export function mountToasts(el: HTMLElement, editor: Editor) {
  editor.addEventListener('toast', (e) => {
    const { message, level } = (e as CustomEvent<{ message: string; level: string }>).detail;
    const t = document.createElement('div');
    t.className = `toast ${level}`;
    t.textContent = message;
    el.appendChild(t);
    setTimeout(() => t.remove(), level === 'warn' ? 4000 : 2600);
  });
}
