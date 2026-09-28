import { el } from '../../core/dom.js';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

const KIND_CLASS = Object.freeze({
  dialog: 'overlay',
  drawer: 'overlay overlay--drawer',
  'drawer-wide': 'overlay overlay--drawer overlay--drawer-wide',
});

export function createOverlayHost({ root = document.body } = {}) {
  const layer = el('div', { class: 'overlay-layer' });
  root.append(layer);
  const stack = [];

  function focusables(node) {
    return [...node.querySelectorAll(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
  }

  function close(entry, result) {
    if (entry.closed) return;
    entry.closed = true;
    entry.node.remove();
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    if (entry.trigger && document.contains(entry.trigger)) entry.trigger.focus();
    entry.onClose?.(result);
  }

  function open({ content, kind = 'dialog', label = 'Dialog', onClose, closeOnBackdrop = true }) {
    const overlay = el('div', { class: KIND_CLASS[kind] ?? KIND_CLASS.dialog });
    const panel = el(
      'div',
      {
        class: `panel panel--${kind}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': label,
        tabindex: '-1',
      },
      content,
    );
    overlay.append(panel);

    const entry = { node: overlay, panel, trigger: document.activeElement, onClose, closed: false };
    stack.push(entry);

    overlay.addEventListener('mousedown', (event) => {
      if (closeOnBackdrop && event.target === overlay) close(entry, null);
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(entry, null);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables(panel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    layer.append(overlay);
    const items = focusables(panel);
    (items[0] ?? panel).focus?.();

    return { panel, node: overlay, close: (result) => close(entry, result) };
  }

  function closeAll() {
    [...stack].forEach((entry) => close(entry, null));
  }

  return { open, closeAll };
}
