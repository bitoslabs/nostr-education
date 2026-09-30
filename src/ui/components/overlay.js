import { el } from '../../core/dom.js';
import { t } from '../../services/i18n/index.js';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

const KIND_CLASS = Object.freeze({
  dialog: 'overlay',
  drawer: 'overlay overlay--drawer',
  'drawer-wide': 'overlay overlay--drawer overlay--drawer-wide',
});

const SHEET_KINDS = new Set(['drawer', 'drawer-wide']);
const SHEET_DISMISS_MS = 240;

/* Drag-to-close for bottom sheets: swipe follows the finger, springs back
   below the threshold, dismisses past it. Mouse drag works on desktop. */
function makeSheetDraggable({ overlay, panel, onDismiss }) {
  const SPRING = 'transform .26s cubic-bezier(.16,1,.3,1)';
  let startY = 0;
  let dy = 0;
  let mode = null;
  let pointerId = null;

  const begin = (y) => {
    startY = y;
    dy = 0;
    mode = null;
    panel.style.transition = 'none';
    overlay.style.transition = 'none';
  };
  const settle = () => {
    panel.style.transition = SPRING;
    panel.style.transform = '';
    overlay.style.transition = 'opacity .2s ease';
    overlay.style.opacity = '';
    setTimeout(() => {
      panel.style.transition = '';
      overlay.style.transition = '';
    }, 280);
  };
  const move = (y, event) => {
    if (mode === 'scroll') return;
    dy = y - startY;
    if (mode === null) {
      if (Math.abs(dy) < 8) return;
      const atTop = panel.scrollTop <= 0;
      const topZone = startY - panel.getBoundingClientRect().top < 96;
      mode = dy > 0 && (atTop || topZone) ? 'drag' : 'scroll';
    }
    if (mode !== 'drag') return;
    if (event && event.cancelable) event.preventDefault();
    if (dy < 0) dy = 0;
    panel.style.transform = `translateY(${dy}px)`;
    overlay.style.opacity = String(Math.max(0.35, 1 - dy / 460));
  };
  const end = () => {
    const dragged = mode === 'drag';
    mode = null;
    if (!dragged) {
      panel.style.transition = '';
      overlay.style.transition = '';
      return;
    }
    const height = panel.offsetHeight || 1;
    if (dy > Math.min(150, height * 0.3)) onDismiss();
    else settle();
  };

  panel.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 1) begin(event.touches[0].clientY);
    },
    { passive: true },
  );
  panel.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length === 1) move(event.touches[0].clientY, event);
    },
    { passive: false },
  );
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);

  panel.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    pointerId = event.pointerId;
    begin(event.clientY);
    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
  });
  panel.addEventListener('pointermove', (event) => {
    if (pointerId === event.pointerId) move(event.clientY, null);
  });
  const pointerEnd = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    end();
  };
  panel.addEventListener('pointerup', pointerEnd);
  panel.addEventListener('pointercancel', pointerEnd);
}

export function createOverlayHost({ root = document.body } = {}) {
  const layer = el('div', { class: 'overlay-layer' });
  root.append(layer);
  const stack = [];

  function focusables(node) {
    return [...node.querySelectorAll(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
  }

  function close(entry, result, { animate = false } = {}) {
    if (entry.closed) return;
    entry.closed = true;
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
    if (entry.trigger && document.contains(entry.trigger)) entry.trigger.focus();
    entry.onClose?.(result);
    if (animate) {
      entry.node.classList.add('is-closing');
      setTimeout(() => entry.node.remove(), SHEET_DISMISS_MS);
    } else {
      entry.node.remove();
    }
  }

  function open({ content, kind = 'dialog', label = t('common.a11y.dialog'), onClose, closeOnBackdrop = true }) {
    const isSheet = SHEET_KINDS.has(kind);
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
    if (isSheet) panel.prepend(el('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }));
    overlay.append(panel);

    const entry = { node: overlay, panel, trigger: document.activeElement, onClose, closed: false };
    stack.push(entry);

    if (isSheet) makeSheetDraggable({ overlay, panel, onDismiss: () => close(entry, null, { animate: true }) });

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
