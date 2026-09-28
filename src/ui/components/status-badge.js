import { el } from '../../core/dom.js';
import { icon } from './icon.js';

const TONES = Object.freeze({
  ok: { name: 'lucide:circle-check', fallback: '●' },
  warn: { name: 'lucide:triangle-alert', fallback: '▲' },
  err: { name: 'lucide:circle-x', fallback: '✕' },
  info: { name: 'lucide:info', fallback: 'ℹ' },
  key: { name: 'lucide:key', fallback: '◆' },
  muted: { name: 'lucide:circle', fallback: '•' },
});

export function statusBadge(label, tone = 'muted') {
  const resolved = TONES[tone] ? tone : 'muted';
  const token = TONES[resolved];

  return el('span', { class: `badge badge--${resolved}` }, [
    el('span', { class: 'badge__icon' }, icon(token.name, { size: '1em', fallback: token.fallback })),
    el('span', {}, label),
  ]);
}
