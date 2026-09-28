import { el } from '../../core/dom.js';

const TOAST_TTL = 2200;
const TONES = ['toast--ok', 'toast--warn', 'toast--err', 'toast--info'];

export function createToastHost({ bus, root }) {
  const node = el('div', { class: 'toast toast--info', role: 'status', 'aria-live': 'polite' });
  let timer = null;

  function hide() {
    clearTimeout(timer);
    node.classList.remove('is-show');
  }

  function push(input) {
    const { message, tone = 'info' } = typeof input === 'string' ? { message: input } : input;

    node.classList.remove(...TONES);
    node.classList.add(`toast--${tone}`);
    node.textContent = message;

    node.classList.remove('is-show');
    void node.offsetWidth;
    node.classList.add('is-show');

    clearTimeout(timer);
    timer = setTimeout(hide, TOAST_TTL);
  }

  node.addEventListener('click', hide);
  root.append(node);
  bus.on('toast', push);

  return { push, hide };
}
