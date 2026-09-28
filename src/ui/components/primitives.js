import { el } from '../../core/dom.js';
import { icon } from './icon.js';

export function avatar(person, size = 32) {
  return el(
    'span',
    {
      class: 'ava',
      style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.5)}px` },
      'aria-hidden': 'true',
    },
    person?.avatar ?? '🙂',
  );
}

export function button(label, { variant = 'default', small = false, onClick, disabled, className } = {}) {
  return el(
    'button',
    {
      class: ['btn', variant !== 'default' && `btn--${variant}`, small && 'btn--sm', className]
        .filter(Boolean)
        .join(' '),
      type: 'button',
      disabled: Boolean(disabled),
      onClick,
    },
    label,
  );
}

export function iconButton(name, { label, fallback, size = 20, onClick } = {}) {
  return el(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': label, onClick },
    icon(name, { size, fallback }),
  );
}

export function tabs(items, activeId, onSelect, { label = 'Tabs' } = {}) {
  return el(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': label },
    items.map((item) =>
      el(
        'button',
        {
          class: 'tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(item.id === activeId),
          onClick: () => onSelect(item.id),
        },
        item.label,
      ),
    ),
  );
}

export function row(children, { className } = {}) {
  return el('div', { class: ['row', className].filter(Boolean).join(' ') }, children);
}

export function stat({ value, label, onClick }) {
  const node = el('button', { class: 'stat', type: 'button', onClick }, [
    el('b', {}, String(value)),
    el('span', {}, label),
  ]);
  return node;
}

export function widget(title, body) {
  const items = Array.isArray(body) ? body : [body];
  return el('div', { class: 'widget' }, [el('h3', {}, title), ...items]);
}

export function fileChip(name, { onRemove } = {}) {
  return el('span', { class: 'filechip' }, [
    icon('lucide:file-text', { size: '1em', fallback: '📄' }),
    name,
    onRemove
      ? el(
          'button',
          { class: 'fx', type: 'button', 'aria-label': `Remove ${name}`, onClick: onRemove },
          '✕',
        )
      : null,
  ]);
}

export function noteBox(message, tone = 'info') {
  return el('div', { class: tone === 'warn' ? 'warnbox' : 'notebox' }, message);
}

export function spinner(label = 'Working…') {
  return el('span', { class: 'spinner-wrap' }, [
    el('span', { class: 'spinner', 'aria-hidden': 'true' }),
    el('span', {}, label),
  ]);
}

export function emptyState(message) {
  return el('p', { class: 'muted small' }, message);
}

export function pageTitle(text) {
  return el('h1', {}, text);
}

export function segmented(items, activeId, onSelect, { label = 'Options', columns } = {}) {
  return el(
    'div',
    {
      class: 'seg',
      role: 'group',
      'aria-label': label,
      style: columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : null,
    },
    items.map((item) =>
      el(
        'button',
        {
          class: `seg__btn${item.id === activeId ? ' is-on' : ''}`,
          type: 'button',
          'aria-pressed': String(item.id === activeId),
          onClick: () => onSelect(item.id),
        },
        item.label,
      ),
    ),
  );
}

export function swatchGroup(items, activeId, onSelect, { label = 'Accent' } = {}) {
  return el(
    'div',
    { class: 'swatches', role: 'group', 'aria-label': label },
    items.map((item) =>
      el('button', {
        class: `swatch${item.id === activeId ? ' is-on' : ''}`,
        type: 'button',
        style: { background: item.color },
        'aria-label': item.label,
        'aria-pressed': String(item.id === activeId),
        onClick: () => onSelect(item.id),
      }),
    ),
  );
}

export function switchRow(label, checked, onChange) {
  return el('div', { class: 'row' }, [
    el('span', { class: 'switch__label' }, label),
    el('span', { class: 'spacer' }),
    el(
      'button',
      {
        class: `switch${checked ? ' is-on' : ''}`,
        type: 'button',
        role: 'switch',
        'aria-checked': String(checked),
        'aria-label': label,
        onClick: () => onChange(!checked),
      },
      el('span', { class: 'switch__dot', 'aria-hidden': 'true' }),
    ),
  ]);
}

export function listButton(label, onClick, { tone } = {}) {
  return el(
    'button',
    { class: `listrow${tone ? ` listrow--${tone}` : ''}`, type: 'button', onClick },
    label,
  );
}
